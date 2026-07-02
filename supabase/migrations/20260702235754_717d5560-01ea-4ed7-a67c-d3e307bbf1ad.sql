
-- Vendor CRM tag write RPCs
CREATE OR REPLACE FUNCTION public.vendor_create_crm_tag(
  _vendor_id bigint, _codigo text,
  _nome text, _cor text, _operacao text, _stage_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  new_id uuid;
BEGIN
  IF array_length(allowed,1) IS NULL THEN RAISE EXCEPTION 'Sessão de vendedor inválida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(a) = public._vendor_norm(_operacao)) THEN
    RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a esta operação';
  END IF;
  INSERT INTO public.crm_tags(nome, cor, operacao, stage_id)
  VALUES (_nome, COALESCE(_cor, '#3b82f6'), _operacao, _stage_id)
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.vendor_update_crm_tag(
  _vendor_id bigint, _codigo text, _id uuid,
  _nome text DEFAULT NULL, _cor text DEFAULT NULL, _stage_id uuid DEFAULT NULL, _clear_stage boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  tag_op text;
BEGIN
  IF array_length(allowed,1) IS NULL THEN RETURN false; END IF;
  SELECT operacao INTO tag_op FROM public.crm_tags WHERE id = _id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(a) = public._vendor_norm(tag_op)) THEN
    RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a esta operação';
  END IF;
  UPDATE public.crm_tags
     SET nome = COALESCE(_nome, nome),
         cor = COALESCE(_cor, cor),
         stage_id = CASE WHEN _clear_stage THEN NULL ELSE COALESCE(_stage_id, stage_id) END
   WHERE id = _id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.vendor_delete_crm_tag(
  _vendor_id bigint, _codigo text, _id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  tag_op text;
BEGIN
  IF array_length(allowed,1) IS NULL THEN RETURN false; END IF;
  SELECT operacao INTO tag_op FROM public.crm_tags WHERE id = _id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(a) = public._vendor_norm(tag_op)) THEN
    RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a esta operação';
  END IF;
  DELETE FROM public.crm_tags WHERE id = _id;
  RETURN true;
END; $$;

-- Vendor CRM stage write RPCs
CREATE OR REPLACE FUNCTION public.vendor_upsert_crm_stage(
  _vendor_id bigint, _codigo text,
  _id uuid, _operacao text, _nome text, _cor text, _ordem integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  existing_op text;
  new_id uuid;
BEGIN
  IF array_length(allowed,1) IS NULL THEN RAISE EXCEPTION 'Sessão de vendedor inválida'; END IF;
  IF _id IS NOT NULL THEN
    SELECT operacao INTO existing_op FROM public.crm_stages WHERE id = _id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Coluna não encontrada'; END IF;
    IF NOT EXISTS (SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(a) = public._vendor_norm(existing_op)) THEN
      RAISE EXCEPTION 'Inautorizado';
    END IF;
    UPDATE public.crm_stages SET nome=_nome, cor=COALESCE(_cor, cor), ordem=COALESCE(_ordem, ordem) WHERE id=_id;
    RETURN _id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(a) = public._vendor_norm(_operacao)) THEN
    RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a esta operação';
  END IF;
  INSERT INTO public.crm_stages(operacao, nome, cor, ordem)
  VALUES (_operacao, _nome, COALESCE(_cor,'#3b82f6'), COALESCE(_ordem,0))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.vendor_delete_crm_stage(
  _vendor_id bigint, _codigo text, _id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  st_op text;
BEGIN
  IF array_length(allowed,1) IS NULL THEN RETURN false; END IF;
  SELECT operacao INTO st_op FROM public.crm_stages WHERE id = _id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(a) = public._vendor_norm(st_op)) THEN
    RAISE EXCEPTION 'Inautorizado';
  END IF;
  DELETE FROM public.crm_stages WHERE id = _id;
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION public.vendor_create_crm_tag(bigint,text,text,text,text,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_update_crm_tag(bigint,text,uuid,text,text,uuid,boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_delete_crm_tag(bigint,text,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_upsert_crm_stage(bigint,text,uuid,text,text,text,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_delete_crm_stage(bigint,text,uuid) TO anon, authenticated;
