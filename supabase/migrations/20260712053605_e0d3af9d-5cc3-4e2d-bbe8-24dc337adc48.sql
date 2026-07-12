
CREATE TABLE IF NOT EXISTS public.cakto_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  order_id text,
  customer_email text,
  customer_name text,
  customer_phone text,
  amount numeric,
  currency text,
  status text,
  product_name text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  payload jsonb NOT NULL,
  raw_headers jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cakto_events_received_at_idx ON public.cakto_events (received_at DESC);
CREATE INDEX IF NOT EXISTS cakto_events_order_id_idx ON public.cakto_events (order_id);
CREATE INDEX IF NOT EXISTS cakto_events_email_idx ON public.cakto_events (customer_email);

GRANT SELECT ON public.cakto_events TO authenticated;
GRANT ALL ON public.cakto_events TO service_role;

ALTER TABLE public.cakto_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cakto events"
ON public.cakto_events FOR SELECT TO authenticated USING (true);
