GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_remarketing_rules TO authenticated;
GRANT ALL ON public.wa_remarketing_rules TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_get_remarketing_rule(
  _vendor_id bigint,
  _codigo text,
  _rule_id uuid
)
RETURNS public.wa_remarketing_rules
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  row public.wa_remarketing_rules;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.*
  INTO row
  FROM public.wa_remarketing_rules r
  WHERE r.id = _rule_id
    AND EXISTS (
      SELECT 1 FROM unnest(allowed) a
      WHERE public._vendor_norm(r.operacao) = public._vendor_norm(a)
    )
  LIMIT 1;

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_remarketing_rules(
  _vendor_id bigint,
  _codigo text
)
RETURNS SETOF public.wa_remarketing_rules
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM public.wa_remarketing_rules r
  WHERE EXISTS (
    SELECT 1 FROM unnest(allowed) a
    WHERE public._vendor_norm(r.operacao) = public._vendor_norm(a)
  )
  ORDER BY r.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_upsert_remarketing_rule(
  _vendor_id bigint,
  _codigo text,
  _rule_id uuid,
  _nome text,
  _ativo boolean,
  _operacao text,
  _channel_id uuid,
  _flow_id uuid,
  _minutes_before_close integer,
  _conditions jsonb
)
RETURNS public.wa_remarketing_rules
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  allowed_channels text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  clean_nome text := trim(coalesce(_nome, ''));
  clean_operacao text := trim(coalesce(_operacao, ''));
  mins integer := greatest(1, least(1440, coalesce(_minutes_before_close, 30)));
  row public.wa_remarketing_rules;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN
    RAISE EXCEPTION 'Sessão de vendedor sem operação liberada';
  END IF;

  IF clean_nome = '' OR clean_operacao = '' OR _flow_id IS NULL THEN
    RAISE EXCEPTION 'Nome, operação e fluxo são obrigatórios';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM unnest(allowed) a
    WHERE public._vendor_norm(clean_operacao) = public._vendor_norm(a)
  ) THEN
    RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a esta operação';
  END IF;

  IF _channel_id IS NOT NULL AND NOT (_channel_id::text = ANY(coalesce(allowed_channels, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a este canal';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wa_flows f
    WHERE f.id = _flow_id
      AND f.operacao_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(allowed) a
        WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)
      )
  ) THEN
    RAISE EXCEPTION 'Fluxo não encontrado ou indisponível para esta operação';
  END IF;

  IF _rule_id IS NOT NULL THEN
    IF public.vendor_get_remarketing_rule(_vendor_id, _codigo, _rule_id) IS NULL THEN
      RAISE EXCEPTION 'Regra não encontrada ou indisponível para esta operação';
    END IF;

    UPDATE public.wa_remarketing_rules
    SET nome = clean_nome,
        ativo = coalesce(_ativo, true),
        operacao = clean_operacao,
        channel_id = _channel_id,
        flow_id = _flow_id,
        minutes_before_close = mins,
        conditions = coalesce(_conditions, '[]'::jsonb),
        updated_at = now()
    WHERE id = _rule_id
    RETURNING * INTO row;

    RETURN row;
  END IF;

  INSERT INTO public.wa_remarketing_rules (
    nome,
    ativo,
    operacao,
    channel_id,
    flow_id,
    minutes_before_close,
    conditions,
    created_by
  ) VALUES (
    clean_nome,
    coalesce(_ativo, true),
    clean_operacao,
    _channel_id,
    _flow_id,
    mins,
    coalesce(_conditions, '[]'::jsonb),
    NULL
  )
  RETURNING * INTO row;

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_delete_remarketing_rule(
  _vendor_id bigint,
  _codigo text,
  _rule_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF public.vendor_get_remarketing_rule(_vendor_id, _codigo, _rule_id) IS NULL THEN
    RAISE EXCEPTION 'Regra não encontrada ou indisponível para esta operação';
  END IF;

  DELETE FROM public.wa_remarketing_rules WHERE id = _rule_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_toggle_remarketing_rule(
  _vendor_id bigint,
  _codigo text,
  _rule_id uuid,
  _ativo boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF public.vendor_get_remarketing_rule(_vendor_id, _codigo, _rule_id) IS NULL THEN
    RAISE EXCEPTION 'Regra não encontrada ou indisponível para esta operação';
  END IF;

  UPDATE public.wa_remarketing_rules
  SET ativo = coalesce(_ativo, true), updated_at = now()
  WHERE id = _rule_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_get_remarketing_rule(bigint, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_list_remarketing_rules(bigint, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_upsert_remarketing_rule(bigint, text, uuid, text, boolean, text, uuid, uuid, integer, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_delete_remarketing_rule(bigint, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_toggle_remarketing_rule(bigint, text, uuid, boolean) TO anon, authenticated;