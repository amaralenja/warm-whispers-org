-- Tabela de confirmações de pagamento para lançamentos recorrentes
-- Cada linha representa a confirmação de que um lançamento recorrente foi pago num determinado mês
CREATE TABLE IF NOT EXISTS financeiro_confirmacoes (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id BIGINT NOT NULL REFERENCES financeiro(id) ON DELETE CASCADE,
  mes           TEXT NOT NULL,  -- formato YYYY-MM
  confirmado    BOOLEAN NOT NULL DEFAULT true,
  confirmado_em TIMESTAMPTZ DEFAULT now(),
  confirmado_por TEXT,
  UNIQUE (lancamento_id, mes)
);

-- Índices para queries rápidas
CREATE INDEX IF NOT EXISTS idx_fconfirmacoes_mes ON financeiro_confirmacoes(mes);
CREATE INDEX IF NOT EXISTS idx_fconfirmacoes_lancamento ON financeiro_confirmacoes(lancamento_id);

-- RLS: apenas usuários autenticados
ALTER TABLE financeiro_confirmacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on financeiro_confirmacoes"
  ON financeiro_confirmacoes
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
