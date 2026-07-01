
CREATE OR REPLACE FUNCTION public.assign_vendor_for_channel(_channel_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  chosen integer;
  v_operacao text;
BEGIN
  -- 1) Try vendors explicitly linked to the channel
  WITH pool AS (
    SELECT id, GREATEST(COALESCE(lead_weight, 1), 0)::numeric AS w
    FROM public.vendedores
    WHERE COALESCE(ativo, true) = true
      AND _channel_id = ANY(COALESCE(wa_channel_ids, '{}'::text[]))
  ),
  totals AS (SELECT NULLIF(SUM(w), 0) AS s FROM pool),
  pick AS (SELECT (random() * COALESCE((SELECT s FROM totals), 0)) AS r),
  cumulative AS (SELECT id, SUM(w) OVER (ORDER BY id) AS cw FROM pool)
  SELECT id INTO chosen FROM cumulative, pick WHERE cw >= pick.r ORDER BY cw ASC LIMIT 1;

  IF chosen IS NOT NULL THEN
    RETURN chosen;
  END IF;

  -- 2) Fallback: match vendors by operacao (wa_channels.operacao_id -> vendedores.expert)
  SELECT operacao_id INTO v_operacao FROM public.wa_channels WHERE id::text = _channel_id LIMIT 1;

  IF v_operacao IS NOT NULL AND v_operacao <> '' THEN
    WITH pool AS (
      SELECT id, GREATEST(COALESCE(lead_weight, 1), 0)::numeric AS w
      FROM public.vendedores
      WHERE COALESCE(ativo, true) = true
        AND (COALESCE(wa_channel_ids, '{}'::text[]) = '{}'::text[])
        AND lower(trim(COALESCE(expert, ''))) = lower(trim(v_operacao))
    ),
    totals AS (SELECT NULLIF(SUM(w), 0) AS s FROM pool),
    pick AS (SELECT (random() * COALESCE((SELECT s FROM totals), 0)) AS r),
    cumulative AS (SELECT id, SUM(w) OVER (ORDER BY id) AS cw FROM pool)
    SELECT id INTO chosen FROM cumulative, pick WHERE cw >= pick.r ORDER BY cw ASC LIMIT 1;
  END IF;

  IF chosen IS NOT NULL THEN
    RETURN chosen;
  END IF;

  -- 3) Last resort: any active vendor without channel restriction (coringas)
  WITH pool AS (
    SELECT id, GREATEST(COALESCE(lead_weight, 1), 0)::numeric AS w
    FROM public.vendedores
    WHERE COALESCE(ativo, true) = true
      AND (COALESCE(wa_channel_ids, '{}'::text[]) = '{}'::text[])
  ),
  totals AS (SELECT NULLIF(SUM(w), 0) AS s FROM pool),
  pick AS (SELECT (random() * COALESCE((SELECT s FROM totals), 0)) AS r),
  cumulative AS (SELECT id, SUM(w) OVER (ORDER BY id) AS cw FROM pool)
  SELECT id INTO chosen FROM cumulative, pick WHERE cw >= pick.r ORDER BY cw ASC LIMIT 1;

  RETURN chosen;
END;
$function$;
