ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS workspace_ids text[] DEFAULT NULL;

COMMENT ON COLUMN public.vendedores.workspace_ids IS
  'Workspaces/operações que o vendedor pode visualizar. NULL = legado/fallback para expert; array vazio = nenhum workspace liberado.';

CREATE OR REPLACE FUNCTION public.login_vendedor_by_codigo(_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
BEGIN
  SELECT id, nome, utm, expert, foto_url, codigo, ativo, permissoes, wa_channel_ids, workspace_ids, lead_weight
  INTO v
  FROM public.vendedores
  WHERE codigo = _codigo AND COALESCE(ativo, true) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v);
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_vendedor_by_codigo(text) TO anon, authenticated, service_role;