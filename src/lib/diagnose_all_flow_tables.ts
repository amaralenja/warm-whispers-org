import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wvcwrozwnwdlpandwubp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3dyb3p3bndkbHBhbmR3dWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0ODksImV4cCI6MjA4NzcyMDQ4OX0.1eHNkL6pfcRpfrWsh_UyYTcnuNIT6LQLCrpmV2EgyFg";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONV_ID = "026fbfff-5e6d-46ce-8f46-7159538de0e5";
const PHONE = "5516992499159";

async function main() {
  console.log("=== BUSCANDO HISTÓRICO DE MENSAGENS E AUTOMAÇÕES ===");

  // 1. Fetch wa_messages without filter to see column names or if messages exist
  const { data: msgs, error: mErr } = await supabase
    .from("wa_messages")
    .select("*")
    .or(`contact_wa_id.eq.${PHONE},conversation_id.eq.${CONV_ID}`)
    .order("created_at", { ascending: true });

  console.log(`\nwa_messages (${msgs?.length ?? 0}):`, mErr ?? "");
  for (const m of msgs || []) {
    console.log({
      id: m.id,
      direction: m.direction,
      text: m.text || m.body || m.content,
      status: m.status,
      type: m.type || m.media_type,
      created_at: m.created_at,
    });
  }

  // 2. Check wa_flows definitions for Gustavo's operation
  const { data: flows } = await supabase.from("wa_flows").select("id, nome, operacao, ativo, entry_node_id, nodes, edges").or(`operacao.eq.Gustavo,operacao.eq.all`);
  console.log(`\nFluxos do Gustavo/All (${flows?.length ?? 0}):`);
  for (const f of flows || []) {
    console.log({ id: f.id, nome: f.nome, operacao: f.operacao, ativo: f.ativo, nodes_count: f.nodes?.length });
  }

  // 3. Check wa_flow_triggers
  const { data: triggers } = await supabase.from("wa_flow_triggers").select("*");
  console.log(`\nwa_flow_triggers (${triggers?.length ?? 0}):`, JSON.stringify(triggers, null, 2));

  // 4. Check all wa_flow_runs in the system regardless of channel
  const { data: allRuns } = await supabase.from("wa_flow_runs").select("*").order("created_at", { ascending: false }).limit(20);
  console.log(`\nTodos wa_flow_runs no sistema (${allRuns?.length ?? 0}):`);
  for (const r of allRuns || []) {
    console.log("  Run:", {
      id: r.id,
      flow_id: r.flow_id,
      contact_wa_id: r.contact_wa_id,
      status: r.status,
      current_node_id: r.current_node_id,
      error: r.error,
      updated_at: r.updated_at,
    });
  }
}

main().catch(console.error);
