
CREATE TABLE public.ht_contas_receber (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  whatsapp TEXT,
  closer TEXT,
  faturamento_total NUMERIC NOT NULL DEFAULT 0,
  recebido NUMERIC NOT NULL DEFAULT 0,
  falta_receber NUMERIC GENERATED ALWAYS AS (GREATEST(0, faturamento_total - recebido)) STORED,
  data_fechamento DATE,
  previsao_pagar_restante DATE,
  status TEXT NOT NULL DEFAULT 'aberto',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ht_contas_receber TO authenticated;
GRANT ALL ON public.ht_contas_receber TO service_role;
ALTER TABLE public.ht_contas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage ht_contas_receber" ON public.ht_contas_receber FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_ht_contas_receber_updated BEFORE UPDATE ON public.ht_contas_receber FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
