CREATE OR REPLACE FUNCTION public.vendor_list_x1_wa_conversations(
  _vendor_id bigint,
  _codigo text,
  _operacao_id text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS SETOF public.wa_conversations
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed_channels text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed_channels, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.*
  FROM public.wa_conversations c
  WHERE c.channel_id = ANY(allowed_channels)
    AND coalesce(c.operacao_id, '') <> '__notificador__'
    AND (_operacao_id IS NULL OR public._vendor_norm(c.operacao_id) = public._vendor_norm(_operacao_id))
    AND (
      (_from IS NULL AND _to IS NULL)
      OR (
        coalesce(c.last_message_at, c.created_at) IS NOT NULL
        AND (_from IS NULL OR coalesce(c.last_message_at, c.created_at) >= _from)
        AND (_to IS NULL OR coalesce(c.last_message_at, c.created_at) <= _to)
      )
      OR (
        c.created_at IS NOT NULL
        AND (_from IS NULL OR c.created_at >= _from)
        AND (_to IS NULL OR c.created_at <= _to)
      )
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
  LIMIT 5000;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_x1_wa_messages(
  _vendor_id bigint,
  _codigo text,
  _operacao_id text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS SETOF public.wa_messages
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed_channels text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed_channels, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT m.*
  FROM public.wa_messages m
  JOIN public.wa_channels ch ON ch.id = m.channel_id
  WHERE m.channel_id = ANY(allowed_channels)
    AND m.deleted_at IS NULL
    AND coalesce(ch.operacao_id, '') <> '__notificador__'
    AND (_operacao_id IS NULL OR public._vendor_norm(ch.operacao_id) = public._vendor_norm(_operacao_id))
    AND (_from IS NULL OR m.created_at >= _from)
    AND (_to IS NULL OR m.created_at <= _to)
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 10000;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_list_x1_wa_conversations(bigint, text, text, timestamptz, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_x1_wa_messages(bigint, text, text, timestamptz, timestamptz) TO anon, authenticated, service_role;