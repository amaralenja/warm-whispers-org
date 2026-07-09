ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS wa_conversations_archived_at_idx ON public.wa_conversations (archived_at);