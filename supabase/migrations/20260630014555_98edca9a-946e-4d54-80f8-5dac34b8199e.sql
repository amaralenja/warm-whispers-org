ALTER TABLE public.vendedores DROP COLUMN IF EXISTS wa_channel_ids;
ALTER TABLE public.vendedores ADD COLUMN wa_channel_ids text[] NOT NULL DEFAULT '{}'::text[];