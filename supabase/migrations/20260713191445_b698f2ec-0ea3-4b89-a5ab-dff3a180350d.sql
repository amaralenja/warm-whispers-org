CREATE TABLE public.ht_customer_success (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_nome text NOT NULL,
  entrada_mentoria date,
  fase text NOT NULL DEFAULT 'espionagem',
  ultima_call timestamptz,
  whatsapp_privado text,
  grupo_whatsapp_link text,
  observacoes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ht_cs_fase_idx ON public.ht_customer_success(fase, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ht_customer_success TO authenticated;
GRANT ALL ON public.ht_customer_success TO service_role;

ALTER TABLE public.ht_customer_success ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated manage customer success"
  ON public.ht_customer_success FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ht_customer_success_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER ht_customer_success_updated
  BEFORE UPDATE ON public.ht_customer_success
  FOR EACH ROW EXECUTE FUNCTION public.ht_customer_success_touch();