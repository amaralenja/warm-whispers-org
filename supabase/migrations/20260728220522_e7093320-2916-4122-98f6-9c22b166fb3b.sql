CREATE OR REPLACE FUNCTION public.claim_stale_running_delay_flow_runs(_older_than_seconds integer DEFAULT 180, _limit integer DEFAULT 20)
 RETURNS SETOF wa_flow_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  safe_seconds int := greatest(coalesce(_older_than_seconds, 180), 120);
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
      -- Delays curtos (<=8s) rodam inline no executor; nunca devem ser
      -- convertidos em timer, senão dois executores tocam o mesmo fluxo.
      AND coalesce(nullif(node->'data'->>'seconds', '')::numeric, 2) > 8
    ORDER BY r2.updated_at ASC
    LIMIT _limit
    FOR UPDATE OF r2 SKIP LOCKED
  )
  UPDATE public.wa_flow_runs r
  SET
    status = 'waiting',
    waiting_for = 'timer',
    expires_at = greatest(now(), r.updated_at + make_interval(secs => candidates.delay_seconds)),
    error = NULL,
    updated_at = now(),
    -- Invalida o executor antigo: se ele ainda estiver vivo, para na hora.
    executor_id = gen_random_uuid()
  FROM candidates
  WHERE r.id = candidates.id
  RETURNING r.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_stale_running_send_flow_runs(_older_than_seconds integer DEFAULT 300, _limit integer DEFAULT 20)
 RETURNS SETOF wa_flow_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  safe_seconds int := greatest(coalesce(_older_than_seconds, 300), 180);
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