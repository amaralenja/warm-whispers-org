ALTER TABLE public.meta_ads_event_logs
  ADD COLUMN IF NOT EXISTS first_name_hash text,
  ADD COLUMN IF NOT EXISTS last_name_hash text;