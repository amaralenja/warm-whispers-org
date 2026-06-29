-- Add unique numeric access code for vendedores
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS codigo text UNIQUE;

-- Function to generate a unique 6-digit code
CREATE OR REPLACE FUNCTION public.generate_vendedor_codigo()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  new_code text;
  attempts int := 0;
BEGIN
  LOOP
    new_code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    IF NOT EXISTS (SELECT 1 FROM public.vendedores WHERE codigo = new_code) THEN
      RETURN new_code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate unique vendedor code';
    END IF;
  END LOOP;
END;
$$;

-- Backfill codes for existing vendedores
UPDATE public.vendedores SET codigo = public.generate_vendedor_codigo() WHERE codigo IS NULL;

-- Trigger to auto-generate on insert
CREATE OR REPLACE FUNCTION public.set_vendedor_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := public.generate_vendedor_codigo();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_vendedor_codigo ON public.vendedores;
CREATE TRIGGER trg_set_vendedor_codigo
BEFORE INSERT ON public.vendedores
FOR EACH ROW EXECUTE FUNCTION public.set_vendedor_codigo();

-- Allow anonymous lookup by code only (returns minimal data for login)
CREATE OR REPLACE FUNCTION public.login_vendedor_by_codigo(_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
BEGIN
  SELECT id, nome, utm, expert, foto_url, codigo, ativo
  INTO v
  FROM public.vendedores
  WHERE codigo = _codigo AND COALESCE(ativo, true) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v);
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_vendedor_by_codigo(text) TO anon, authenticated;