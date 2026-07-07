CREATE OR REPLACE FUNCTION public.cancel_active_wa_flow_runs(_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  target public.wa_flow_runs%rowtype;
  cancelled_count integer := 0;
  clean text;
  variants text[];
BEGIN
  SELECT * INTO target
  FROM public.wa_flow_runs r
  WHERE r.id = _run_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  clean := regexp_replace(coalesce(target.contact_wa_id, ''), '\D', '', 'g');
  variants := ARRAY[
    target.contact_wa_id,
    clean,
    CASE WHEN clean ~ '^55[0-9]{2}9[0-9]{8}$' THEN substr(clean, 1, 4) || substr(clean, 6) ELSE NULL END,
    CASE WHEN clean ~ '^55[0-9]{10}$' THEN substr(clean, 1, 4) || '9' || substr(clean, 5) ELSE NULL END,
    CASE WHEN clean ~ '^[0-9]{2}9[0-9]{8}$' THEN '55' || clean ELSE NULL END,
    CASE WHEN clean ~ '^[0-9]{10}$' THEN '55' || substr(clean, 1, 2) || '9' || substr(clean, 3) ELSE NULL END
  ];

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
      OR (
        r.channel_id = target.channel_id
        AND r.contact_wa_id = ANY(SELECT DISTINCT unnest(variants) WHERE unnest IS NOT NULL AND unnest <> '')
      )
    );

  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
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
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  target public.wa_flow_runs%rowtype;
  cancelled_count integer := 0;
  clean text;
  variants text[];
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN 0; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendedores v
    WHERE v.id = _vendor_id
      AND v.codigo = _codigo
      AND coalesce(v.ativo, true) = true
  ) THEN
    RETURN 0;
  END IF;

  SELECT * INTO target
  FROM public.wa_flow_runs r
  WHERE r.id = _run_id
    AND r.channel_id = ANY(allowed)
  LIMIT 1;

  IF NOT FOUND THEN RETURN 0; END IF;

  clean := regexp_replace(coalesce(target.contact_wa_id, ''), '\D', '', 'g');
  variants := ARRAY[
    target.contact_wa_id,
    clean,
    CASE WHEN clean ~ '^55[0-9]{2}9[0-9]{8}$' THEN substr(clean, 1, 4) || substr(clean, 6) ELSE NULL END,
    CASE WHEN clean ~ '^55[0-9]{10}$' THEN substr(clean, 1, 4) || '9' || substr(clean, 5) ELSE NULL END,
    CASE WHEN clean ~ '^[0-9]{2}9[0-9]{8}$' THEN '55' || clean ELSE NULL END,
    CASE WHEN clean ~ '^[0-9]{10}$' THEN '55' || substr(clean, 1, 2) || '9' || substr(clean, 3) ELSE NULL END
  ];

  UPDATE public.wa_flow_runs r
  SET
    status = 'cancelled',
    waiting_for = NULL,
    expires_at = NULL,
    error = 'Cancelado manualmente',
    updated_at = now()
  WHERE r.status = ANY(ARRAY['queued', 'running', 'waiting'])
    AND r.channel_id = ANY(allowed)
    AND (
      r.id = target.id
      OR (target.conversation_id IS NOT NULL AND r.conversation_id = target.conversation_id)
      OR (
        r.channel_id = target.channel_id
        AND r.contact_wa_id = ANY(SELECT DISTINCT unnest(variants) WHERE unnest IS NOT NULL AND unnest <> '')
      )
    );

  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN cancelled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_queued_flow_runs(_limit int DEFAULT 20)
RETURNS SETOF public.wa_flow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.wa_flow_runs
  SET status = 'running', updated_at = now()
  WHERE id IN (
    SELECT r.id
    FROM public.wa_flow_runs r
    WHERE r.status = 'queued'
      AND NOT EXISTS (
        SELECT 1
        FROM public.wa_flow_runs c
        WHERE c.status = 'cancelled'
          AND c.flow_id = r.flow_id
          AND c.channel_id = r.channel_id
          AND c.updated_at >= now() - interval '30 minutes'
          AND (
            (c.conversation_id IS NOT NULL AND r.conversation_id = c.conversation_id)
            OR c.contact_wa_id = r.contact_wa_id
          )
      )
    ORDER BY r.created_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_queued_flow_runs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_queued_flow_runs(int) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_expired_timer_flow_runs(_limit int DEFAULT 20)
RETURNS SETOF public.wa_flow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.wa_flow_runs
  SET
    status = 'running',
    waiting_for = NULL,
    expires_at = NULL,
    updated_at = now()
  WHERE id IN (
    SELECT r.id
    FROM public.wa_flow_runs r
    WHERE r.status = 'waiting'
      AND r.waiting_for = 'timer'
      AND r.expires_at <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.wa_flow_runs c
        WHERE c.status = 'cancelled'
          AND c.flow_id = r.flow_id
          AND c.channel_id = r.channel_id
          AND c.updated_at >= now() - interval '30 minutes'
          AND (
            (c.conversation_id IS NOT NULL AND r.conversation_id = c.conversation_id)
            OR c.contact_wa_id = r.contact_wa_id
          )
      )
    ORDER BY r.expires_at ASC NULLS FIRST, r.updated_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_expired_timer_flow_runs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_expired_timer_flow_runs(int) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_stale_running_send_flow_runs(_older_than_seconds integer DEFAULT 60, _limit integer DEFAULT 20)
RETURNS SETOF public.wa_flow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  safe_seconds int := greatest(coalesce(_older_than_seconds, 60), 20);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT r2.id
    FROM public.wa_flow_runs r2
    JOIN public.wa_flows f ON f.id = r2.flow_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(f.nodes, '[]'::jsonb)) AS node
    WHERE r2.status = 'running'
      AND r2.waiting_for IS NULL
      AND r2.updated_at <= now() - make_interval(secs => safe_seconds)
      AND node->>'id' = r2.current_node_id
      AND node->>'type' IN ('send_text','send_image','send_video','send_audio','send_document','send_buttons','tag_action','assign_vendor','trigger_flow','http_request','ai_response')
      AND NOT EXISTS (
        SELECT 1
        FROM public.wa_flow_runs c
        WHERE c.status = 'cancelled'
          AND c.flow_id = r2.flow_id
          AND c.channel_id = r2.channel_id
          AND c.updated_at >= now() - interval '30 minutes'
          AND (
            (c.conversation_id IS NOT NULL AND r2.conversation_id = c.conversation_id)
            OR c.contact_wa_id = r2.contact_wa_id
          )
      )
    ORDER BY r2.updated_at ASC
    LIMIT _limit
    FOR UPDATE OF r2 SKIP LOCKED
  )
  UPDATE public.wa_flow_runs r
  SET updated_at = now()
  FROM candidates
  WHERE r.id = candidates.id
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stale_running_send_flow_runs(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_stale_running_send_flow_runs(integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.active_wa_flow_conversation_ids()
RETURNS TABLE (conversation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
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
RETURNS TABLE (conversation_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT r.conversation_id
  FROM public.wa_flow_runs r
  WHERE r.conversation_id IS NOT NULL
    AND r.channel_id = ANY(allowed)
    AND r.status = ANY(ARRAY['queued', 'running', 'waiting'])
    AND EXISTS (
      SELECT 1
      FROM public.vendedores v
      WHERE v.id = _vendor_id
        AND v.codigo = _codigo
        AND coalesce(v.ativo, true) = true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_active_wa_flow_conversation_ids(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_active_wa_flow_conversation_ids(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_active_wa_flow_conversation_ids(bigint, text) TO service_role;