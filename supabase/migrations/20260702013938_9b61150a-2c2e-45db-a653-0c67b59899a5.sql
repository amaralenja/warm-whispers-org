CREATE OR REPLACE FUNCTION public.load_wa_flow(_flow_id uuid)
RETURNS SETOF public.wa_flows
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.wa_flows WHERE id = _flow_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.load_wa_flow(uuid) TO anon, authenticated, service_role;