
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS genero text CHECK (genero IN ('M','F'));

CREATE OR REPLACE FUNCTION public.get_hall_of_fame_mes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  mes_inicio date := date_trunc('month', now())::date;
  mes_fim date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  meta_lobo numeric := 18000;
  meta_rainha numeric := 20000;
BEGIN
  WITH sales AS (
    SELECT
      nullif(upper(trim(v."UTM")), '') AS utm,
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
    WHERE v."Evento" = 'purchase_approved' OR v."Evento" ILIKE '%aprov%'
  ),
  filtered AS (
    SELECT * FROM sales WHERE sale_date BETWEEN mes_inicio AND mes_fim
  ),
  vendor_mes AS (
    SELECT
      vd.utm, vd.nome, vd.expert, vd.genero, NULLIF(vd.foto_url,'') AS foto_url,
      COALESCE(SUM(f.ticket),0)::numeric AS faturamento,
      COUNT(f.*)::int AS vendas
    FROM public.vendedores vd
    LEFT JOIN filtered f ON f.utm = upper(trim(vd.utm))
    WHERE COALESCE(vd.ativo,true) = true
    GROUP BY vd.utm, vd.nome, vd.expert, vd.genero, vd.foto_url
  )
  SELECT jsonb_build_object(
    'lobo', (
      SELECT to_jsonb(t) FROM (
        SELECT utm, nome, expert, foto_url AS "fotoUrl", faturamento, vendas, meta_lobo AS meta
        FROM vendor_mes
        WHERE genero = 'M' AND faturamento >= meta_lobo
        ORDER BY faturamento DESC LIMIT 1
      ) t
    ),
    'rainha', (
      SELECT to_jsonb(t) FROM (
        SELECT utm, nome, expert, foto_url AS "fotoUrl", faturamento, vendas, meta_rainha AS meta
        FROM vendor_mes
        WHERE genero = 'F' AND faturamento >= meta_rainha
        ORDER BY faturamento DESC LIMIT 1
      ) t
    ),
    'metaLobo', meta_lobo,
    'metaRainha', meta_rainha,
    'proxLobo', (
      SELECT to_jsonb(t) FROM (
        SELECT nome, faturamento, meta_lobo AS meta
        FROM vendor_mes WHERE genero = 'M' AND faturamento < meta_lobo
        ORDER BY faturamento DESC LIMIT 1
      ) t
    ),
    'proxRainha', (
      SELECT to_jsonb(t) FROM (
        SELECT nome, faturamento, meta_rainha AS meta
        FROM vendor_mes WHERE genero = 'F' AND faturamento < meta_rainha
        ORDER BY faturamento DESC LIMIT 1
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_hall_of_fame_mes() TO anon, authenticated, service_role;
