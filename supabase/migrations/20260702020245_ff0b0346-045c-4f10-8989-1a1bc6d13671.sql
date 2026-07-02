CREATE OR REPLACE FUNCTION public.load_wa_channel_credentials(_channel_id text)
RETURNS TABLE (id text, token text, phone_number_id text, metadata jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id::text, c.token, c.phone_number_id, c.metadata
  FROM public.wa_channels c
  WHERE c.id::text = _channel_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.load_wa_channel_credentials(text) TO anon, authenticated, service_role;