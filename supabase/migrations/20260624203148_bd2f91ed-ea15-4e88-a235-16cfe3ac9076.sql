CREATE OR REPLACE FUNCTION public.get_ranking_tv_stats(_from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH prod_map AS (
    SELECT lower(trim(nome_produto)) AS produto_key, nullif(trim(nome_expert), '') AS nome_expert
    FROM public.produtos_map
    WHERE nome_produto IS NOT NULL
  ),
  sales AS (
    SELECT
      nullif(upper(trim(v."UTM")), '') AS utm,
      COALESCE(pm.nome_expert, nullif(trim(v.nome_expert), '')) AS expert,
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
    WHERE v."Evento" = 'purchase_approved' OR v."Evento" ILIKE '%aprov%'
  ),
  filtered AS (
    SELECT *
    FROM sales
    WHERE sale_date IS NOT NULL
      AND (_from IS NULL OR sale_date >= _from)
      AND (_to IS NULL OR sale_date <= _to)
  ),
  vendor_sales AS (
    SELECT
      vd.utm,
      vd.nome,
      vd.expert,
      NULLIF(vd.foto_url, '') AS foto_url,
      COALESCE(vd.meta, 1000)::numeric AS meta,
      COALESCE(SUM(f.ticket), 0)::numeric AS faturamento,
      COUNT(f.*)::int AS vendas,
      COALESCE(SUM(f.ticket) FILTER (WHERE f.ticket >= 97), 0)::numeric AS tm_fat,
      COUNT(f.*) FILTER (WHERE f.ticket >= 97)::int AS tm_count
    FROM public.vendedores vd
    LEFT JOIN filtered f ON f.utm = upper(trim(vd.utm))
    WHERE COALESCE(vd.ativo, true) = true
    GROUP BY vd.utm, vd.nome, vd.expert, vd.foto_url, vd.meta
  ),
  ranked AS (
    SELECT
      *,
      ROW_NUMBER() OVER (ORDER BY faturamento DESC, vendas DESC, nome ASC) AS posicao,
      COALESCE(SUM(faturamento) OVER (), 0)::numeric AS total_vendors_faturamento
    FROM vendor_sales
    WHERE faturamento > 0 OR vendas > 0
  ),
  totals AS (
    SELECT
      COALESCE(SUM(ticket), 0)::numeric AS total_faturamento,
      COUNT(*)::int AS total_vendas,
      COALESCE(AVG(ticket) FILTER (WHERE ticket >= 97), 0)::numeric AS ticket_medio_geral
    FROM filtered
  ),
  goal_hits AS (
    SELECT
      posicao,
      nome,
      utm,
      expert,
      meta,
      faturamento,
      vendas,
      CASE WHEN faturamento >= meta AND meta > 0 THEN true ELSE false END AS batida
    FROM ranked
    WHERE meta > 0
    ORDER BY CASE WHEN faturamento >= meta THEN 0 ELSE 1 END, faturamento - meta DESC, faturamento DESC
    LIMIT 8
  )
  SELECT jsonb_build_object(
    'ranking', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'utm', r.utm,
          'nome', r.nome,
          'expert', r.expert,
          'fotoUrl', r.foto_url,
          'faturamento', r.faturamento,
          'vendas', r.vendas,
          'ticketMedio', CASE WHEN r.tm_count > 0 THEN r.tm_fat / r.tm_count ELSE 0 END,
          'pctTotal', CASE WHEN r.total_vendors_faturamento > 0 THEN (r.faturamento / r.total_vendors_faturamento) * 100 ELSE 0 END,
          'meta', r.meta,
          'metaPct', CASE WHEN r.meta > 0 THEN LEAST(100, (r.faturamento / r.meta) * 100) ELSE 0 END,
          'metaBatida', CASE WHEN r.meta > 0 AND r.faturamento >= r.meta THEN true ELSE false END,
          'faltamMeta', GREATEST(0, r.meta - r.faturamento)
        ) ORDER BY r.posicao
      )
      FROM ranked r
    ), '[]'::jsonb),
    'metaLogs', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'utm', g.utm,
          'nome', g.nome,
          'expert', g.expert,
          'meta', g.meta,
          'faturamento', g.faturamento,
          'vendas', g.vendas,
          'batida', g.batida
        ) ORDER BY g.batida DESC, g.faturamento - g.meta DESC, g.faturamento DESC
      )
      FROM goal_hits g
    ), '[]'::jsonb),
    'totalFaturamento', (SELECT total_faturamento FROM totals),
    'totalVendas', (SELECT total_vendas FROM totals),
    'ticketMedioGeral', (SELECT ticket_medio_geral FROM totals),
    'vendedoresAtivos', (SELECT COUNT(*) FROM ranked),
    'metaDia', COALESCE((SELECT SUM(meta) FROM vendor_sales), 0)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranking_tv_stats(date, date) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ranking_tv_stats(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_tv_stats(date, date) TO service_role;