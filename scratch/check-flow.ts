import { supabase } from "../src/integrations/supabase/client";

async function main() {
  // Check vendor session RPC for Victor Henrique (id: 11) in table `vendedores`
  const { data: vInfo } = await supabase.from("vendedores").select("*").eq("id", 11).single();
  if (!vInfo) return;

  const rpcArgs = { _vendor_id: 11, _codigo: vInfo.codigo };
  
  // Fetch active flow conversation IDs
  const { data: activeFlowConvs, error: eAct } = await supabase.rpc("vendor_active_wa_flow_conversation_ids" as any, rpcArgs);
  console.log("=== ACTIVE FLOW CONVERSATIONS FOR VICTOR ===", activeFlowConvs, eAct);

  // Fetch all active flow conversation IDs in system
  const { data: allActive, error: eAll } = await supabase.rpc("active_wa_flow_conversation_ids" as any);
  console.log("=== ALL ACTIVE FLOW CONVERSATIONS IN SYSTEM ===", allActive, eAll);
}

main().catch(console.error);
