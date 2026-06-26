
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  email text,
  expert text,
  fonte text,
  status text NOT NULL DEFAULT 'novo',
  responsavel_utm text,
  responsavel_nome text,
  valor_estimado numeric DEFAULT 0,
  tags text[] DEFAULT '{}'::text[],
  notas text,
  ultima_interacao timestamptz,
  dados jsonb DEFAULT '{}'::jsonb,
  ordem int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;
GRANT ALL ON public.crm_leads TO service_role;

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view leads"
  ON public.crm_leads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert leads"
  ON public.crm_leads FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update leads"
  ON public.crm_leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete leads"
  ON public.crm_leads FOR DELETE TO authenticated USING (true);

CREATE TRIGGER crm_leads_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS crm_leads_expert_idx  ON public.crm_leads (expert);
CREATE INDEX IF NOT EXISTS crm_leads_status_idx  ON public.crm_leads (status);
CREATE INDEX IF NOT EXISTS crm_leads_created_idx ON public.crm_leads (created_at DESC);
