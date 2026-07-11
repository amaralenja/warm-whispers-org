
CREATE TABLE public.ht_team (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text,
  tipo text NOT NULL DEFAULT 'closer' CHECK (tipo IN ('sdr','closer')),
  telefone text,
  foto_url text,
  codigo text UNIQUE,
  ativo boolean DEFAULT true,
  permissoes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ht_team TO authenticated;
GRANT ALL ON public.ht_team TO service_role;

ALTER TABLE public.ht_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access ht_team"
  ON public.ht_team FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.generate_ht_team_codigo()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_code text;
  attempts int := 0;
BEGIN
  LOOP
    new_code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    IF NOT EXISTS (SELECT 1 FROM public.ht_team WHERE codigo = new_code)
       AND NOT EXISTS (SELECT 1 FROM public.vendedores WHERE codigo = new_code)
    THEN
      RETURN new_code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 50 THEN RAISE EXCEPTION 'Could not generate unique ht_team code'; END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ht_team_codigo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := public.generate_ht_team_codigo();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_ht_team_codigo
  BEFORE INSERT ON public.ht_team
  FOR EACH ROW EXECUTE FUNCTION public.set_ht_team_codigo();

CREATE TRIGGER trg_ht_team_updated_at
  BEFORE UPDATE ON public.ht_team
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.login_ht_team_by_codigo(_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v record;
BEGIN
  SELECT id, nome, tipo, telefone, foto_url, codigo, ativo, permissoes
  INTO v
  FROM public.ht_team
  WHERE codigo = _codigo AND COALESCE(ativo, true) = true
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v);
END;
$$;
