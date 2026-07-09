
CREATE TABLE public.ht_lead_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'sdr',
  author TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ht_lead_notes_lead_id_idx ON public.ht_lead_notes(lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ht_lead_notes TO authenticated, anon;
GRANT ALL ON public.ht_lead_notes TO service_role;
ALTER TABLE public.ht_lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ht_lead_notes read all" ON public.ht_lead_notes FOR SELECT USING (true);
CREATE POLICY "ht_lead_notes write all" ON public.ht_lead_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "ht_lead_notes update all" ON public.ht_lead_notes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "ht_lead_notes delete all" ON public.ht_lead_notes FOR DELETE USING (true);
