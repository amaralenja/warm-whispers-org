ALTER TABLE public.ht_customer_success ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'x1';
ALTER TABLE public.ht_customer_success DROP CONSTRAINT IF EXISTS ht_customer_success_categoria_check;
ALTER TABLE public.ht_customer_success ADD CONSTRAINT ht_customer_success_categoria_check CHECK (categoria IN ('x1', 'grupo', 'individual'));
CREATE INDEX IF NOT EXISTS ht_customer_success_categoria_idx ON public.ht_customer_success (categoria);