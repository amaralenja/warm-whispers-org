ALTER TABLE public.ht_team ADD COLUMN IF NOT EXISTS email text;

CREATE OR REPLACE FUNCTION public.login_ht_team_by_codigo(_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
  SELECT id, nome, tipo, telefone, email, foto_url, codigo, ativo, permissoes
  INTO v
  FROM public.ht_team
  WHERE codigo = _codigo AND COALESCE(ativo, true) = true
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v);
END;
$function$;