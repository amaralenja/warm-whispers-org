
CREATE TABLE IF NOT EXISTS public.sops (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria text NOT NULL DEFAULT 'Geral',
  titulo text NOT NULL DEFAULT 'Novo processo',
  conteudo text NOT NULL DEFAULT '',
  emoji text,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sops TO authenticated;
GRANT ALL ON public.sops TO service_role;

ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage SOPs"
ON public.sops FOR ALL
TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sops_categoria ON public.sops(categoria, ordem);
