
ALTER TABLE public.ht_quiz_submissions
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'partial',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS ht_quiz_submissions_token_session_uidx
  ON public.ht_quiz_submissions (token_id, session_id)
  WHERE session_id IS NOT NULL;
