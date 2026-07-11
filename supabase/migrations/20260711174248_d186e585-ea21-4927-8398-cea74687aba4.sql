
CREATE OR REPLACE FUNCTION public.vendor_list_flows(_vendor_id bigint, _codigo text)
 RETURNS SETOF wa_flows
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  allowed_norm text[];
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  SELECT array_agg(public._vendor_norm(a)) INTO allowed_norm FROM unnest(allowed) a;
  RETURN QUERY
  SELECT f.*
  FROM public.wa_flows f
  WHERE f.operacao_id IS NOT NULL
    AND public._vendor_norm(f.operacao_id) = ANY(allowed_norm)
  ORDER BY f.updated_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vendor_get_flow(_vendor_id bigint, _codigo text, _flow_id uuid)
 RETURNS SETOF wa_flows
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT f.*
  FROM public.wa_flows f
  WHERE f.id = _flow_id
    AND f.operacao_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM unnest(allowed) a
      WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)
    )
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vendor_delete_wa_flow(_vendor_id bigint, _codigo text, _flow_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  DELETE FROM public.wa_flows f
   WHERE f.id = _flow_id
     AND f.operacao_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM unnest(allowed) a
       WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)
     );
  RETURN found;
END;
$function$;
