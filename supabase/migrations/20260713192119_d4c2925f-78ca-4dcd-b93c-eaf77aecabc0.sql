
ALTER TABLE public.ht_customer_success
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS celular text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS formulario_integracao_url text;

CREATE TABLE IF NOT EXISTS public.ht_customer_success_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL REFERENCES public.ht_customer_success(id) ON DELETE CASCADE,
  data timestamptz,
  evento text,
  responsavel text,
  link text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ht_customer_success_calls_aluno_idx
  ON public.ht_customer_success_calls (aluno_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ht_customer_success_calls TO authenticated;
GRANT ALL ON public.ht_customer_success_calls TO service_role;

ALTER TABLE public.ht_customer_success_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can manage cs calls"
  ON public.ht_customer_success_calls
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
