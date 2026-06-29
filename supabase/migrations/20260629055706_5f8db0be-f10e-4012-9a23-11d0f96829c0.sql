CREATE TABLE public.wa_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id TEXT NOT NULL,
  phone_number_id TEXT,
  contact_wa_id TEXT NOT NULL,
  contact_name TEXT,
  operacao_id TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  last_message_direction TEXT,
  unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, contact_wa_id)
);

CREATE INDEX wa_conversations_channel_idx ON public.wa_conversations(channel_id);
CREATE INDEX wa_conversations_last_msg_idx ON public.wa_conversations(last_message_at DESC);
CREATE INDEX wa_conversations_op_idx ON public.wa_conversations(operacao_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversations TO authenticated;
GRANT ALL ON public.wa_conversations TO service_role;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.wa_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.wa_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  wa_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  msg_type TEXT NOT NULL DEFAULT 'text',
  text_body TEXT,
  media_id TEXT,
  media_url TEXT,
  media_mime TEXT,
  media_filename TEXT,
  caption TEXT,
  status TEXT DEFAULT 'sent',
  from_wa_id TEXT,
  to_wa_id TEXT,
  reply_to TEXT,
  raw JSONB,
  sent_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, wa_message_id)
);

CREATE INDEX wa_messages_conv_idx ON public.wa_messages(conversation_id, created_at DESC);
CREATE INDEX wa_messages_wa_id_idx ON public.wa_messages(wa_message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_messages TO authenticated;
GRANT ALL ON public.wa_messages TO service_role;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access msgs" ON public.wa_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
ALTER TABLE public.wa_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.wa_messages REPLICA IDENTITY FULL;

CREATE TRIGGER trg_wa_conv_updated_at
  BEFORE UPDATE ON public.wa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();