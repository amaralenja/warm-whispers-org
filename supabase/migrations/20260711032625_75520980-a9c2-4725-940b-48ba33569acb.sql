
CREATE TABLE public.user_prefs (
  owner_key text NOT NULL,
  pref_key  text NOT NULL,
  value     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_key, pref_key)
);

GRANT ALL ON public.user_prefs TO service_role;

ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only"
  ON public.user_prefs
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
