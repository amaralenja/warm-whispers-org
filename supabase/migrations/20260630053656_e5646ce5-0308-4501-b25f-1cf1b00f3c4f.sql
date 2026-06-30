
ALTER TABLE public.wa_call_reminders
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'attendance';

CREATE INDEX IF NOT EXISTS wa_call_reminders_event_kind_idx
  ON public.wa_call_reminders (event_id, kind);
