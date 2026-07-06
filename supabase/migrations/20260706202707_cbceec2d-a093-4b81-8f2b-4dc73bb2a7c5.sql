
CREATE OR REPLACE FUNCTION public.sync_wa_conversation_preview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  new_preview text;
  current_last timestamptz;
BEGIN
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  new_preview := CASE NEW.msg_type
    WHEN 'text' THEN LEFT(COALESCE(NEW.text_body, ''), 120)
    WHEN 'image' THEN '📷 Imagem' || CASE WHEN NEW.caption IS NOT NULL AND NEW.caption <> '' THEN ' — ' || NEW.caption ELSE '' END
    WHEN 'audio' THEN '🎵 Áudio'
    WHEN 'video' THEN '🎬 Vídeo' || CASE WHEN NEW.caption IS NOT NULL AND NEW.caption <> '' THEN ' — ' || NEW.caption ELSE '' END
    WHEN 'document' THEN '📄 ' || COALESCE(NEW.media_filename, 'Documento')
    WHEN 'sticker' THEN '🎭 Figurinha'
    WHEN 'location' THEN '📍 Localização'
    ELSE '[' || COALESCE(NEW.msg_type, 'mensagem') || ']'
  END;

  SELECT last_message_at INTO current_last
  FROM public.wa_conversations
  WHERE id = NEW.conversation_id;

  IF current_last IS NULL OR NEW.created_at >= current_last THEN
    UPDATE public.wa_conversations
       SET last_message_at = NEW.created_at,
           last_message_preview = new_preview,
           last_message_direction = NEW.direction,
           last_message_status = CASE
             WHEN NEW.direction = 'out' THEN COALESCE(NEW.status, 'sent')
             ELSE last_message_status
           END,
           updated_at = now()
     WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_wa_conversation_preview ON public.wa_messages;
CREATE TRIGGER trg_sync_wa_conversation_preview
AFTER INSERT ON public.wa_messages
FOR EACH ROW EXECUTE FUNCTION public.sync_wa_conversation_preview();

-- Backfill: for any conversation whose newest non-deleted message is newer than
-- last_message_at, correct the preview so existing rows (like the Victor case)
-- are fixed immediately without waiting for new messages.
WITH latest AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id, m.id, m.created_at, m.direction, m.msg_type,
    m.text_body, m.caption, m.media_filename, m.status
  FROM public.wa_messages m
  WHERE m.conversation_id IS NOT NULL AND m.deleted_at IS NULL
  ORDER BY m.conversation_id, m.created_at DESC NULLS LAST, m.id DESC
)
UPDATE public.wa_conversations c
SET last_message_at = l.created_at,
    last_message_preview = CASE l.msg_type
      WHEN 'text' THEN LEFT(COALESCE(l.text_body, ''), 120)
      WHEN 'image' THEN '📷 Imagem' || CASE WHEN l.caption IS NOT NULL AND l.caption <> '' THEN ' — ' || l.caption ELSE '' END
      WHEN 'audio' THEN '🎵 Áudio'
      WHEN 'video' THEN '🎬 Vídeo' || CASE WHEN l.caption IS NOT NULL AND l.caption <> '' THEN ' — ' || l.caption ELSE '' END
      WHEN 'document' THEN '📄 ' || COALESCE(l.media_filename, 'Documento')
      WHEN 'sticker' THEN '🎭 Figurinha'
      WHEN 'location' THEN '📍 Localização'
      ELSE '[' || COALESCE(l.msg_type, 'mensagem') || ']'
    END,
    last_message_direction = l.direction,
    last_message_status = CASE WHEN l.direction = 'out' THEN COALESCE(l.status, c.last_message_status, 'sent') ELSE c.last_message_status END,
    updated_at = now()
FROM latest l
WHERE c.id = l.conversation_id
  AND (c.last_message_at IS NULL OR l.created_at > c.last_message_at);
