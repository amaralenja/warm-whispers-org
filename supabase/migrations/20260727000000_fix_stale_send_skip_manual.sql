-- Revert: remove the manual-run filter added earlier.
-- Manual triggers now use queueOnly:true (executed by the cron worker),
-- so the stale-send worker MUST be able to recover stuck manual runs.
-- The original SQL (without manual filter) is correct.
CREATE OR REPLACE FUNCTION public.claim_stale_running_send_flow_runs(_older_than_seconds integer DEFAULT 60, _limit integer DEFAULT 20)
 RETURNS SETOF wa_flow_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND node->>'type' <> 'delay'
    ORDER BY r2.updated_at ASC
    LIMIT _limit
    FOR UPDATE OF r2 SKIP LOCKED
  )
  UPDATE public.wa_flow_runs r
  SET updated_at = now(), executor_id = gen_random_uuid()
  FROM candidates
  WHERE r.id = candidates.id
  RETURNING r.*;
END;
$function$;
