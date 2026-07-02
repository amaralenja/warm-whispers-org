
CREATE TABLE IF NOT EXISTS public.sops_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  user_id uuid,
  user_email text,
  changed_fields text[] DEFAULT '{}',
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sops_history TO authenticated;
GRANT ALL ON public.sops_history TO service_role;

ALTER TABLE public.sops_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read sops history"
  ON public.sops_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role manages sops history"
  ON public.sops_history FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS sops_history_sop_id_idx ON public.sops_history(sop_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_sops_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_fields text[] := '{}';
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  BEGIN v_email := (auth.jwt() ->> 'email'); EXCEPTION WHEN OTHERS THEN v_email := NULL; END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sops_history(sop_id, action, user_id, user_email, changed_fields, new_data)
    VALUES (NEW.id, 'create', v_user_id, v_email, ARRAY['titulo','conteudo','categoria','emoji'], to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.titulo IS DISTINCT FROM OLD.titulo THEN v_fields := array_append(v_fields, 'titulo'); END IF;
    IF NEW.conteudo IS DISTINCT FROM OLD.conteudo THEN v_fields := array_append(v_fields, 'conteudo'); END IF;
    IF NEW.categoria IS DISTINCT FROM OLD.categoria THEN v_fields := array_append(v_fields, 'categoria'); END IF;
    IF NEW.emoji IS DISTINCT FROM OLD.emoji THEN v_fields := array_append(v_fields, 'emoji'); END IF;
    IF array_length(v_fields, 1) IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.sops_history(sop_id, action, user_id, user_email, changed_fields, old_data, new_data)
    VALUES (NEW.id, 'update', v_user_id, v_email, v_fields, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.sops_history(sop_id, action, user_id, user_email, changed_fields, old_data)
    VALUES (OLD.id, 'delete', v_user_id, v_email, ARRAY['*'], to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sops_history ON public.sops;
CREATE TRIGGER trg_sops_history
AFTER INSERT OR UPDATE OR DELETE ON public.sops
FOR EACH ROW EXECUTE FUNCTION public.log_sops_changes();
