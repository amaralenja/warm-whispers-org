
CREATE OR REPLACE FUNCTION public.vendor_list_wa_conversations(_vendor_id bigint, _codigo text, _operacao_id text DEFAULT NULL)
RETURNS SETOF public.wa_conversations
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.*
  FROM public.wa_conversations c
  WHERE c.channel_id = ANY(allowed)
    AND coalesce(c.operacao_id, '') <> '__notificador__'
    AND (_operacao_id IS NULL OR public._vendor_norm(c.operacao_id) = public._vendor_norm(_operacao_id))
    AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL)
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT 2000;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_wa_messages(_vendor_id bigint, _codigo text, _conversation_id uuid)
RETURNS SETOF public.wa_messages
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  conv record;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  SELECT id, channel_id, assigned_vendor_id
  INTO conv
  FROM public.wa_conversations
  WHERE id = _conversation_id
    AND channel_id = ANY(allowed)
    AND (assigned_vendor_id = _vendor_id OR assigned_vendor_id IS NULL)
  LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT m.*
  FROM public.wa_messages m
  WHERE m.conversation_id = _conversation_id
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 2000;
END;
$$;
