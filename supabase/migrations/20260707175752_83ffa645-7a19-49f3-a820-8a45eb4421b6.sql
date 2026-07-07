REVOKE EXECUTE ON FUNCTION public.cancel_active_wa_flow_runs(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.active_wa_flow_conversation_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_active_wa_flow_runs(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.active_wa_flow_conversation_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_wa_flow_run(bigint, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_active_wa_flow_conversation_ids(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_list_active_wa_flow_runs(bigint, text, uuid) TO anon, authenticated, service_role;