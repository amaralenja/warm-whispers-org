import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wvcwrozwnwdlpandwubp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3dyb3p3bndkbHBhbmR3dWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0ODksImV4cCI6MjA4NzcyMDQ4OX0.1eHNkL6pfcRpfrWsh_UyYTcnuNIT6LQLCrpmV2EgyFg";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("=== VERIFICANDO TODAS AS TABELAS RELACIONADAS A CHAT/FLUXO ===");

  const tables = [
    "wa_conversations",
    "wa_messages",
    "wa_flows",
    "wa_flow_runs",
    "wa_flow_executions",
    "wa_flow_triggers",
    "chat_messages",
    "messages",
    "crm_leads",
    "crm_tags",
    "remarketing_rules",
    "remarketing_dispatches",
    "remarketing_logs",
    "bot_logs",
    "typebot_logs"
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      console.log(`Tabela ${table}: count = ${count ?? 0}, error = ${error?.message ?? "none"}`);
    } catch (e: any) {
      console.log(`Tabela ${table}: error = ${e?.message}`);
    }
  }
}

main().catch(console.error);
