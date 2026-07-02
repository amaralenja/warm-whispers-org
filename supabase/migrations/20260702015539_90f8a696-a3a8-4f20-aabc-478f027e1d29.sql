GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_flow_runs TO authenticated;
GRANT ALL ON public.wa_flow_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_flow_executions TO authenticated;
GRANT ALL ON public.wa_flow_executions TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_create_wa_flow_run(
  _vendor_id bigint,
  _codigo text,
  _flow_id uuid,
  _conversation_id uuid DEFAULT NULL,
  _channel_id text DEFAULT NULL,
  _contact_wa_id text DEFAULT NULL,
  _current_node_id text DEFAULT NULL,
  _context jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public.wa_flow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  v_flow public.wa_flows%rowtype;
  v_conv public.wa_conversations%rowtype;
  v_run public.wa_flow_runs%rowtype;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN
    RAISE EXCEPTION 'Sessão de vendedor inválida';
  END IF;

  IF nullif(trim(coalesce(_channel_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Canal não informado';
  END IF;

  IF NOT (_channel_id = ANY(allowed)) THEN
    RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a este número';
  END IF;

  SELECT * INTO v_flow
  FROM public.vendor_get_flow(_vendor_id, _codigo, _flow_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fluxo não encontrado ou indisponível para esta operação';
  END IF;

  SELECT * INTO v_conv
  FROM public.vendor_resolve_wa_conversation(
    _vendor_id,
    _codigo,
    _conversation_id,
    _channel_id,
    _contact_wa_id
  )
  LIMIT 1;

  IF NOT FOUND AND _conversation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  INSERT INTO public.wa_flow_runs (
    flow_id,
    conversation_id,
    channel_id,
    contact_wa_id,
    current_node_id,
    status,
    context
  ) VALUES (
    _flow_id,
    coalesce(v_conv.id, _conversation_id),
    _channel_id,
    coalesce(nullif(_contact_wa_id, ''), v_conv.contact_wa_id),
    _current_node_id,
    'running',
    coalesce(_context, '{}'::jsonb) || jsonb_build_object('started_by_vendor_id', _vendor_id)
  )
  RETURNING * INTO v_run;

  RETURN NEXT v_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_update_wa_flow_run(
  _vendor_id bigint,
  _codigo text,
  _run_id uuid,
  _patch jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;

  UPDATE public.wa_flow_runs r
  SET
    current_node_id = CASE WHEN _patch ? 'current_node_id' THEN NULLIF(_patch->>'current_node_id', '') ELSE r.current_node_id END,
    status = CASE WHEN _patch ? 'status' THEN COALESCE(NULLIF(_patch->>'status', ''), r.status) ELSE r.status END,
    waiting_for = CASE WHEN _patch ? 'waiting_for' THEN NULLIF(_patch->>'waiting_for', '') ELSE r.waiting_for END,
    context = CASE WHEN _patch ? 'context' THEN COALESCE(_patch->'context', '{}'::jsonb) ELSE r.context END,
    expires_at = CASE WHEN _patch ? 'expires_at' THEN NULLIF(_patch->>'expires_at', '')::timestamptz ELSE r.expires_at END,
    error = CASE WHEN _patch ? 'error' THEN NULLIF(_patch->>'error', '') ELSE r.error END,
    updated_at = now()
  WHERE r.id = _run_id
    AND r.channel_id = ANY(allowed)
    AND EXISTS (
      SELECT 1
      FROM public.vendedores v
      WHERE v.id = _vendor_id
        AND v.codigo = _codigo
        AND coalesce(v.ativo, true) = true
    );

  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_insert_wa_flow_execution(
  _vendor_id bigint,
  _codigo text,
  _run_id uuid,
  _node_id text,
  _node_type text,
  _status text,
  _output jsonb DEFAULT NULL,
  _error text DEFAULT NULL,
  _duration_ms integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  inserted_id uuid;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN
    RAISE EXCEPTION 'Sessão de vendedor inválida';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wa_flow_runs r
    JOIN public.vendedores v ON v.id = _vendor_id AND v.codigo = _codigo AND coalesce(v.ativo, true) = true
    WHERE r.id = _run_id
      AND r.channel_id = ANY(allowed)
  ) THEN
    RAISE EXCEPTION 'Execução não encontrada';
  END IF;

  INSERT INTO public.wa_flow_executions (
    run_id,
    node_id,
    node_type,
    status,
    output,
    error,
    duration_ms
  ) VALUES (
    _run_id,
    _node_id,
    _node_type,
    _status,
    _output,
    _error,
    _duration_ms
  )
  RETURNING id INTO inserted_id;

  RETURN inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_active_wa_flow_runs(
  _vendor_id bigint,
  _codigo text,
  _conversation_id uuid
)
RETURNS TABLE (
  id uuid,
  flow_id uuid,
  status text,
  current_node_id text,
  waiting_for text,
  error text,
  updated_at timestamptz,
  flow_nome text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.flow_id,
    r.status,
    r.current_node_id,
    r.waiting_for,
    r.error,
    r.updated_at,
    COALESCE(f.nome, 'Fluxo') AS flow_nome
  FROM public.wa_flow_runs r
  LEFT JOIN public.wa_flows f ON f.id = r.flow_id
  WHERE r.conversation_id = _conversation_id
    AND r.channel_id = ANY(allowed)
    AND r.status = ANY(ARRAY['queued', 'running', 'waiting'])
  ORDER BY r.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_create_wa_flow_run(bigint, text, uuid, uuid, text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_update_wa_flow_run(bigint, text, uuid, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_insert_wa_flow_execution(bigint, text, uuid, text, text, text, jsonb, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_active_wa_flow_runs(bigint, text, uuid) TO anon, authenticated, service_role;