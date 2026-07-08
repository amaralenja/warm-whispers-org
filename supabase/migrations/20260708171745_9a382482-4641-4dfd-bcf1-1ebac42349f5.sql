
-- Fetch a WhatsApp message for a vendor (used to react)
CREATE OR REPLACE FUNCTION public.vendor_get_wa_message_for_react(
  _vendor_id bigint,
  _codigo text,
  _message_id uuid
)
RETURNS TABLE(id uuid, wa_message_id text, channel_id text, conversation_id uuid, contact_wa_id text, raw jsonb)
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
  SELECT m.id, m.wa_message_id, m.channel_id, m.conversation_id, c.contact_wa_id, m.raw
  FROM public.wa_messages m
  JOIN public.wa_conversations c ON c.id = m.conversation_id
  WHERE m.id = _message_id
    AND m.channel_id = ANY(allowed)
    AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL)
    AND EXISTS (
      SELECT 1 FROM public.vendedores v
      WHERE v.id = _vendor_id AND v.codigo = _codigo AND coalesce(v.ativo, true) = true
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vendor_get_wa_message_for_react(bigint, text, uuid) TO authenticated, anon, service_role;

-- Persist reaction locally in raw.reactions.mine
CREATE OR REPLACE FUNCTION public.vendor_apply_wa_reaction(
  _vendor_id bigint,
  _codigo text,
  _message_id uuid,
  _emoji text,
  _response_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  updated int;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN
    RAISE EXCEPTION 'Sessão de vendedor inválida';
  END IF;

  WITH upd AS (
    UPDATE public.wa_messages m
    SET raw = COALESCE(m.raw, '{}'::jsonb) || jsonb_build_object(
      'reactions',
      COALESCE(m.raw->'reactions', '{}'::jsonb) || jsonb_build_object(
        'mine', NULLIF(_emoji, ''),
        'mine_at', to_jsonb(now()),
        'mine_response', _response_id,
        'mine_by_vendor_id', _vendor_id
      )
    )
    FROM public.wa_conversations c
    WHERE m.id = _message_id
      AND c.id = m.conversation_id
      AND m.channel_id = ANY(allowed)
      AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL)
      AND EXISTS (
        SELECT 1 FROM public.vendedores v
        WHERE v.id = _vendor_id AND v.codigo = _codigo AND coalesce(v.ativo, true) = true
      )
    RETURNING 1
  )
  SELECT count(*) INTO updated FROM upd;

  RETURN updated > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vendor_apply_wa_reaction(bigint, text, uuid, text, text) TO authenticated, anon, service_role;
