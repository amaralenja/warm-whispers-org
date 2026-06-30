ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS permissoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wa_channel_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];