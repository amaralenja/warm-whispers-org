
CREATE INDEX IF NOT EXISTS idx_crm_tags_vendor_norm_operacao
  ON public.crm_tags (public._vendor_norm(operacao));

CREATE INDEX IF NOT EXISTS idx_wa_conversations_vendor_norm_operacao
  ON public.wa_conversations (public._vendor_norm(operacao_id));

CREATE OR REPLACE FUNCTION public.vendor_list_crm_tags(_vendor_id bigint, _codigo text, _operacao text DEFAULT 'all'::text)
 RETURNS SETOF crm_tags
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := public.vendor_allowed_workspace_ids(_vendor_id, _codigo);
  allowed_norm text[];
  op_norm text := public._vendor_norm(_operacao);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  SELECT array_agg(public._vendor_norm(a)) INTO allowed_norm FROM unnest(allowed) a;
  RETURN QUERY
  SELECT t.*
  FROM public.crm_tags t
  WHERE (_operacao IS NULL OR _operacao = 'all' OR public._vendor_norm(t.operacao) = op_norm)
    AND public._vendor_norm(t.operacao) = ANY(allowed_norm)
  ORDER BY t.nome;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vendor_list_wa_conversations(_vendor_id bigint, _codigo text, _operacao_id text DEFAULT NULL::text)
 RETURNS SETOF wa_conversations
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := public.vendor_allowed_channel_ids(_vendor_id, _codigo);
  op_norm text := public._vendor_norm(_operacao_id);
BEGIN
  IF array_length(allowed, 1) IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.*
  FROM public.wa_conversations c
  WHERE c.channel_id = ANY(allowed)
    AND coalesce(c.operacao_id, '') <> '__notificador__'
    AND (_operacao_id IS NULL OR public._vendor_norm(c.operacao_id) = op_norm)
    AND (c.assigned_vendor_id = _vendor_id OR c.assigned_vendor_id IS NULL)
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT 2000;
END;
$function$;
