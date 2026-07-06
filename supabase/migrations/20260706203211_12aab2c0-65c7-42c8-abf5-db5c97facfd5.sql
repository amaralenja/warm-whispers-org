
-- Helper (vendor-scoped): ensures the caller's vendor code matches the id.
CREATE OR REPLACE FUNCTION public._vendor_check(_vendor_id bigint, _codigo text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendedores v
    WHERE v.id = _vendor_id
      AND v.codigo = _codigo
      AND COALESCE(v.ativo, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_checkouts(_vendor_id bigint, _codigo text)
RETURNS SETOF public.vendor_checkouts
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public._vendor_check(_vendor_id, _codigo) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.vendor_checkouts
    WHERE vendedor_id = _vendor_id
    ORDER BY ordem ASC, created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_upsert_checkout(
  _vendor_id bigint,
  _codigo text,
  _id uuid,
  _nome text,
  _mensagem text,
  _link text,
  _ordem integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  out_id uuid;
BEGIN
  IF NOT public._vendor_check(_vendor_id, _codigo) THEN
    RAISE EXCEPTION 'Sessão de vendedor inválida';
  END IF;

  IF _id IS NOT NULL THEN
    UPDATE public.vendor_checkouts
       SET nome = _nome,
           mensagem = COALESCE(_mensagem, ''),
           link = _link,
           ordem = COALESCE(_ordem, 0),
           updated_at = now()
     WHERE id = _id AND vendedor_id = _vendor_id
    RETURNING id INTO out_id;
    IF out_id IS NULL THEN
      RAISE EXCEPTION 'Checkout não encontrado';
    END IF;
    RETURN out_id;
  END IF;

  INSERT INTO public.vendor_checkouts (vendedor_id, nome, mensagem, link, ordem)
  VALUES (_vendor_id, _nome, COALESCE(_mensagem, ''), _link, COALESCE(_ordem, 0))
  RETURNING id INTO out_id;
  RETURN out_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_delete_checkout(_vendor_id bigint, _codigo text, _id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public._vendor_check(_vendor_id, _codigo) THEN
    RAISE EXCEPTION 'Sessão de vendedor inválida';
  END IF;
  DELETE FROM public.vendor_checkouts
   WHERE id = _id AND vendedor_id = _vendor_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_list_checkouts(bigint, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_upsert_checkout(bigint, text, uuid, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_delete_checkout(bigint, text, uuid) TO anon, authenticated;
