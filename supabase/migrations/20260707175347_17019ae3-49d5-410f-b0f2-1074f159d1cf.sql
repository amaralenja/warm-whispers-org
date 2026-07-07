CREATE OR REPLACE FUNCTION public.cancel_active_wa_flow_runs(_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  target record;
  cancelled_count integer := 0;
  variants text[] := ARRAY[]::text[];
BEGIN
  SELECT r.id, r.flow_id, r.conversation_id, r.channel_id, r.contact_wa_id
  INTO target
  FROM public.wa_flow_runs r
  WHERE r.id = _run_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  variants := ARRAY[target.contact_wa_id::text];
  IF target.contact_wa_id ~ '^55[0-9]{11}$' AND substring(target.contact_wa_id from 5 for 1) = '9' THEN
    variants := variants || ('55' || substring(target.contact_wa_id from 3 for 2) || substring(target.contact_wa_id from 6));
  END IF;
  IF target.contact_wa_id ~ '^55[0-9]{10}$' THEN
    variants := variants || ('55' || substring(target.contact_wa_id from 3 for 2) || '9' || substring(target.contact_wa_id from 5));
  END IF;

  WITH updated AS (
    UPDATE public.wa_flow_runs r
    SET
      status = 'cancelled',
      waiting_for = NULL,
      expires_at = NULL,
      error = 'Cancelado manualmente',
      updated_at = now()
    WHERE r.status = ANY(ARRAY['queued', 'running', 'waiting'])
      AND (
        r.id = target.id
        OR (target.conversation_id IS NOT NULL AND r.conversation_id = target.conversation_id)
        OR (r.channel_id = target.channel_id AND r.contact_wa_id = ANY(variants))
      )
    RETURNING r.id
  )
  SELECT count(*) INTO cancelled_count FROM updated;

  RETURN cancelled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_active_wa_flow_runs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_active_wa_flow_runs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_active_wa_flow_runs(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_cancel_wa_flow_run(_vendor_id bigint, _codigo text, _run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed_channels text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  target record;
  cancelled_count integer := 0;
  variants text[] := ARRAY[]::text[];
BEGIN
  IF array_length(allowed_channels, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT r.id, r.flow_id, r.conversation_id, r.channel_id, r.contact_wa_id
  INTO target
  FROM public.wa_flow_runs r
  WHERE r.id = _run_id
    AND r.channel_id = ANY(allowed_channels)
    AND EXISTS (
      SELECT 1
      FROM public.vendedores v
      WHERE v.id = _vendor_id
        AND v.codigo = _codigo
        AND coalesce(v.ativo, true) = true
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  variants := ARRAY[target.contact_wa_id::text];
  IF target.contact_wa_id ~ '^55[0-9]{11}$' AND substring(target.contact_wa_id from 5 for 1) = '9' THEN
    variants := variants || ('55' || substring(target.contact_wa_id from 3 for 2) || substring(target.contact_wa_id from 6));
  END IF;
  IF target.contact_wa_id ~ '^55[0-9]{10}$' THEN
    variants := variants || ('55' || substring(target.contact_wa_id from 3 for 2) || '9' || substring(target.contact_wa_id from 5));
  END IF;

  WITH updated AS (
    UPDATE public.wa_flow_runs r
    SET
      status = 'cancelled',
      waiting_for = NULL,
      expires_at = NULL,
      error = 'Cancelado manualmente',
      updated_at = now()
    WHERE r.status = ANY(ARRAY['queued', 'running', 'waiting'])
      AND r.channel_id = ANY(allowed_channels)
      AND (
        r.id = target.id
        OR (target.conversation_id IS NOT NULL AND r.conversation_id = target.conversation_id)
        OR (r.channel_id = target.channel_id AND r.contact_wa_id = ANY(variants))
      )
    RETURNING r.id
  )
  SELECT count(*) INTO cancelled_count FROM updated;

  RETURN cancelled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.active_wa_flow_conversation_ids()
RETURNS TABLE(conversation_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT DISTINCT r.conversation_id
  FROM public.wa_flow_runs r
  WHERE r.conversation_id IS NOT NULL
    AND r.status = ANY(ARRAY['queued', 'running', 'waiting']);
$$;

REVOKE ALL ON FUNCTION public.active_wa_flow_conversation_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_wa_flow_conversation_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_wa_flow_conversation_ids() TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_active_wa_flow_conversation_ids(_vendor_id bigint, _codigo text)
RETURNS TABLE(conversation_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed_channels text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed_channels, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT r.conversation_id
  FROM public.wa_flow_runs r
  WHERE r.conversation_id IS NOT NULL
    AND r.channel_id = ANY(allowed_channels)
    AND r.status = ANY(ARRAY['queued', 'running', 'waiting']);
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_active_wa_flow_conversation_ids(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_active_wa_flow_conversation_ids(bigint, text) TO anon;
GRANT EXECUTE ON FUNCTION public.vendor_active_wa_flow_conversation_ids(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_active_wa_flow_conversation_ids(bigint, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.vendor_list_active_wa_flow_runs(bigint, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_update_wa_flow_run(bigint, text, uuid, jsonb) TO anon, authenticated, service_role;