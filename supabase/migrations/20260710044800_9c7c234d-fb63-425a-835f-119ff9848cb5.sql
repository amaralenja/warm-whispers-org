CREATE TABLE public.uaz_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL DEFAULT 'unknown',
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.uaz_webhook_events TO service_role;
ALTER TABLE public.uaz_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_uaz_webhook_events_created_at ON public.uaz_webhook_events (created_at DESC);