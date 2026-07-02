
-- 1) Vendor RPC: don't null out content, just set deleted_at
CREATE OR REPLACE FUNCTION public.vendor_delete_wa_message(_vendor_id bigint, _codigo text, _message_id uuid)
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

-- 2) Trigger: when a message is soft-deleted, update conversation preview if it's the latest
CREATE OR REPLACE FUNCTION public.sync_wa_conversation_deleted_preview()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  latest_id uuid;
BEGIN
  IF NEW.deleted_at IS NULL OR (OLD.deleted_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO latest_id
  FROM public.wa_messages
  WHERE conversation_id = NEW.conversation_id
  ORDER BY created_at DESC NULLS LAST, id DESC
  LIMIT 1;

  IF latest_id = NEW.id THEN
    UPDATE public.wa_conversations
       SET last_message_preview = '🚫 Mensagem apagada',
           updated_at = now()
     WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_wa_msg_deleted_preview ON public.wa_messages;
CREATE TRIGGER trg_wa_msg_deleted_preview
AFTER UPDATE OF deleted_at ON public.wa_messages
FOR EACH ROW EXECUTE FUNCTION public.sync_wa_conversation_deleted_preview();
