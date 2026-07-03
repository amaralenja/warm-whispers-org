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
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  latest_status text;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vendedores v
    WHERE v.id = _vendor_id AND v.codigo = _codigo AND coalesce(v.ativo, true) = true
  ) THEN
    RETURN false;
  END IF;

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
    AND c.channel_id = ANY(allowed);
  RETURN found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_touch_wa_conversation(bigint, text, uuid, text, text) TO anon, authenticated, service_role;