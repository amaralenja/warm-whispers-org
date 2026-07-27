import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wvcwrozwnwdlpandwubp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3dyb3p3bndkbHBhbmR3dWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0ODksImV4cCI6MjA4NzcyMDQ4OX0.1eHNkL6pfcRpfrWsh_UyYTcnuNIT6LQLCrpmV2EgyFg";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONV_ID = "026fbfff-5e6d-46ce-8f46-7159538de0e5";

async function main() {
  console.log(`=== INVESTIGAÇÃO APROFUNDADA DA CONVERSA ${CONV_ID} ===\n`);

  // 1. Fetch conversation
  const { data: conv } = await supabase.from("wa_conversations").select("*").eq("id", CONV_ID).single();
  console.log("Conversa:", JSON.stringify(conv, null, 2));

  // 2. Fetch wa_flow_runs for conversation
  const { data: runs } = await supabase.from("wa_flow_runs").select("*").eq("conversation_id", CONV_ID);
  console.log("\nFlow Runs:", JSON.stringify(runs, null, 2));

  // 3. Fetch wa_flow_executions for these runs or conversation
  const runIds = (runs || []).map((r) => r.id);
  if (runIds.length > 0) {
    const { data: execs } = await supabase.from("wa_flow_executions").select("*").in("run_id", runIds).order("created_at", { ascending: true });
    console.log("\nFlow Executions (Logs):", JSON.stringify(execs, null, 2));
  }

  // 4. Fetch all messages in this conversation
  const { data: msgs } = await supabase
    .from("wa_messages")
    .select("*")
    .eq("conversation_id", CONV_ID)
    .order("created_at", { ascending: true });

  console.log(`\nMensagens na Conversa (${msgs?.length ?? 0}):`);
  for (const m of msgs || []) {
    console.log(`  [${m.created_at}] [${m.direction}] [status: ${m.status}] text: ${m.text?.slice(0, 100)} | media: ${m.media_type} (${m.media_url})`);
  }

  // 5. Let's also check all flow runs in Gustavo's operation (or channel c5505ddf-f9ef-4837-9337-45ed3de40d6a)
  const { data: gustavoRuns } = await supabase
    .from("wa_flow_runs")
    .select("*")
    .eq("channel_id", "c5505ddf-f9ef-4837-9337-45ed3de40d6a")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("\nÚltimos 10 Flow Runs no canal do Gustavo:", JSON.stringify(gustavoRuns, null, 2));
}

main().catch(console.error);
