ALTER TABLE public.wa_templates
  ADD COLUMN IF NOT EXISTS meta_status text,
  ADD COLUMN IF NOT EXISTS meta_category text,
  ADD COLUMN IF NOT EXISTS meta_template_id text,
  ADD COLUMN IF NOT EXISTS meta_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_channel_id text;