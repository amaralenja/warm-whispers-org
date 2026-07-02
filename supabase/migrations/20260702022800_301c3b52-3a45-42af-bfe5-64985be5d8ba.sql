
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.vendor_delete_wa_message(
  _vendor_id bigint,
  _codigo text,
  _message_id uuid
)
RETURNS TABLE(id uuid, wa_message_id text, channel_id text, direction text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN
    RAISE EXCEPTION 'Sessão de vendedor inválida';
  END IF;

  RETURN QUERY
  UPDATE public.wa_messages m
  SET deleted_at = now(),
      text_body = NULL,
      media_url = NULL,
      media_id = NULL,
      media_filename = NULL,
      caption = NULL,
      raw = COALESCE(m.raw, '{}'::jsonb) || jsonb_build_object('deleted_by_vendor_id', _vendor_id)
  FROM public.wa_conversations c
  WHERE m.id = _message_id
    AND c.id = m.conversation_id
    AND m.channel_id = ANY(allowed)
    AND m.direction = 'out'
    AND m.deleted_at IS NULL
    AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL)
    AND EXISTS (
      SELECT 1 FROM public.vendedores v
      WHERE v.id = _vendor_id AND v.codigo = _codigo AND coalesce(v.ativo, true) = true
    )
  RETURNING m.id, m.wa_message_id, m.channel_id, m.direction;
END;
$function$;
