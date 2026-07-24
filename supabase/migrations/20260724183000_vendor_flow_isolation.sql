-- Adiciona coluna owner_vendor_id na tabela wa_flows para isolar fluxos por vendedor
ALTER TABLE public.wa_flows
  ADD COLUMN IF NOT EXISTS owner_vendor_id bigint NULL;

CREATE INDEX IF NOT EXISTS wa_flows_owner_vendor_idx
  ON public.wa_flows(owner_vendor_id);

-- Atualiza vendor_create_wa_flow para gravar owner_vendor_id
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

  IF final_operacao IS NULL THEN
    final_operacao := allowed[1];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM unnest(allowed) a
    WHERE public._vendor_norm(a) = public._vendor_norm(final_operacao)
  ) THEN
    RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a esta operação';
  END IF;

  INSERT INTO public.wa_flows (
    nome, descricao, operacao_id, folder, ativo, entry_node_id, nodes, edges, created_by, owner_vendor_id
  ) VALUES (
    trim(_nome), _descricao, final_operacao, NULLIF(trim(coalesce(_folder, '')), ''),
    coalesce(_ativo, true), _entry_node_id, coalesce(_nodes, '[]'::jsonb), coalesce(_edges, '[]'::jsonb), NULL, _vendor_id
  )
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$$;

-- Atualiza vendor_list_flows para filtrar apenas os fluxos do próprio vendedor (ou fluxos globais da operação criados pelo admin)
CREATE OR REPLACE FUNCTION public.vendor_list_flows(_vendor_id bigint, _codigo text)
 RETURNS SETOF wa_flows
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  allowed_norm text[];
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  SELECT array_agg(public._vendor_norm(a)) INTO allowed_norm FROM unnest(allowed) a;
  RETURN QUERY
  SELECT f.*
  FROM public.wa_flows f
  WHERE f.operacao_id IS NOT NULL
    AND public._vendor_norm(f.operacao_id) = ANY(allowed_norm)
    AND (f.owner_vendor_id IS NULL OR f.owner_vendor_id = _vendor_id)
  ORDER BY f.updated_at DESC;
END;
$function$;

-- Atualiza vendor_get_flow para validar ownership
CREATE OR REPLACE FUNCTION public.vendor_get_flow(_vendor_id bigint, _codigo text, _flow_id uuid)
 RETURNS SETOF wa_flows
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT f.*
  FROM public.wa_flows f
  WHERE f.id = _flow_id
    AND f.operacao_id IS NOT NULL
    AND (f.owner_vendor_id IS NULL OR f.owner_vendor_id = _vendor_id)
    AND EXISTS (
      SELECT 1 FROM unnest(allowed) a
      WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)
    )
  LIMIT 1;
END;
$function$;

-- Atualiza vendor_delete_wa_flow para validar ownership
CREATE OR REPLACE FUNCTION public.vendor_delete_wa_flow(_vendor_id bigint, _codigo text, _flow_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;
  DELETE FROM public.wa_flows f
   WHERE f.id = _flow_id
     AND (f.owner_vendor_id IS NULL OR f.owner_vendor_id = _vendor_id)
     AND EXISTS (
       SELECT 1 FROM unnest(allowed) a
       WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)
     );
  RETURN found;
END;
$function$;

-- Atualiza vendor_update_wa_flow para validar ownership
CREATE OR REPLACE FUNCTION public.vendor_update_wa_flow(
  _vendor_id bigint,
  _codigo text,
  _flow_id uuid,
  _nome text DEFAULT NULL,
  _operacao_id text DEFAULT NULL,
  _folder text DEFAULT NULL,
  _ativo boolean DEFAULT NULL,
  _entry_node_id text DEFAULT NULL,
  _nodes jsonb DEFAULT NULL,
  _edges jsonb DEFAULT NULL,
  _set_operacao boolean DEFAULT false,
  _set_folder boolean DEFAULT false,
  _set_ativo boolean DEFAULT false,
  _set_entry_node_id boolean DEFAULT false,
  _set_nodes boolean DEFAULT false,
  _set_edges boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  current_flow public.wa_flows;
  final_operacao text := NULLIF(trim(coalesce(_operacao_id, '')), '');
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN false; END IF;

  SELECT * INTO current_flow
  FROM public.wa_flows f
  WHERE f.id = _flow_id
    AND (f.owner_vendor_id IS NULL OR f.owner_vendor_id = _vendor_id)
    AND (
      f.operacao_id IS NULL OR EXISTS (
        SELECT 1 FROM unnest(allowed) a
        WHERE public._vendor_norm(f.operacao_id) = public._vendor_norm(a)
      )
    )
  LIMIT 1;

  IF NOT FOUND THEN RETURN false; END IF;

  IF _nome IS NOT NULL AND NULLIF(trim(_nome), '') IS NOT NULL THEN
    current_flow.nome := trim(_nome);
  END IF;

  IF _set_operacao THEN
    IF final_operacao IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(allowed) a
      WHERE public._vendor_norm(a) = public._vendor_norm(final_operacao)
    ) THEN
      RAISE EXCEPTION 'Inautorizado: vendedor sem acesso a esta operação';
    END IF;
    current_flow.operacao_id := final_operacao;
  END IF;

  IF _set_folder THEN current_flow.folder := NULLIF(trim(coalesce(_folder, '')), ''); END IF;
  IF _set_ativo THEN current_flow.ativo := coalesce(_ativo, true); END IF;
  IF _set_entry_node_id THEN current_flow.entry_node_id := _entry_node_id; END IF;
  IF _set_nodes AND _nodes IS NOT NULL THEN current_flow.nodes := _nodes; END IF;
  IF _set_edges AND _edges IS NOT NULL THEN current_flow.edges := _edges; END IF;

  UPDATE public.wa_flows
     SET nome = current_flow.nome,
         operacao_id = current_flow.operacao_id,
         folder = current_flow.folder,
         ativo = current_flow.ativo,
         entry_node_id = current_flow.entry_node_id,
         nodes = current_flow.nodes,
         edges = current_flow.edges,
         updated_at = now()
   WHERE id = _flow_id;

  RETURN true;
END;
$$;
