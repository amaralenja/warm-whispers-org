
CREATE TABLE public.meta_ads_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  pixel_id TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  test_event_code TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ads_config TO authenticated;
GRANT ALL ON public.meta_ads_config TO service_role;

ALTER TABLE public.meta_ads_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own meta ads config"
  ON public.meta_ads_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_meta_ads_config_updated_at
  BEFORE UPDATE ON public.meta_ads_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
