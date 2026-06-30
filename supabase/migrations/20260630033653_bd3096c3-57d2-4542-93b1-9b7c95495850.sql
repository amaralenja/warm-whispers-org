
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS lead_weight numeric NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.assign_vendor_for_channel(_channel_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chosen integer;
BEGIN
  WITH pool AS (
    SELECT id, GREATEST(COALESCE(lead_weight, 1), 0)::numeric AS w
    FROM public.vendedores
    WHERE COALESCE(ativo, true) = true
      AND _channel_id = ANY(COALESCE(wa_channel_ids, '{}'::text[]))
  ),
  totals AS (SELECT NULLIF(SUM(w), 0) AS s FROM pool),
  pick AS (SELECT (random() * COALESCE((SELECT s FROM totals), 0)) AS r),
  cumulative AS (
    SELECT id, SUM(w) OVER (ORDER BY id) AS cw FROM pool
  )
  SELECT id INTO chosen
  FROM cumulative, pick
  WHERE cw >= pick.r
  ORDER BY cw ASC
  LIMIT 1;

  IF chosen IS NULL THEN
    SELECT id INTO chosen
    FROM public.vendedores
    WHERE COALESCE(ativo, true) = true
      AND _channel_id = ANY(COALESCE(wa_channel_ids, '{}'::text[]))
    ORDER BY random()
    LIMIT 1;
  END IF;
  RETURN chosen;
END;
$$;
