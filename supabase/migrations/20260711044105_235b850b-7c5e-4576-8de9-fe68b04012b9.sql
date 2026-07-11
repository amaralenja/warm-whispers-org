
CREATE TABLE public.wa_remarketing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  operacao TEXT NOT NULL,
  channel_id UUID,
  flow_id UUID NOT NULL,
  minutes_before_close INT NOT NULL DEFAULT 30 CHECK (minutes_before_close >= 1 AND minutes_before_close <= 1440),
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_remarketing_rules TO authenticated;
GRANT ALL ON public.wa_remarketing_rules TO service_role;
ALTER TABLE public.wa_remarketing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage remarketing rules" ON public.wa_remarketing_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX wa_remarketing_rules_active ON public.wa_remarketing_rules (ativo, operacao) WHERE ativo = true;
CREATE TRIGGER update_wa_remarketing_rules_updated_at
  BEFORE UPDATE ON public.wa_remarketing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.wa_remarketing_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.wa_remarketing_rules(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  contact_wa_id TEXT NOT NULL,
  window_key TEXT NOT NULL,
  run_id UUID,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_remarketing_dispatches TO authenticated;
GRANT ALL ON public.wa_remarketing_dispatches TO service_role;
ALTER TABLE public.wa_remarketing_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read remarketing dispatches" ON public.wa_remarketing_dispatches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX wa_remarketing_dispatch_unique ON public.wa_remarketing_dispatches (rule_id, conversation_id, window_key);
CREATE INDEX wa_remarketing_dispatches_recent ON public.wa_remarketing_dispatches (fired_at DESC);
