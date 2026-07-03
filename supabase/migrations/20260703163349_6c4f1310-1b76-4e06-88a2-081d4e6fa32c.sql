CREATE OR REPLACE FUNCTION public.claim_stale_running_delay_flow_runs(_older_than_seconds int DEFAULT 90, _limit int DEFAULT 20)
RETURNS SETOF public.wa_flow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_seconds int := greatest(coalesce(_older_than_seconds, 90), 10);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      r2.id,
      greatest(
        1,
        least(
          86400,
          coalesce(nullif(node->'data'->>'seconds', '')::numeric, 2)
        )
      )::int AS delay_seconds
    FROM public.wa_flow_runs r2
    JOIN public.wa_flows f ON f.id = r2.flow_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(f.nodes, '[]'::jsonb)) AS node
    WHERE r2.status = 'running'
      AND r2.waiting_for IS NULL
      AND r2.updated_at <= now() - make_interval(secs => safe_seconds)
      AND node->>'id' = r2.current_node_id
      AND node->>'type' = 'delay'
    ORDER BY r2.updated_at ASC
    LIMIT _limit
    FOR UPDATE OF r2 SKIP LOCKED
  )
  UPDATE public.wa_flow_runs r
  SET
    status = 'waiting',
    waiting_for = 'timer',
    expires_at = r.updated_at + make_interval(secs => candidates.delay_seconds),
    error = NULL,
    updated_at = now()
  FROM candidates
  WHERE r.id = candidates.id
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stale_running_delay_flow_runs(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_stale_running_delay_flow_runs(int, int) TO anon, authenticated, service_role;