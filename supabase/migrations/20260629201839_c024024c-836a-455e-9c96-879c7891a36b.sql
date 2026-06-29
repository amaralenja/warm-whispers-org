CREATE TABLE IF NOT EXISTS public.wa_channels (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT 'WhatsApp',
  type text NOT NULL DEFAULT 'whatsapp',
  status text,
  token text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  operacao_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  connect_url text,
  app_source text NOT NULL DEFAULT 'lovable-crm',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_channels TO authenticated;
GRANT ALL ON public.wa_channels TO service_role;

ALTER TABLE public.wa_channels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'wa_channels'
      AND policyname = 'Authenticated full access wa channels'
  ) THEN
    CREATE POLICY "Authenticated full access wa channels"
      ON public.wa_channels
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS wa_channels_phone_number_id_idx ON public.wa_channels(phone_number_id);
CREATE INDEX IF NOT EXISTS wa_channels_operacao_idx ON public.wa_channels(operacao_id);
CREATE INDEX IF NOT EXISTS wa_channels_app_source_idx ON public.wa_channels(app_source);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_wa_channels_updated_at'
  ) THEN
    CREATE TRIGGER update_wa_channels_updated_at
      BEFORE UPDATE ON public.wa_channels
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;