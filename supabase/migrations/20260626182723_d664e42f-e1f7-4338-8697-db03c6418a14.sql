
CREATE OR REPLACE FUNCTION public.get_metas_coletivas_mes()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  vendor_count AS (
    SELECT expert, COUNT(*)::int AS qtd
    FROM public.vendedores
    WHERE COALESCE(ativo, true) = true AND expert IS NOT NULL
    GROUP BY expert
  ),
  agg AS (
    SELECT
      e.id, e.nome AS expert,
      COALESCE(e.meta_nivel1, 0)::numeric AS m1,
      COALESCE(e.meta_nivel2, 0)::numeric AS m2,
      COALESCE(e.meta_nivel3, 0)::numeric AS m3,
      COALESCE(SUM(f.ticket),0)::numeric AS faturamento,
      COUNT(f.*)::int AS vendas,
      COALESCE((SELECT qtd FROM vendor_count vc WHERE vc.expert = e.nome), 0) AS qtd_vendedores
    FROM public.experts e
    LEFT JOIN filtered f ON upper(trim(f.expert)) = upper(trim(e.nome))
    WHERE COALESCE(e.ativo,true) = true
    GROUP BY e.id, e.nome, e.meta_nivel1, e.meta_nivel2, e.meta_nivel3
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'expert', a.expert,
      'faturamento', a.faturamento,
      'vendas', a.vendas,
      'qtdVendedores', a.qtd_vendedores,
      'diasRestantes', dias_restantes,
      'nivelAtual', CASE
        WHEN a.m3 > 0 AND a.faturamento >= a.m3 THEN 3
        WHEN a.m2 > 0 AND a.faturamento >= a.m2 THEN 2
        WHEN a.m1 > 0 AND a.faturamento >= a.m1 THEN 1
        ELSE 0
      END,
      'semMeta', (a.m1 = 0 AND a.m2 = 0 AND a.m3 = 0),
      'niveis', jsonb_build_array(
        jsonb_build_object(
          'nivel', 1, 'meta', a.m1,
          'pct', CASE WHEN a.m1 > 0 THEN LEAST(100, (a.faturamento / a.m1) * 100) ELSE 0 END,
          'batida', a.m1 > 0 AND a.faturamento >= a.m1,
          'faltam', GREATEST(0, a.m1 - a.faturamento),
          'porSemana', CASE WHEN a.m1 = 0 OR a.faturamento >= a.m1 THEN 0
            ELSE ROUND(((a.m1 - a.faturamento) / dias_restantes) * LEAST(7, dias_restantes), 2) END,
          'porVendedor', CASE WHEN a.qtd_vendedores > 0 AND a.m1 > 0 THEN ROUND(a.m1 / a.qtd_vendedores, 2) ELSE 0 END
        ),
        jsonb_build_object(
          'nivel', 2, 'meta', a.m2,
          'pct', CASE WHEN a.m2 > 0 THEN LEAST(100, (a.faturamento / a.m2) * 100) ELSE 0 END,
          'batida', a.m2 > 0 AND a.faturamento >= a.m2,
          'faltam', GREATEST(0, a.m2 - a.faturamento),
          'porSemana', CASE WHEN a.m2 = 0 OR a.faturamento >= a.m2 THEN 0
            ELSE ROUND(((a.m2 - a.faturamento) / dias_restantes) * LEAST(7, dias_restantes), 2) END,
          'porVendedor', CASE WHEN a.qtd_vendedores > 0 AND a.m2 > 0 THEN ROUND(a.m2 / a.qtd_vendedores, 2) ELSE 0 END
        ),
        jsonb_build_object(
          'nivel', 3, 'meta', a.m3,
          'pct', CASE WHEN a.m3 > 0 THEN LEAST(100, (a.faturamento / a.m3) * 100) ELSE 0 END,
          'batida', a.m3 > 0 AND a.faturamento >= a.m3,
          'faltam', GREATEST(0, a.m3 - a.faturamento),
          'porSemana', CASE WHEN a.m3 = 0 OR a.faturamento >= a.m3 THEN 0
            ELSE ROUND(((a.m3 - a.faturamento) / dias_restantes) * LEAST(7, dias_restantes), 2) END,
          'porVendedor', CASE WHEN a.qtd_vendedores > 0 AND a.m3 > 0 THEN ROUND(a.m3 / a.qtd_vendedores, 2) ELSE 0 END
        )
      )
    ) ORDER BY a.faturamento DESC
  )
  INTO result
  FROM agg a;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;
