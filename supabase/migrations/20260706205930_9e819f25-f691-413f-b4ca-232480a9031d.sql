
-- Add image_path column to vendor_checkouts (quick messages can carry an image)
ALTER TABLE public.vendor_checkouts
  ADD COLUMN IF NOT EXISTS image_path text;

-- Update list to return image_path (SETOF vendor_checkouts already returns it after ALTER)
-- Recreate upsert to accept _image_path
DROP FUNCTION IF EXISTS public.vendor_upsert_checkout(bigint, text, uuid, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.vendor_upsert_checkout(
  _vendor_id bigint,
  _codigo text,
  _id uuid,
  _nome text,
  _mensagem text,
  _link text,
  _ordem integer,
  _image_path text DEFAULT NULL
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
           link = COALESCE(_link, ''),
           image_path = _image_path,
           ordem = COALESCE(_ordem, 0),
           updated_at = now()
     WHERE id = _id AND vendedor_id = _vendor_id
    RETURNING id INTO out_id;
    IF out_id IS NULL THEN
      RAISE EXCEPTION 'Mensagem não encontrada';
    END IF;
    RETURN out_id;
  END IF;

  INSERT INTO public.vendor_checkouts (vendedor_id, nome, mensagem, link, image_path, ordem)
  VALUES (_vendor_id, _nome, COALESCE(_mensagem, ''), COALESCE(_link, ''), _image_path, COALESCE(_ordem, 0))
  RETURNING id INTO out_id;
  RETURN out_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_upsert_checkout(bigint, text, uuid, text, text, text, integer, text) TO anon, authenticated;

-- Storage RLS on vendor-assets bucket: only service_role writes/reads (server-side).
-- Users interact through server functions that use supabaseAdmin; no direct client access needed.
