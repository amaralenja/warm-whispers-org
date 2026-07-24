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
      AND (
        r.context #>> '{trigger,manual}' = 'true'
        OR NOT EXISTS (
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
      AND (
        r.context #>> '{trigger,manual}' = 'true'
        OR NOT EXISTS (
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
      AND (
        r2.context #>> '{trigger,manual}' = 'true'
        OR NOT EXISTS (
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