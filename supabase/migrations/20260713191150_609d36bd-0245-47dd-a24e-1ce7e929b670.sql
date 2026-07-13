CREATE TABLE public.vendor_payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id integer NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_payment_links_vendor_idx ON public.vendor_payment_links(vendor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_payment_links TO authenticated;
GRANT ALL ON public.vendor_payment_links TO service_role;

ALTER TABLE public.vendor_payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can manage payment links"
  ON public.vendor_payment_links FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.vendor_payment_links_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER vendor_payment_links_updated
  BEFORE UPDATE ON public.vendor_payment_links
  FOR EACH ROW EXECUTE FUNCTION public.vendor_payment_links_touch();