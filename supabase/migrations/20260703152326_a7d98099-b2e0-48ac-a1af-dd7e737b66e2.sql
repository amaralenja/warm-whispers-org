
CREATE INDEX IF NOT EXISTS idx_wa_flow_runs_status_created ON public.wa_flow_runs(status, created_at) WHERE status = 'queued';

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
    SELECT id FROM public.wa_flow_runs
    WHERE status = 'queued'
    ORDER BY created_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_queued_flow_runs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_queued_flow_runs(int) TO service_role;
