
CREATE TABLE public.vendor_checkouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id integer NOT NULL,
  nome text NOT NULL,
  mensagem text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_checkouts_vendedor_idx ON public.vendor_checkouts(vendedor_id);

GRANT ALL ON public.vendor_checkouts TO service_role;

ALTER TABLE public.vendor_checkouts ENABLE ROW LEVEL SECURITY;

-- Server functions use supabaseAdmin (service_role) and scope by context.vendor.id.
-- No anon/authenticated policies: table is only reachable via server functions.
