CREATE OR REPLACE FUNCTION public.cancel_expired_waiting_flow_runs(_older_than_seconds integer DEFAULT 60, _limit integer DEFAULT 100)
RETURNS SETOF public.wa_flow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  safe_seconds int := greatest(coalesce(_older_than_seconds, 60), 0);
BEGIN
  RETURN QUERY
  UPDATE public.wa_flow_runs r
  SET
    status = 'cancelled',
    waiting_for = NULL,
    expires_at = NULL,
    error = 'Expirado automaticamente',
    updated_at = now()
  WHERE r.id IN (
    SELECT id
    FROM public.wa_flow_runs
    WHERE status = 'waiting'
      AND waiting_for IS DISTINCT FROM 'timer'
      AND expires_at IS NOT NULL
      AND expires_at <= now() - make_interval(secs => safe_seconds)
    ORDER BY expires_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING r.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_expired_waiting_flow_runs(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_expired_waiting_flow_runs(integer, integer) TO service_role;