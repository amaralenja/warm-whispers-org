CREATE TABLE public.instagram_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  full_name text,
  biography text,
  followers integer DEFAULT 0,
  following integer DEFAULT 0,
  posts_count integer DEFAULT 0,
  is_verified boolean DEFAULT false,
  profile_pic_url text,
  profile_url text,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_leads TO authenticated;
GRANT ALL ON public.instagram_leads TO service_role;

ALTER TABLE public.instagram_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read instagram_leads" ON public.instagram_leads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert instagram_leads" ON public.instagram_leads
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update instagram_leads" ON public.instagram_leads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete instagram_leads" ON public.instagram_leads
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_instagram_leads_updated
  BEFORE UPDATE ON public.instagram_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_instagram_leads_username ON public.instagram_leads (username);
CREATE INDEX idx_instagram_leads_fetched_at ON public.instagram_leads (fetched_at DESC);