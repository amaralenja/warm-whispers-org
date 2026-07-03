CREATE OR REPLACE FUNCTION public.update_wa_flow_run(
  _run_id uuid,
  _patch jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  UPDATE public.wa_flow_runs r
  SET
    current_node_id = CASE WHEN _patch ? 'current_node_id' THEN NULLIF(_patch->>'current_node_id', '') ELSE r.current_node_id END,
    status = CASE WHEN _patch ? 'status' THEN COALESCE(NULLIF(_patch->>'status', ''), r.status) ELSE r.status END,
    waiting_for = CASE WHEN _patch ? 'waiting_for' THEN NULLIF(_patch->>'waiting_for', '') ELSE r.waiting_for END,
    context = CASE WHEN _patch ? 'context' THEN COALESCE(_patch->'context', '{}'::jsonb) ELSE r.context END,
    expires_at = CASE WHEN _patch ? 'expires_at' THEN NULLIF(_patch->>'expires_at', '')::timestamptz ELSE r.expires_at END,
    error = CASE WHEN _patch ? 'error' THEN NULLIF(_patch->>'error', '') ELSE r.error END,
    updated_at = now()
  WHERE r.id = _run_id;

  RETURN found;
END;
$$;

REVOKE ALL ON FUNCTION public.update_wa_flow_run(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_wa_flow_run(uuid, jsonb) TO anon, authenticated, service_role;