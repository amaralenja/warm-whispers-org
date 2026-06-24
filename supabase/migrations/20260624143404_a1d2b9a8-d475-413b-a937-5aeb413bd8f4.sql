CREATE TABLE public.meta_ads_event_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  value NUMERIC,
  currency TEXT NOT NULL DEFAULT 'BRL',
  email_hash TEXT,
  phone_hash TEXT,
  external_id_hash TEXT,
  client_ip_hash TEXT,
  user_agent TEXT,
  event_source_url TEXT,
  match_quality_score INTEGER NOT NULL DEFAULT 0,
  events_received INTEGER,
  fbtrace_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ads_event_logs TO authenticated;
GRANT ALL ON public.meta_ads_event_logs TO service_role;

ALTER TABLE public.meta_ads_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own meta ads event logs"
  ON public.meta_ads_event_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX meta_ads_event_logs_user_created_idx
  ON public.meta_ads_event_logs (user_id, created_at DESC);

CREATE INDEX meta_ads_event_logs_user_event_idx
  ON public.meta_ads_event_logs (user_id, event_name, created_at DESC);

CREATE TRIGGER update_meta_ads_event_logs_updated_at
  BEFORE UPDATE ON public.meta_ads_event_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();