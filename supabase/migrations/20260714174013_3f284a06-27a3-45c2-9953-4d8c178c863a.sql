CREATE TABLE IF NOT EXISTS public.ht_kanban_state (
  lead_id text PRIMARY KEY,
  scheduled_at timestamptz,
  closer_email text,
  sdr_stage text,
  closer_stage text,
  is_fake boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ht_kanban_state TO authenticated, anon;
GRANT ALL ON public.ht_kanban_state TO service_role;

ALTER TABLE public.ht_kanban_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ht_kanban_state" ON public.ht_kanban_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public write ht_kanban_state" ON public.ht_kanban_state FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update ht_kanban_state" ON public.ht_kanban_state FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete ht_kanban_state" ON public.ht_kanban_state FOR DELETE TO anon, authenticated USING (true);