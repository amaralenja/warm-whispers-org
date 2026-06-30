CREATE TABLE IF NOT EXISTS public.wa_ai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL,
  contact_wa text NOT NULL,
  contact_name text,
  reminder_id uuid,
  calendar_event_id text,
  status text NOT NULL DEFAULT 'active',
  last_button text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_ai_sessions_active_uniq
  ON public.wa_ai_sessions(channel_id, contact_wa)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS wa_ai_sessions_contact_idx
  ON public.wa_ai_sessions(contact_wa);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_ai_sessions TO authenticated;
GRANT ALL ON public.wa_ai_sessions TO service_role;

ALTER TABLE public.wa_ai_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_ai_sessions auth full access"
  ON public.wa_ai_sessions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS wa_ai_sessions_updated_at ON public.wa_ai_sessions;
CREATE TRIGGER wa_ai_sessions_updated_at
  BEFORE UPDATE ON public.wa_ai_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();