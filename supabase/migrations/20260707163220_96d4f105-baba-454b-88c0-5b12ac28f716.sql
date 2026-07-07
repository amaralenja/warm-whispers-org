CREATE OR REPLACE FUNCTION public.cancel_active_wa_flow_runs(_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  target public.wa_flow_runs%rowtype;
  cancelled_count integer := 0;
  clean text;
  variants text[];
BEGIN
  SELECT * INTO target
  FROM public.wa_flow_runs r
  WHERE r.id = _run_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  clean := regexp_replace(coalesce(target.contact_wa_id, ''), '\D', '', 'g');
  variants := ARRAY[
    target.contact_wa_id,
    clean,
    CASE WHEN clean ~ '^55[0-9]{2}9[0-9]{8}$' THEN substr(clean, 1, 4) || substr(clean, 6) ELSE NULL END,
    CASE WHEN clean ~ '^55[0-9]{10}$' THEN substr(clean, 1, 4) || '9' || substr(clean, 5) ELSE NULL END,
    CASE WHEN clean ~ '^[0-9]{2}9[0-9]{8}$' THEN '55' || clean ELSE NULL END,
    CASE WHEN clean ~ '^[0-9]{10}$' THEN '55' || substr(clean, 1, 2) || '9' || substr(clean, 3) ELSE NULL END
  ];

  UPDATE public.wa_flow_runs r
  SET
    status = 'cancelled',
    waiting_for = NULL,
    expires_at = NULL,
    error = 'Cancelado manualmente',
    updated_at = now()
  WHERE r.status = ANY(ARRAY['queued', 'running', 'waiting'])
    AND (
      r.id = target.id
      OR (
        r.flow_id = target.flow_id
        AND (
          (target.conversation_id IS NOT NULL AND r.conversation_id = target.conversation_id)
          OR (
            r.channel_id = target.channel_id
            AND r.contact_wa_id = ANY(SELECT DISTINCT unnest(variants) WHERE unnest IS NOT NULL AND unnest <> '')
          )
        )
      )
    );

  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN cancelled_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_active_wa_flow_runs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_active_wa_flow_runs(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_cancel_wa_flow_run(_vendor_id bigint, _codigo text, _run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  target public.wa_flow_runs%rowtype;
  cancelled_count integer := 0;
  clean text;
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

  clean := regexp_replace(coalesce(target.contact_wa_id, ''), '\D', '', 'g');
  variants := ARRAY[
    target.contact_wa_id,
    clean,
    CASE WHEN clean ~ '^55[0-9]{2}9[0-9]{8}$' THEN substr(clean, 1, 4) || substr(clean, 6) ELSE NULL END,
    CASE WHEN clean ~ '^55[0-9]{10}$' THEN substr(clean, 1, 4) || '9' || substr(clean, 5) ELSE NULL END,
    CASE WHEN clean ~ '^[0-9]{2}9[0-9]{8}$' THEN '55' || clean ELSE NULL END,
    CASE WHEN clean ~ '^[0-9]{10}$' THEN '55' || substr(clean, 1, 2) || '9' || substr(clean, 3) ELSE NULL END
  ];

  UPDATE public.wa_flow_runs r
  SET
    status = 'cancelled',
    waiting_for = NULL,
    expires_at = NULL,
    error = 'Cancelado manualmente',
    updated_at = now()
  WHERE r.status = ANY(ARRAY['queued', 'running', 'waiting'])
    AND r.channel_id = ANY(allowed)
    AND (
      r.id = target.id
      OR (
        r.flow_id = target.flow_id
        AND (
          (target.conversation_id IS NOT NULL AND r.conversation_id = target.conversation_id)
          OR (
            r.channel_id = target.channel_id
            AND r.contact_wa_id = ANY(SELECT DISTINCT unnest(variants) WHERE unnest IS NOT NULL AND unnest <> '')
          )
        )
      )
    );

  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN cancelled_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) TO service_role;