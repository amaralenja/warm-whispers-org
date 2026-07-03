DROP FUNCTION IF EXISTS public.vendor_list_active_wa_flow_runs(bigint, text, uuid);

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
  expires_at timestamptz,
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
    r.expires_at,
    COALESCE(f.nome, 'Fluxo') AS flow_nome
  FROM public.wa_flow_runs r
  LEFT JOIN public.wa_flows f ON f.id = r.flow_id
  WHERE r.conversation_id = _conversation_id
    AND r.channel_id = ANY(allowed)
    AND r.status = ANY(ARRAY['queued', 'running', 'waiting'])
  ORDER BY r.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_list_active_wa_flow_runs(bigint, text, uuid) TO anon, authenticated, service_role;