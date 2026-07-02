
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS notes text;

-- Vendor-scoped RPC: update tags
CREATE OR REPLACE FUNCTION public.vendor_update_conversation_tags(
  _vendor_id bigint, _codigo text, _conversation_id uuid, _tags text[]
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  UPDATE public.wa_conversations c
     SET tags = COALESCE(_tags, '{}'::text[]), updated_at = now()
   WHERE c.id = _conversation_id
     AND c.channel_id = ANY(allowed)
     AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL);
  RETURN found;
END;
$$;

-- Vendor-scoped RPC: update notes
CREATE OR REPLACE FUNCTION public.vendor_update_conversation_notes(
  _vendor_id bigint, _codigo text, _conversation_id uuid, _notes text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  UPDATE public.wa_conversations c
     SET notes = _notes, updated_at = now()
   WHERE c.id = _conversation_id
     AND c.channel_id = ANY(allowed)
     AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL);
  RETURN found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_update_conversation_tags(bigint,text,uuid,text[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.vendor_update_conversation_notes(bigint,text,uuid,text) TO authenticated, anon;
