CREATE INDEX IF NOT EXISTS idx_wa_flow_runs_waiting_timer_expired
ON public.wa_flow_runs(status, waiting_for, expires_at)
WHERE status = 'waiting' AND waiting_for = 'timer';

CREATE INDEX IF NOT EXISTS idx_wa_flow_runs_running_updated
ON public.wa_flow_runs(status, updated_at)
WHERE status = 'running';

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
    SELECT id
    FROM public.wa_flow_runs
    WHERE status = 'waiting'
      AND waiting_for = 'timer'
      AND expires_at <= now()
    ORDER BY expires_at ASC NULLS FIRST, updated_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_expired_timer_flow_runs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_expired_timer_flow_runs(int) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_stale_running_delay_flow_runs(_older_than_seconds int DEFAULT 90, _limit int DEFAULT 20)
RETURNS SETOF public.wa_flow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_seconds int := greatest(coalesce(_older_than_seconds, 90), 30);
BEGIN
  RETURN QUERY
  UPDATE public.wa_flow_runs r
  SET updated_at = now()
  WHERE r.id IN (
    SELECT r2.id
    FROM public.wa_flow_runs r2
    JOIN public.wa_flows f ON f.id = r2.flow_id
    WHERE r2.status = 'running'
      AND r2.waiting_for IS NULL
      AND r2.updated_at <= now() - make_interval(secs => safe_seconds)
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(f.nodes, '[]'::jsonb)) AS node
        WHERE node->>'id' = r2.current_node_id
          AND node->>'type' = 'delay'
      )
    ORDER BY r2.updated_at ASC
    LIMIT _limit
    FOR UPDATE OF r2 SKIP LOCKED
  )
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stale_running_delay_flow_runs(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_stale_running_delay_flow_runs(int, int) TO anon, authenticated, service_role;