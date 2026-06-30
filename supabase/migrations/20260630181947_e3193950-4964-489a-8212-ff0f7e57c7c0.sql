ALTER TABLE public.wa_flows ADD COLUMN IF NOT EXISTS folder text;
CREATE INDEX IF NOT EXISTS idx_wa_flows_folder ON public.wa_flows(folder);