CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._vendor_norm(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT lower(trim(unaccent(coalesce(value, ''))));
$$;

CREATE OR REPLACE FUNCTION public.vendor_allowed_workspace_ids(_vendor_id bigint, _codigo text)
RETURNS text[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v record;
  out_ids text[] := ARRAY[]::text[];
BEGIN
  SELECT id, expert, workspace_ids
  INTO v
  FROM public.vendedores
  WHERE id = _vendor_id
    AND codigo = _codigo
    AND COALESCE(ativo, true) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN ARRAY[]::text[];
  END IF;

  IF v.workspace_ids IS NOT NULL AND array_length(v.workspace_ids, 1) > 0 THEN
    out_ids := v.workspace_ids;
  ELSIF NULLIF(trim(coalesce(v.expert, '')), '') IS NOT NULL THEN
    out_ids := ARRAY[v.expert]::text[];
  END IF;

  RETURN coalesce(out_ids, ARRAY[]::text[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_allowed_channel_ids(_vendor_id bigint, _codigo text)
RETURNS text[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v record;
  ids text[] := ARRAY[]::text[];
BEGIN
  SELECT id, expert, wa_channel_ids
  INTO v
  FROM public.vendedores
  WHERE id = _vendor_id
    AND codigo = _codigo
    AND COALESCE(ativo, true) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN ARRAY[]::text[];
  END IF;

  IF v.wa_channel_ids IS NOT NULL AND array_length(v.wa_channel_ids, 1) > 0 THEN
    RETURN v.wa_channel_ids;
  END IF;

  IF NULLIF(trim(coalesce(v.expert, '')), '') IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT coalesce(array_agg(c.id::text), ARRAY[]::text[])
  INTO ids
  FROM public.wa_channels c
  WHERE public._vendor_norm(c.operacao_id) = public._vendor_norm(v.expert)
    AND coalesce(c.kind, 'chat') <> 'notification'
    AND coalesce(c.operacao_id, '') <> '__notificador__';

  RETURN coalesce(ids, ARRAY[]::text[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_crm_experts(_vendor_id bigint, _codigo text)
RETURNS SETOF public.experts
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT e.*
  FROM public.experts e
  WHERE EXISTS (
    SELECT 1 FROM unnest(allowed) a
    WHERE public._vendor_norm(e.nome) = public._vendor_norm(a)
  )
  ORDER BY e.nome;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_crm_leads(_vendor_id bigint, _codigo text)
RETURNS SETOF public.crm_leads
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT l.*
  FROM public.crm_leads l
  WHERE EXISTS (
    SELECT 1 FROM unnest(allowed) a
    WHERE public._vendor_norm(l.expert) = public._vendor_norm(a)
  )
  ORDER BY l.ordem ASC NULLS LAST, l.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_update_crm_lead_stage(_vendor_id bigint, _codigo text, _lead_id uuid, _status text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  UPDATE public.crm_leads l
  SET status = _status, updated_at = now()
  WHERE l.id = _lead_id
    AND EXISTS (
      SELECT 1 FROM unnest(allowed) a
      WHERE public._vendor_norm(l.expert) = public._vendor_norm(a)
    );
  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_crm_tags(_vendor_id bigint, _codigo text, _operacao text DEFAULT 'all')
RETURNS SETOF public.crm_tags
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.*
  FROM public.crm_tags t
  WHERE (_operacao IS NULL OR _operacao = 'all' OR public._vendor_norm(t.operacao) = public._vendor_norm(_operacao))
    AND EXISTS (
      SELECT 1 FROM unnest(allowed) a
      WHERE public._vendor_norm(t.operacao) = public._vendor_norm(a)
    )
  ORDER BY t.nome;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_crm_stages(_vendor_id bigint, _codigo text, _operacao text DEFAULT 'all')
RETURNS SETOF public.crm_stages
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.*
  FROM public.crm_stages s
  WHERE (_operacao IS NULL OR _operacao = 'all' OR public._vendor_norm(s.operacao) = public._vendor_norm(_operacao))
    AND EXISTS (
      SELECT 1 FROM unnest(allowed) a
      WHERE public._vendor_norm(s.operacao) = public._vendor_norm(a)
    )
  ORDER BY s.ordem, s.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_wa_channels(_vendor_id bigint, _codigo text)
RETURNS SETOF public.wa_channels
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.*
  FROM public.wa_channels c
  WHERE c.id = ANY(allowed)
    AND coalesce(c.kind, 'chat') <> 'notification'
    AND coalesce(c.operacao_id, '') <> '__notificador__'
  ORDER BY c.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_wa_conversations(_vendor_id bigint, _codigo text, _operacao_id text DEFAULT NULL)
RETURNS SETOF public.wa_conversations
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.*
  FROM public.wa_conversations c
  WHERE c.channel_id = ANY(allowed)
    AND coalesce(c.operacao_id, '') <> '__notificador__'
    AND (_operacao_id IS NULL OR public._vendor_norm(c.operacao_id) = public._vendor_norm(_operacao_id))
    AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL)
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_wa_messages(_vendor_id bigint, _codigo text, _conversation_id uuid)
RETURNS SETOF public.wa_messages
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  conv record;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  SELECT id, channel_id, assigned_vendor_id
  INTO conv
  FROM public.wa_conversations
  WHERE id = _conversation_id
    AND channel_id = ANY(allowed)
    AND (assigned_vendor_id = _vendor_id OR assigned_vendor_id IS NULL)
  LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT m.*
  FROM public.wa_messages m
  WHERE m.conversation_id = _conversation_id
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_mark_conversation_read(_vendor_id bigint, _codigo text, _conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  UPDATE public.wa_conversations c
  SET unread_count = 0
  WHERE c.id = _conversation_id
    AND c.channel_id = ANY(allowed)
    AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL);
  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_flows(_vendor_id bigint, _codigo text)
RETURNS SETOF public.wa_flows
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT f.*
  FROM public.wa_flows f
  WHERE f.operacao_id IS NULL
     OR EXISTS (
       SELECT 1 FROM unnest(allowed) a
       WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)
     )
  ORDER BY f.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_get_flow(_vendor_id bigint, _codigo text, _flow_id uuid)
RETURNS SETOF public.wa_flows
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT f.*
  FROM public.wa_flows f
  WHERE f.id = _flow_id
    AND (
      f.operacao_id IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(allowed) a
        WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)
      )
    )
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public._vendor_norm(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_allowed_workspace_ids(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_allowed_channel_ids(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_crm_experts(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_crm_leads(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_update_crm_lead_stage(bigint, text, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_crm_tags(bigint, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_crm_stages(bigint, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_wa_channels(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_wa_conversations(bigint, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_wa_messages(bigint, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_mark_conversation_read(bigint, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_flows(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_get_flow(bigint, text, uuid) TO anon, authenticated, service_role;