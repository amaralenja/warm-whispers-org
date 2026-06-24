-- Ativa RLS e cria política de acesso para autenticados nas tabelas abertas.
-- Nenhum dado é alterado.

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'experts','vendas','vendedores',
    'ht_alunos','ht_assets','ht_leads','ht_reunioes','ht_vendas'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);

    -- Política: usuários autenticados podem tudo
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t
        AND policyname='Authenticated full access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Authenticated full access" ON public.%I
           FOR ALL TO authenticated
           USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;