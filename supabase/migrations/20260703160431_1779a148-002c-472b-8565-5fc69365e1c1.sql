-- Impede duplicação de execuções ativas do MESMO fluxo, MESMO canal, MESMO contato.
-- Índice único parcial: só considera runs em estados ativos. Runs completed/failed/cancelled não bloqueiam novas execuções.
CREATE UNIQUE INDEX IF NOT EXISTS wa_flow_runs_active_unique_idx
  ON public.wa_flow_runs (flow_id, channel_id, contact_wa_id)
  WHERE status IN ('queued', 'running', 'waiting');