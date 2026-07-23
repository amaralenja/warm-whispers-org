-- Create pv24h_vendas table for PV24H Cakto sales tracking
CREATE TABLE IF NOT EXISTS public.pv24h_vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT UNIQUE,
  cliente_nome TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  valor NUMERIC(10, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'approved',
  origem TEXT NOT NULL DEFAULT 'organico', -- 'pago' ou 'organico'
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE public.pv24h_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert to pv24h_vendas"
ON public.pv24h_vendas FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow read to authenticated users on pv24h_vendas"
ON public.pv24h_vendas FOR SELECT TO anon, authenticated
USING (true);

GRANT ALL ON public.pv24h_vendas TO anon;
GRANT ALL ON public.pv24h_vendas TO authenticated;
GRANT ALL ON public.pv24h_vendas TO service_role;
