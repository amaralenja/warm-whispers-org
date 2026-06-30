ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS assigned_vendor_id integer;

CREATE INDEX IF NOT EXISTS wa_conversations_assigned_vendor_idx
  ON public.wa_conversations(assigned_vendor_id);

CREATE OR REPLACE FUNCTION public.assign_vendor_for_channel(_channel_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE chosen integer;
BEGIN
  SELECT vd.id
  INTO chosen
  FROM public.vendedores vd
  LEFT JOIN public.wa_conversations wc
    ON wc.assigned_vendor_id = vd.id AND wc.channel_id = _channel_id
  WHERE COALESCE(vd.ativo, true) = true
    AND _channel_id = ANY(COALESCE(vd.wa_channel_ids, '{}'::text[]))
  GROUP BY vd.id
  ORDER BY COUNT(wc.id) ASC, random()
  LIMIT 1;
  RETURN chosen;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_vendor_for_channel(text) TO authenticated, anon, service_role;