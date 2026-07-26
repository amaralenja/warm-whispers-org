ALTER TABLE public.wa_flow_runs ADD COLUMN IF NOT EXISTS executor_id uuid;

CREATE OR REPLACE FUNCTION public.flow_run_take_lease(_run_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid := gen_random_uuid();
BEGIN
  UPDATE public.wa_flow_runs SET executor_id = new_id, updated_at = now() WHERE id = _run_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.flow_run_owns(_run_id uuid, _executor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.wa_flow_runs WHERE id = _run_id AND executor_id IS NOT DISTINCT FROM _executor);
$function$;

GRANT EXECUTE ON FUNCTION public.flow_run_take_lease(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.flow_run_owns(uuid, uuid) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.claim_queued_flow_runs(_limit integer DEFAULT 20)
 RETURNS SETOF wa_flow_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.wa_flow_runs
  SET status = 'running', updated_at = now(), executor_id = gen_random_uuid()
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
$function$;

CREATE OR REPLACE FUNCTION public.claim_expired_timer_flow_runs(_limit integer DEFAULT 20)
 RETURNS SETOF wa_flow_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.wa_flow_runs
  SET
    status = 'running',
    waiting_for = NULL,
    expires_at = NULL,
    updated_at = now(),
    executor_id = gen_random_uuid()
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
$function$;

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