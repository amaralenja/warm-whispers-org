CREATE OR REPLACE FUNCTION public.update_wa_flow_run(_run_id uuid, _patch jsonb DEFAULT '{}'::jsonb)
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
  WHERE r.id = _run_id
    AND (
      r.status <> 'cancelled'
      OR NULLIF(_patch->>'status', '') = 'cancelled'
    );

  RETURN found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_wa_flow_run(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_wa_flow_run(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_update_wa_flow_run(_vendor_id bigint, _codigo text, _run_id uuid, _patch jsonb DEFAULT '{}'::jsonb)
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
    AND (
      r.status <> 'cancelled'
      OR NULLIF(_patch->>'status', '') = 'cancelled'
    )
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

GRANT EXECUTE ON FUNCTION public.vendor_update_wa_flow_run(bigint, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_update_wa_flow_run(bigint, text, uuid, jsonb) TO service_role;