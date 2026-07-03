CREATE OR REPLACE FUNCTION public.vendor_cancel_wa_flow_run(
  _vendor_id bigint,
  _codigo text,
  _run_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  target public.wa_flow_runs%rowtype;
  cancelled_count integer := 0;
  variants text[];
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN 0; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendedores v
    WHERE v.id = _vendor_id
      AND v.codigo = _codigo
      AND coalesce(v.ativo, true) = true
  ) THEN
    RETURN 0;
  END IF;

  SELECT * INTO target
  FROM public.wa_flow_runs r
  WHERE r.id = _run_id
    AND r.channel_id = ANY(allowed)
  LIMIT 1;

  IF NOT FOUND THEN RETURN 0; END IF;

  variants := ARRAY[
    target.contact_wa_id,
    regexp_replace(target.contact_wa_id, '\\D', '', 'g'),
    CASE
      WHEN regexp_replace(target.contact_wa_id, '\\D', '', 'g') ~ '^55[0-9]{2}9[0-9]{8}$'
      THEN substr(regexp_replace(target.contact_wa_id, '\\D', '', 'g'), 1, 4) || substr(regexp_replace(target.contact_wa_id, '\\D', '', 'g'), 6)
      ELSE NULL
    END,
    CASE
      WHEN regexp_replace(target.contact_wa_id, '\\D', '', 'g') ~ '^55[0-9]{10}$'
      THEN substr(regexp_replace(target.contact_wa_id, '\\D', '', 'g'), 1, 4) || '9' || substr(regexp_replace(target.contact_wa_id, '\\D', '', 'g'), 5)
      ELSE NULL
    END
  ];

  UPDATE public.wa_flow_runs r
  SET
    status = 'cancelled',
    waiting_for = NULL,
    expires_at = NULL,
    error = 'Cancelado manualmente',
    updated_at = now()
  WHERE r.flow_id = target.flow_id
    AND r.channel_id = target.channel_id
    AND r.channel_id = ANY(allowed)
    AND r.contact_wa_id = ANY(SELECT DISTINCT unnest(variants) WHERE unnest IS NOT NULL AND unnest <> '')
    AND r.status = ANY(ARRAY['queued', 'running', 'waiting']);

  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN cancelled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) TO anon, authenticated, service_role;