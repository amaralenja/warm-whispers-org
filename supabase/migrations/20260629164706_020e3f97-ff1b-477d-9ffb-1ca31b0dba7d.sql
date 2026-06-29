
CREATE TABLE public.crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#3b82f6',
  operacao text NOT NULL DEFAULT 'x1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operacao, nome)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tags TO authenticated;
GRANT ALL ON public.crm_tags TO service_role;

ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth manage crm_tags" ON public.crm_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_crm_tags_updated_at
  BEFORE UPDATE ON public.crm_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
