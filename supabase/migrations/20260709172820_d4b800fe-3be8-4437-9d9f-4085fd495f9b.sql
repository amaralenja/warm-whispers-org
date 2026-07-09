
CREATE TABLE public.ht_api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ht_api_tokens TO authenticated;
GRANT ALL ON public.ht_api_tokens TO service_role;
ALTER TABLE public.ht_api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated manage ht_api_tokens"
  ON public.ht_api_tokens FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE public.ht_quiz_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  token_id uuid REFERENCES public.ht_api_tokens(id) ON DELETE SET NULL,
  nome text,
  email text,
  whatsapp text,
  instagram text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  fbc text,
  fbp text,
  fbclid text,
  gclid text,
  respostas jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.ht_quiz_submissions TO authenticated;
GRANT ALL ON public.ht_quiz_submissions TO service_role;
ALTER TABLE public.ht_quiz_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read ht_quiz_submissions"
  ON public.ht_quiz_submissions FOR SELECT TO authenticated
  USING (true);

CREATE INDEX ht_quiz_submissions_received_at_idx
  ON public.ht_quiz_submissions (received_at DESC);
