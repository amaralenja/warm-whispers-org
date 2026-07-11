
CREATE TABLE public.crm_bulk_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operacao TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  flow_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  delay_seconds INT NOT NULL DEFAULT 60 CHECK (delay_seconds >= 60),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','cancelled')),
  total_leads INT NOT NULL DEFAULT 0,
  eligible_leads INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bulk_dispatches TO authenticated;
GRANT ALL ON public.crm_bulk_dispatches TO service_role;
ALTER TABLE public.crm_bulk_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage own dispatches" ON public.crm_bulk_dispatches FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX crm_bulk_dispatches_active ON public.crm_bulk_dispatches (operacao, stage_id) WHERE status = 'running';

CREATE TABLE public.crm_bulk_dispatch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID NOT NULL REFERENCES public.crm_bulk_dispatches(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,
  contact_wa_id TEXT NOT NULL,
  conversation_id UUID,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped','cancelled')),
  run_id UUID,
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bulk_dispatch_items TO authenticated;
GRANT ALL ON public.crm_bulk_dispatch_items TO service_role;
ALTER TABLE public.crm_bulk_dispatch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage own dispatch items" ON public.crm_bulk_dispatch_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX crm_bulk_items_due ON public.crm_bulk_dispatch_items (scheduled_at) WHERE status = 'pending';
CREATE INDEX crm_bulk_items_dispatch ON public.crm_bulk_dispatch_items (dispatch_id);

CREATE TRIGGER update_crm_bulk_dispatches_updated_at
  BEFORE UPDATE ON public.crm_bulk_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
