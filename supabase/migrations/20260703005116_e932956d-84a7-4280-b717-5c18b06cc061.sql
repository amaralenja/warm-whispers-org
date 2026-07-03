CREATE OR REPLACE FUNCTION public.vendor_create_wa_flow(
  _vendor_id bigint,
  _codigo text,
  _nome text,
  _operacao_id text DEFAULT NULL,
  _folder text DEFAULT NULL,
  _ativo boolean DEFAULT true,
  _entry_node_id text DEFAULT NULL,
  _nodes jsonb DEFAULT '[]'::jsonb,
  _edges jsonb DEFAULT '[]'::jsonb,
  _descricao text DEFAULT NULL
)
RETURNS public.wa_flows
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  final_operacao text := NULLIF(trim(coalesce(_operacao_id, '')), '');
  inserted public.wa_flows;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN
    RAISE EXCEPTION 'Sessão de vendedor sem operação liberada';
  END IF;
  IF NULLIF(trim(coalesce(_nome, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Nome do fluxo é obrigatório';
  END IF;
  IF final_operacao IS NULL THEN final_operacao := allowed[1]; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(a) = public._vendor_norm(final_operacao)) THEN
    RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a esta operação';
  END IF;
  INSERT INTO public.wa_flows (nome, descricao, operacao_id, folder, ativo, entry_node_id, nodes, edges, created_by)
  VALUES (trim(_nome), _descricao, final_operacao, NULLIF(trim(coalesce(_folder, '')), ''),
          coalesce(_ativo, true), _entry_node_id, coalesce(_nodes, '[]'::jsonb), coalesce(_edges, '[]'::jsonb), NULL)
  RETURNING * INTO inserted;
  RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_update_wa_flow(
  _vendor_id bigint, _codigo text, _flow_id uuid,
  _nome text DEFAULT NULL, _operacao_id text DEFAULT NULL, _folder text DEFAULT NULL,
  _ativo boolean DEFAULT NULL, _entry_node_id text DEFAULT NULL,
  _nodes jsonb DEFAULT NULL, _edges jsonb DEFAULT NULL,
  _set_operacao boolean DEFAULT false, _set_folder boolean DEFAULT false,
  _set_ativo boolean DEFAULT false, _set_entry_node_id boolean DEFAULT false,
  _set_nodes boolean DEFAULT false, _set_edges boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  current_flow public.wa_flows;
  final_operacao text := NULLIF(trim(coalesce(_operacao_id, '')), '');
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  SELECT * INTO current_flow FROM public.wa_flows f
   WHERE f.id = _flow_id AND (f.operacao_id IS NULL OR EXISTS (
     SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)))
   LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _set_operacao THEN
    IF final_operacao IS NULL THEN final_operacao := allowed[1]; END IF;
    IF NOT EXISTS (SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(a) = public._vendor_norm(final_operacao)) THEN
      RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a esta operação';
    END IF;
  ELSE
    final_operacao := current_flow.operacao_id;
  END IF;
  UPDATE public.wa_flows SET
    nome = CASE WHEN NULLIF(trim(coalesce(_nome, '')), '') IS NOT NULL THEN trim(_nome) ELSE nome END,
    operacao_id = final_operacao,
    folder = CASE WHEN _set_folder THEN NULLIF(trim(coalesce(_folder, '')), '') ELSE folder END,
    ativo = CASE WHEN _set_ativo THEN coalesce(_ativo, false) ELSE ativo END,
    entry_node_id = CASE WHEN _set_entry_node_id THEN _entry_node_id ELSE entry_node_id END,
    nodes = CASE WHEN _set_nodes THEN coalesce(_nodes, '[]'::jsonb) ELSE nodes END,
    edges = CASE WHEN _set_edges THEN coalesce(_edges, '[]'::jsonb) ELSE edges END,
    updated_at = now()
  WHERE id = _flow_id;
  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_delete_wa_flow(_vendor_id bigint, _codigo text, _flow_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  DELETE FROM public.wa_flows f WHERE f.id = _flow_id AND (f.operacao_id IS NULL OR EXISTS (
    SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)));
  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_replace_wa_flow_triggers(
  _vendor_id bigint, _codigo text, _flow_id uuid, _triggers jsonb DEFAULT '[]'::jsonb
)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  has_access boolean := false;
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  SELECT true INTO has_access FROM public.wa_flows f
   WHERE f.id = _flow_id AND (f.operacao_id IS NULL OR EXISTS (
     SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)))
   LIMIT 1;
  IF NOT coalesce(has_access, false) THEN RETURN false; END IF;
  DELETE FROM public.wa_flow_triggers WHERE flow_id = _flow_id;
  INSERT INTO public.wa_flow_triggers (flow_id, tipo, valor, match_mode, channel_id, ativo)
  SELECT _flow_id, coalesce(t->>'tipo', 'manual'), nullif(t->>'valor', ''),
         coalesce(nullif(t->>'match_mode', ''), 'contains'), nullif(t->>'channel_id', ''),
         coalesce((t->>'ativo')::boolean, true)
  FROM jsonb_array_elements(coalesce(_triggers, '[]'::jsonb)) t;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_list_wa_flow_triggers(_vendor_id bigint, _codigo text, _flow_id uuid)
RETURNS SETOF public.wa_flow_triggers
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.* FROM public.wa_flow_triggers t
  JOIN public.wa_flows f ON f.id = t.flow_id
  WHERE t.flow_id = _flow_id AND (f.operacao_id IS NULL OR EXISTS (
    SELECT 1 FROM unnest(allowed) a WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)))
  ORDER BY t.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_create_wa_flow(bigint, text, text, text, text, boolean, text, jsonb, jsonb, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_update_wa_flow(bigint, text, uuid, text, text, text, boolean, text, jsonb, jsonb, boolean, boolean, boolean, boolean, boolean, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_delete_wa_flow(bigint, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_replace_wa_flow_triggers(bigint, text, uuid, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_wa_flow_triggers(bigint, text, uuid) TO anon, authenticated, service_role;