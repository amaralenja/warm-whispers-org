
-- ============= wa_flows =============
CREATE TABLE public.wa_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  operacao_id text,
  ativo boolean NOT NULL DEFAULT false,
  entry_node_id text,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_flows TO authenticated;
GRANT ALL ON public.wa_flows TO service_role;
ALTER TABLE public.wa_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.wa_flows FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER wa_flows_updated_at BEFORE UPDATE ON public.wa_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= wa_flow_triggers =============
CREATE TABLE public.wa_flow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.wa_flows(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('keyword','any_message','new_conversation','manual')),
  valor text,
  match_mode text NOT NULL DEFAULT 'contains' CHECK (match_mode IN ('contains','equals','regex','starts_with')),
  channel_id text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_flow_triggers_flow_idx ON public.wa_flow_triggers(flow_id);
CREATE INDEX wa_flow_triggers_lookup_idx ON public.wa_flow_triggers(ativo, tipo, channel_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_flow_triggers TO authenticated;
GRANT ALL ON public.wa_flow_triggers TO service_role;
ALTER TABLE public.wa_flow_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.wa_flow_triggers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= wa_flow_runs =============
CREATE TABLE public.wa_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.wa_flows(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  contact_wa_id text NOT NULL,
  current_node_id text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','waiting','completed','failed','cancelled')),
  waiting_for text CHECK (waiting_for IN ('message','button','timer')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_flow_runs_conv_idx ON public.wa_flow_runs(conversation_id, status);
CREATE INDEX wa_flow_runs_waiting_idx ON public.wa_flow_runs(status, waiting_for, expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_flow_runs TO authenticated;
GRANT ALL ON public.wa_flow_runs TO service_role;
ALTER TABLE public.wa_flow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.wa_flow_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER wa_flow_runs_updated_at BEFORE UPDATE ON public.wa_flow_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= wa_flow_executions =============
CREATE TABLE public.wa_flow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.wa_flow_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL,
  status text NOT NULL,
  input jsonb,
  output jsonb,
  error text,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_flow_executions_run_idx ON public.wa_flow_executions(run_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_flow_executions TO authenticated;
GRANT ALL ON public.wa_flow_executions TO service_role;
ALTER TABLE public.wa_flow_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.wa_flow_executions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= realtime =============
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_flow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_flow_executions;
