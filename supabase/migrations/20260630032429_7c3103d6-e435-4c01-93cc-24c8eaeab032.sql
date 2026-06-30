CREATE OR REPLACE FUNCTION public.get_vendor_stats(_utm text, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_utm text := upper(trim(_utm));
  mes_inicio date := date_trunc('month', now())::date;
  mes_fim date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  d_from date := COALESCE(_from, mes_inicio);
  d_to date := COALESCE(_to, mes_fim);
BEGIN
  WITH sales AS (
    SELECT
      nullif(upper(trim(v."UTM")), '') AS utm,
      nullif(trim(v."Produto"), '') AS produto,
      nullif(trim(v."Nome"), '') AS cliente,
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
    WHERE (v."Evento" = 'purchase_approved' OR v."Evento" ILIKE '%aprov%')
  ),
  period AS (SELECT * FROM sales WHERE sale_date BETWEEN d_from AND d_to),
  my_period AS (SELECT * FROM period WHERE utm = v_utm),
  rank_all AS (
    SELECT vd.utm, vd.nome,
      COALESCE(SUM(p.ticket), 0)::numeric AS faturamento,
      COUNT(p.*)::int AS vendas
    FROM public.vendedores vd
    LEFT JOIN period p ON p.utm = upper(trim(vd.utm))
    WHERE COALESCE(vd.ativo, true) = true
    GROUP BY vd.utm, vd.nome
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY faturamento DESC, vendas DESC, nome ASC)::int AS posicao
    FROM rank_all
  ),
  vendor_info AS (
    SELECT id, nome, utm, expert, foto_url, COALESCE(meta, 0)::numeric AS meta, codigo, genero
    FROM public.vendedores WHERE upper(trim(utm)) = v_utm LIMIT 1
  ),
  serie AS (
    SELECT to_char(d::date, 'YYYY-MM-DD') AS data,
      COALESCE(SUM(mp.ticket), 0)::numeric AS total,
      COUNT(mp.*)::int AS vendas
    FROM generate_series(d_from, d_to, interval '1 day') d
    LEFT JOIN my_period mp ON mp.sale_date = d::date
    GROUP BY d ORDER BY d
  )
  SELECT jsonb_build_object(
    'vendor', (SELECT to_jsonb(v) FROM vendor_info v),
    'faturamento', (SELECT COALESCE(SUM(ticket),0) FROM my_period),
    'vendas', (SELECT COUNT(*) FROM my_period),
    'ticketMedio', (SELECT CASE WHEN COUNT(*)>0 THEN AVG(ticket) ELSE 0 END FROM my_period),
    'maiorVenda', (SELECT COALESCE(MAX(ticket),0) FROM my_period),
    'posicao', (SELECT posicao FROM ranked WHERE upper(trim(utm)) = v_utm),
    'totalVendedores', (SELECT COUNT(*) FROM ranked),
    'meta', (SELECT meta FROM vendor_info),
    'metaPct', (SELECT CASE WHEN vi.meta > 0 THEN LEAST(100, (COALESCE((SELECT SUM(ticket) FROM my_period), 0) / vi.meta) * 100) ELSE 0 END FROM vendor_info vi),
    'faltaMeta', (SELECT CASE WHEN vi.meta > 0 THEN GREATEST(0, vi.meta - COALESCE((SELECT SUM(ticket) FROM my_period), 0)) ELSE 0 END FROM vendor_info vi),
    'serieDiaria', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM serie s), '[]'::jsonb),
    'ultimasVendas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'data', to_char(sale_date, 'YYYY-MM-DD'),
        'produto', produto,
        'cliente', cliente,
        'ticket', ticket
      ) ORDER BY sale_date DESC)
      FROM (SELECT * FROM my_period ORDER BY sale_date DESC LIMIT 15) t
    ), '[]'::jsonb),
    'periodo', jsonb_build_object('from', d_from, 'to', d_to)
  ) INTO result;
  RETURN result;
END;
$function$;