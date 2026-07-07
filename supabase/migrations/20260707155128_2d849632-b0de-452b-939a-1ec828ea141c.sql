CREATE OR REPLACE FUNCTION public.assign_vendor_for_channel(_channel_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  chosen integer;
  v_operacao text;
BEGIN
  -- 1) Prioridade absoluta: vendedores explicitamente vinculados ao canal/número.
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

  -- 2) Fallback seguro: somente vendedor da mesma operação e sem canal explícito.
  SELECT operacao_id INTO v_operacao FROM public.wa_channels WHERE id::text = _channel_id LIMIT 1;

  IF v_operacao IS NOT NULL AND v_operacao <> '' THEN
    WITH pool AS (
      SELECT id, GREATEST(COALESCE(lead_weight, 1), 0)::numeric AS w
      FROM public.vendedores
      WHERE COALESCE(ativo, true) = true
        AND (COALESCE(wa_channel_ids, '{}'::text[]) = '{}'::text[])
        AND public._vendor_norm(expert) = public._vendor_norm(v_operacao)
    ),
    totals AS (SELECT NULLIF(SUM(w), 0) AS s FROM pool),
    pick AS (SELECT (random() * COALESCE((SELECT s FROM totals), 0)) AS r),
    cumulative AS (SELECT id, SUM(w) OVER (ORDER BY id) AS cw FROM pool)
    SELECT id INTO chosen FROM cumulative, pick WHERE cw >= pick.r ORDER BY cw ASC LIMIT 1;
  END IF;

  -- Sem vendedor compatível: não atribui pra pessoa errada.
  RETURN chosen;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_vendor_for_channel(text) TO authenticated, anon, service_role;