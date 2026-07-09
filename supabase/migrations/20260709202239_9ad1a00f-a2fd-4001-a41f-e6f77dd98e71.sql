CREATE OR REPLACE FUNCTION public.vendor_edit_wa_message(
  _vendor_id bigint,
  _codigo text,
  _message_id uuid,
  _new_text text
)
RETURNS TABLE(id uuid, wa_message_id text, channel_id text, contact_wa_id text, prev_text text)
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
  WITH src AS (
    SELECT m.id, m.wa_message_id, m.channel_id, c.contact_wa_id, m.text_body AS prev_text
    FROM public.wa_messages m
    JOIN public.wa_conversations c ON c.id = m.conversation_id
    WHERE m.id = _message_id
      AND m.channel_id = ANY(allowed)
      AND m.direction = 'out'
      AND m.msg_type = 'text'
      AND m.deleted_at IS NULL
      AND m.created_at > now() - interval '15 minutes'
      AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL)
      AND EXISTS (
        SELECT 1 FROM public.vendedores v
        WHERE v.id = _vendor_id AND v.codigo = _codigo AND coalesce(v.ativo, true) = true
      )
  ),
  upd AS (
    UPDATE public.wa_messages m
       SET text_body = _new_text,
           raw = COALESCE(m.raw, '{}'::jsonb) || jsonb_build_object(
             'edited_at', now(),
             'edited_by_vendor_id', _vendor_id,
             'edit_history', COALESCE(m.raw->'edit_history', '[]'::jsonb) ||
               jsonb_build_array(jsonb_build_object('at', now(), 'prev', src.prev_text))
           )
      FROM src
     WHERE m.id = src.id
     RETURNING m.id
  )
  SELECT src.id, src.wa_message_id, src.channel_id, src.contact_wa_id, src.prev_text FROM src;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vendor_edit_wa_message(bigint, text, uuid, text) TO anon, authenticated, service_role;