
CREATE TABLE public.pv24h_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  ad_account_id TEXT,
  ad_account_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pv24h_config TO authenticated;
GRANT ALL ON public.pv24h_config TO service_role;
ALTER TABLE public.pv24h_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pv24h config" ON public.pv24h_config
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
