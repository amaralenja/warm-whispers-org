CREATE OR REPLACE FUNCTION public.vendor_list_x1_sales(
  _vendor_id bigint,
  _codigo text,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL
)
RETURNS TABLE(
  "Ticket" text,
  "Data" text,
  "UTM" text,
  "Evento" text,
  "Produto" text,
  nome_expert text,
  tipo_produto text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_utm text;
BEGIN
  SELECT upper(trim(v.utm))
  INTO v_utm
  FROM public.vendedores v
  WHERE v.id = _vendor_id
    AND v.codigo = _codigo
    AND coalesce(v.ativo, true) = true
  LIMIT 1;

  IF v_utm IS NULL OR v_utm = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s."Ticket",
    s."Data",
    s."UTM",
    s."Evento",
    s."Produto",
    s.nome_expert,
    s.tipo_produto
  FROM public.vendas s
  WHERE upper(trim(coalesce(s."UTM", ''))) = v_utm
    AND (
      s."Evento" = 'purchase_approved'
      OR s."Evento" ILIKE '%aprov%'
    )
    AND (
      _from IS NULL
      OR (
        CASE
          WHEN s."Data" ~ '^\d{4}-\d{2}-\d{2}' THEN substring(s."Data" from 1 for 10)::date
          WHEN s."Data" ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(substring(s."Data" from 1 for 10), 'DD/MM/YYYY')
          WHEN s."Data" ~ '^\d{2}-\d{2}-\d{4}' THEN to_date(substring(s."Data" from 1 for 10), 'DD-MM-YYYY')
          ELSE NULL::date
        END
      ) >= _from
    )
    AND (
      _to IS NULL
      OR (
        CASE
          WHEN s."Data" ~ '^\d{4}-\d{2}-\d{2}' THEN substring(s."Data" from 1 for 10)::date
          WHEN s."Data" ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(substring(s."Data" from 1 for 10), 'DD/MM/YYYY')
          WHEN s."Data" ~ '^\d{2}-\d{2}-\d{4}' THEN to_date(substring(s."Data" from 1 for 10), 'DD-MM-YYYY')
          ELSE NULL::date
        END
      ) <= _to
    )
  ORDER BY s.id ASC
  LIMIT 5000;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_list_x1_sales(bigint, text, date, date) TO anon, authenticated, service_role;