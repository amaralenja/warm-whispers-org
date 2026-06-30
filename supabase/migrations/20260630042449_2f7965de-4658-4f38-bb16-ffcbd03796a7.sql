
CREATE TABLE IF NOT EXISTS public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao text NOT NULL,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#3b82f6',
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_stages TO authenticated;
GRANT ALL ON public.crm_stages TO service_role;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_stages all auth" ON public.crm_stages;
CREATE POLICY "crm_stages all auth" ON public.crm_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.crm_tags ADD COLUMN IF NOT EXISTS stage_id text;

CREATE OR REPLACE FUNCTION public.crm_lead_apply_tag_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tag text;
  v_stage text;
  i int;
BEGIN
  IF NEW.tags IS NULL OR array_length(NEW.tags, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  FOR i IN REVERSE COALESCE(array_length(NEW.tags,1),0)..1 LOOP
    v_tag := NEW.tags[i];
    SELECT stage_id INTO v_stage FROM public.crm_tags
      WHERE nome = v_tag
        AND (operacao = COALESCE(NEW.expert, '') OR operacao = 'all')
        AND stage_id IS NOT NULL
      ORDER BY (operacao = COALESCE(NEW.expert,'')) DESC
      LIMIT 1;
    IF v_stage IS NOT NULL THEN
      NEW.status := v_stage;
      EXIT;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_lead_apply_tag_stage ON public.crm_leads;
CREATE TRIGGER trg_crm_lead_apply_tag_stage
  BEFORE INSERT OR UPDATE OF tags ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_apply_tag_stage();
