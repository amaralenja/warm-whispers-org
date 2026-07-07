CREATE OR REPLACE FUNCTION public.vendor_list_wa_conversations(_vendor_id bigint, _codigo text, _operacao_id text DEFAULT NULL::text)
RETURNS SETOF public.wa_conversations
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  op_norm text := public._vendor_norm(_operacao_id);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.*
  FROM public.wa_conversations c
  WHERE c.channel_id = ANY(allowed)
    AND coalesce(c.operacao_id, '') <> '__notificador__'
    AND (_operacao_id IS NULL OR public._vendor_norm(c.operacao_id) = op_norm)
    AND c.assigned_vendor_id = _vendor_id
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT 2000;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_wa_messages(_vendor_id bigint, _codigo text, _conversation_id uuid)
RETURNS SETOF public.wa_messages
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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
    AND assigned_vendor_id = _vendor_id
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

CREATE OR REPLACE FUNCTION public.vendor_resolve_wa_conversation(
  _vendor_id bigint,
  _codigo text,
  _conversation_id uuid DEFAULT NULL,
  _channel_id text DEFAULT NULL,
  _contact_wa_id text DEFAULT NULL
)
RETURNS SETOF public.wa_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  v_vendor record;
  v_conv public.wa_conversations%rowtype;
  v_contact text;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;

  SELECT id, expert INTO v_vendor
  FROM public.vendedores
  WHERE id = _vendor_id
    AND codigo = _codigo
    AND coalesce(ativo, true) = true
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  IF _conversation_id IS NOT NULL THEN
    SELECT c.* INTO v_conv
    FROM public.wa_conversations c
    WHERE c.id = _conversation_id
      AND c.channel_id = ANY(allowed)
      AND c.assigned_vendor_id = _vendor_id
    LIMIT 1;

    IF FOUND THEN
      RETURN NEXT v_conv;
      RETURN;
    END IF;
  END IF;

  IF nullif(trim(coalesce(_channel_id, '')), '') IS NULL OR nullif(trim(coalesce(_contact_wa_id, '')), '') IS NULL THEN
    RETURN;
  END IF;

  IF NOT (_channel_id = ANY(allowed)) THEN
    RETURN;
  END IF;

  SELECT c.* INTO v_conv
  FROM public.wa_conversations c
  WHERE c.channel_id = _channel_id
    AND c.contact_wa_id = ANY(public._wa_contact_variants(_contact_wa_id))
    AND c.assigned_vendor_id = _vendor_id
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    RETURN NEXT v_conv;
    RETURN;
  END IF;

  v_contact := (public._wa_contact_variants(_contact_wa_id))[1];
  IF v_contact IS NULL THEN
    v_contact := regexp_replace(coalesce(_contact_wa_id, ''), '\D', '', 'g');
  END IF;

  INSERT INTO public.wa_conversations (
    channel_id,
    contact_wa_id,
    contact_name,
    operacao_id,
    assigned_vendor_id,
    last_message_at
  )
  VALUES (
    _channel_id,
    v_contact,
    v_contact,
    v_vendor.expert,
    _vendor_id,
    now()
  )
  ON CONFLICT (channel_id, contact_wa_id) DO UPDATE
  SET contact_name = COALESCE(public.wa_conversations.contact_name, EXCLUDED.contact_name),
      updated_at = now()
  WHERE public.wa_conversations.assigned_vendor_id = _vendor_id
  RETURNING * INTO v_conv;

  IF FOUND THEN
    RETURN NEXT v_conv;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_list_wa_conversations(bigint, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_wa_messages(bigint, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_resolve_wa_conversation(bigint, text, uuid, text, text) TO anon, authenticated, service_role;