
ALTER TABLE public.experts ADD COLUMN IF NOT EXISTS meta_mensal numeric NOT NULL DEFAULT 45000;

CREATE OR REPLACE FUNCTION public.get_metas_coletivas_mes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  mes_inicio date := date_trunc('month', now())::date;
  mes_fim date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  dias_restantes int := GREATEST(1, (mes_fim - CURRENT_DATE) + 1);
BEGIN
  WITH prod_map AS (
    SELECT lower(trim(nome_produto)) AS produto_key, nullif(trim(nome_expert), '') AS nome_expert
    FROM public.produtos_map
  ),
  sales AS (
    SELECT
      COALESCE(pm.nome_expert, nullif(trim(v.nome_expert),'')) AS expert,
      CASE
        WHEN v."Ticket" IS NULL THEN 0::numeric
        WHEN replace(regexp_replace(v."Ticket", '[^0-9,.-]', '', 'g'), ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN replace(regexp_replace(v."Ticket", '[^0-9,.-]', '', 'g'), ',', '.')::numeric
        ELSE 0::numeric
      END AS ticket,
      CASE
        WHEN v."Data" ~ '^\d{4}-\d{2}-\d{2}' THEN substring(v."Data" from 1 for 10)::date
        WHEN v."Data" ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(substring(v."Data" from 1 for 10), 'DD/MM/YYYY')
        WHEN v."Data" ~ '^\d{2}-\d{2}-\d{4}' THEN to_date(substring(v."Data" from 1 for 10), 'DD-MM-YYYY')
        ELSE NULL::date
      END AS sale_date
    FROM public.vendas v
    LEFT JOIN prod_map pm ON pm.produto_key = lower(trim(v."Produto"))
    WHERE (v."Evento" = 'purchase_approved' OR v."Evento" ILIKE '%aprov%')
  ),
  filtered AS (
    SELECT expert, ticket FROM sales WHERE sale_date BETWEEN mes_inicio AND mes_fim
  ),
  agg AS (
    SELECT
      e.id, e.nome AS expert, e.meta_mensal AS meta,
      COALESCE(SUM(f.ticket),0)::numeric AS faturamento,
      COUNT(f.*)::int AS vendas
    FROM public.experts e
    LEFT JOIN filtered f ON upper(trim(f.expert)) = upper(trim(e.nome))
    WHERE COALESCE(e.ativo,true) = true
    GROUP BY e.id, e.nome, e.meta_mensal
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'expert', a.expert,
      'faturamento', a.faturamento,
      'vendas', a.vendas,
      'meta', a.meta,
      'pct', CASE WHEN a.meta > 0 THEN LEAST(100, (a.faturamento / a.meta) * 100) ELSE 0 END,
      'nivel', CASE
        WHEN a.meta <= 0 THEN 0
        WHEN a.faturamento >= a.meta THEN 4
        WHEN a.faturamento >= a.meta * 0.75 THEN 3
        WHEN a.faturamento >= a.meta * 0.5 THEN 2
        ELSE 1
      END,
      'diasRestantes', dias_restantes,
      'necessarioSemana', CASE
        WHEN a.meta <= 0 OR a.faturamento >= a.meta THEN 0
        ELSE ROUND(((a.meta - a.faturamento) / dias_restantes) * LEAST(7, dias_restantes), 2)
      END,
      'faltam', GREATEST(0, a.meta - a.faturamento)
    ) ORDER BY a.faturamento DESC
  )
  INTO result
  FROM agg a;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_metas_coletivas_mes() TO anon, authenticated, service_role;
