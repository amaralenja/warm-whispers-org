
ALTER TABLE public.wa_flow_triggers
  ADD COLUMN IF NOT EXISTS days_of_week int[] NULL,
  ADD COLUMN IF NOT EXISTS time_start text NULL,
  ADD COLUMN IF NOT EXISTS time_end text NULL,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE OR REPLACE FUNCTION public.vendor_replace_wa_flow_triggers(_vendor_id bigint, _codigo text, _flow_id uuid, _triggers jsonb DEFAULT '[]'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  has_access boolean := false;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  SELECT true INTO has_access FROM public.wa_flows f
   WHERE f.id = _flow_id AND (f.operacao_id IS NULL OR EXISTS (
     SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)))
   LIMIT 1;
  IF NOT coalesce(has_access, false) THEN RETURN false; END IF;
  DELETE FROM public.wa_flow_triggers WHERE flow_id = _flow_id;
  INSERT INTO public.wa_flow_triggers (flow_id, tipo, valor, match_mode, channel_id, ativo, days_of_week, time_start, time_end, timezone)
  SELECT _flow_id, coalesce(t->>'tipo', 'manual'), nullif(t->>'valor', ''),
         coalesce(nullif(t->>'match_mode', ''), 'contains'), nullif(t->>'channel_id', ''),
         coalesce((t->>'ativo')::boolean, true),
         CASE WHEN jsonb_typeof(t->'days_of_week') = 'array'
              THEN ARRAY(SELECT (x)::int FROM jsonb_array_elements_text(t->'days_of_week') x)
              ELSE NULL END,
         nullif(t->>'time_start', ''),
         nullif(t->>'time_end', ''),
         coalesce(nullif(t->>'timezone', ''), 'America/Sao_Paulo')
  FROM jsonb_array_elements(coalesce(_triggers, '[]'::jsonb)) t;
  RETURN true;
END;
$function$;
