CREATE OR REPLACE FUNCTION public.sync_wa_conversation_last_message_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  latest_out record;
BEGIN
  IF NEW.conversation_id IS NULL OR NEW.direction <> 'out' THEN
    RETURN NEW;
  END IF;

  SELECT id, status, created_at
    INTO latest_out
  FROM public.wa_messages
  WHERE conversation_id = NEW.conversation_id
    AND direction = 'out'
  ORDER BY created_at DESC NULLS LAST, id DESC
  LIMIT 1;

  IF latest_out.id = NEW.id THEN
    UPDATE public.wa_conversations
       SET last_message_status = COALESCE(NEW.status, 'sent'),
           updated_at = now()
     WHERE id = NEW.conversation_id
       AND COALESCE(last_message_direction, 'out') = 'out';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_wa_conversation_last_message_status ON public.wa_messages;
CREATE TRIGGER trg_sync_wa_conversation_last_message_status
AFTER INSERT OR UPDATE OF status, wa_message_id, direction, conversation_id, created_at
ON public.wa_messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_wa_conversation_last_message_status();

WITH latest_out AS (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    COALESCE(status, 'sent') AS status
  FROM public.wa_messages
  WHERE direction = 'out'
  ORDER BY conversation_id, created_at DESC NULLS LAST, id DESC
)
UPDATE public.wa_conversations c
   SET last_message_status = latest_out.status,
       updated_at = now()
  FROM latest_out
 WHERE c.id = latest_out.conversation_id
   AND c.last_message_direction = 'out'
   AND c.last_message_status IS DISTINCT FROM latest_out.status;

CREATE OR REPLACE FUNCTION public.vendor_touch_wa_conversation(
  _vendor_id bigint,
  _codigo text,
  _conversation_id uuid,
  _preview text DEFAULT NULL,
  _direction text DEFAULT 'out'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  latest_status text;
BEGIN
  IF _direction = 'out' THEN
    SELECT COALESCE(m.status, 'pending')
      INTO latest_status
    FROM public.wa_messages m
    WHERE m.conversation_id = _conversation_id
      AND m.direction = 'out'
    ORDER BY m.created_at DESC NULLS LAST, m.id DESC
    LIMIT 1;
  END IF;

  UPDATE public.wa_conversations c
  SET last_message_at = now(),
      last_message_preview = _preview,
      last_message_direction = _direction,
      last_message_status = CASE
        WHEN _direction = 'out' THEN COALESCE(latest_status, c.last_message_status, 'pending')
        ELSE c.last_message_status
      END,
      updated_at = now()
  WHERE c.id = _conversation_id
    AND c.assigned_vendor_id = _vendor_id
    AND EXISTS (
      SELECT 1
      FROM public.vendedores v
      WHERE v.id = _vendor_id
        AND v.codigo = _codigo
        AND coalesce(v.ativo, true) = true
    );
  RETURN found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_wa_conversation_last_message_status() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_touch_wa_conversation(bigint, text, uuid, text, text) TO anon, authenticated, service_role;