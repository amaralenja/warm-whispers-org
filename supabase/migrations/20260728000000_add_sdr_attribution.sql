-- Track SDR attribution in kanban state
ALTER TABLE public.ht_kanban_state ADD COLUMN IF NOT EXISTS sdr_email text;
ALTER TABLE public.ht_kanban_state ADD COLUMN IF NOT EXISTS sdr_nome text;
