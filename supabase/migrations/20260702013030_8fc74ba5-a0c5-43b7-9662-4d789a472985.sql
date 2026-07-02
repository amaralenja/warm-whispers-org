CREATE OR REPLACE FUNCTION public._wa_contact_variants(_raw text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  digits text := regexp_replace(coalesce(_raw, ''), '\D', '', 'g');
  normalized text := digits;
  variants text[] := ARRAY[]::text[];
  v text;
BEGIN
  IF normalized = '' THEN
    RETURN ARRAY[]::text[];
  END IF;

  IF normalized !~ '^55' AND length(normalized) IN (10, 11) THEN
    normalized := '55' || normalized;
  END IF;

  IF length(normalized) = 12 THEN
    normalized := substring(normalized from 1 for 4) || '9' || substring(normalized from 5);
  END IF;

  variants := array_append(variants, digits);
  variants := array_append(variants, normalized);

  FOREACH v IN ARRAY variants LOOP
    IF v ~ '^55' AND length(v) = 13 AND substring(v from 5 for 1) = '9' THEN
      variants := array_append(variants, substring(v from 1 for 4) || substring(v from 6));
    END IF;
    IF v ~ '^55' AND length(v) = 12 THEN
      variants := array_append(variants, substring(v from 1 for 4) || '9' || substring(v from 5));
    END IF;
  END LOOP;

  RETURN ARRAY(SELECT DISTINCT x FROM unnest(variants) x WHERE coalesce(x, '') <> '');
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
      AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL)
    LIMIT 1;

    IF FOUND THEN
      IF v_conv.assigned_vendor_id IS NULL THEN
        UPDATE public.wa_conversations
        SET assigned_vendor_id = _vendor_id,
            updated_at = now()
        WHERE id = v_conv.id
          AND assigned_vendor_id IS NULL
        RETURNING * INTO v_conv;
      END IF;
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
    AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL)
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    IF v_conv.assigned_vendor_id IS NULL THEN
      UPDATE public.wa_conversations
      SET assigned_vendor_id = _vendor_id,
          updated_at = now()
      WHERE id = v_conv.id
        AND assigned_vendor_id IS NULL
      RETURNING * INTO v_conv;
    END IF;
    RETURN NEXT v_conv;
    RETURN;
  END IF;

  v_contact := (public._wa_contact_variants(_contact_wa_id))[1];
  IF nullif(v_contact, '') IS NULL THEN RETURN; END IF;

  INSERT INTO public.wa_conversations (
    channel_id,
    contact_wa_id,
    assigned_vendor_id,
    operacao_id,
    last_message_at,
    unread_count
  ) VALUES (
    _channel_id,
    v_contact,
    _vendor_id,
    nullif(v_vendor.expert, ''),
    now(),
    0
  )
  ON CONFLICT (channel_id, contact_wa_id) DO UPDATE SET
    assigned_vendor_id = coalesce(public.wa_conversations.assigned_vendor_id, _vendor_id),
    updated_at = now()
  RETURNING * INTO v_conv;

  IF v_conv.assigned_vendor_id = _vendor_id THEN
    RETURN NEXT v_conv;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_insert_wa_message(
  _vendor_id bigint,
  _codigo text,
  _conversation_id uuid,
  _channel_id text,
  _wa_message_id text DEFAULT NULL,
  _direction text DEFAULT 'out',
  _msg_type text DEFAULT 'text',
  _text_body text DEFAULT NULL,
  _media_url text DEFAULT NULL,
  _media_filename text DEFAULT NULL,
  _caption text DEFAULT NULL,
  _from_wa_id text DEFAULT NULL,
  _to_wa_id text DEFAULT NULL,
  _status text DEFAULT 'pending',
  _raw jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  conv public.wa_conversations%rowtype;
  msg_id uuid;
BEGIN
  SELECT * INTO conv
  FROM public.vendor_resolve_wa_conversation(_vendor_id, _codigo, _conversation_id, _channel_id, _to_wa_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  INSERT INTO public.wa_messages (
    conversation_id,
    channel_id,
    wa_message_id,
    direction,
    msg_type,
    text_body,
    media_url,
    media_filename,
    caption,
    from_wa_id,
    to_wa_id,
    status,
    raw
  ) VALUES (
    conv.id,
    conv.channel_id,
    _wa_message_id,
    _direction,
    _msg_type,
    _text_body,
    _media_url,
    _media_filename,
    _caption,
    _from_wa_id,
    _to_wa_id,
    _status,
    coalesce(_raw, '{}'::jsonb) || jsonb_build_object('sent_by_vendor_id', _vendor_id)
  )
  RETURNING id INTO msg_id;

  RETURN msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_update_wa_message_status(
  _vendor_id bigint,
  _codigo text,
  _message_id uuid,
  _wa_message_id text DEFAULT NULL,
  _status text DEFAULT NULL,
  _raw jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  UPDATE public.wa_messages m
  SET wa_message_id = coalesce(_wa_message_id, m.wa_message_id),
      status = coalesce(_status, m.status),
      raw = coalesce(_raw, m.raw)
  FROM public.wa_conversations c
  WHERE m.id = _message_id
    AND c.id = m.conversation_id
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
BEGIN
  UPDATE public.wa_conversations c
  SET last_message_at = now(),
      last_message_preview = _preview,
      last_message_direction = _direction,
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

GRANT EXECUTE ON FUNCTION public._wa_contact_variants(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_resolve_wa_conversation(bigint, text, uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_insert_wa_message(bigint, text, uuid, text, text, text, text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_update_wa_message_status(bigint, text, uuid, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_touch_wa_conversation(bigint, text, uuid, text, text) TO anon, authenticated, service_role;