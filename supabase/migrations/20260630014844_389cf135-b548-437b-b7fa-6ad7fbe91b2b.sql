CREATE OR REPLACE FUNCTION public.login_vendedor_by_codigo(_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
  SELECT id, nome, utm, expert, foto_url, codigo, ativo,
         COALESCE(permissoes, '{}'::jsonb) AS permissoes,
         COALESCE(wa_channel_ids, '{}'::text[]) AS wa_channel_ids
  INTO v
  FROM public.vendedores
  WHERE codigo = _codigo AND COALESCE(ativo, true) = true
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v);
END;
$function$;