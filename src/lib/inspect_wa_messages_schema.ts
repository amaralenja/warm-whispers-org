import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wvcwrozwnwdlpandwubp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3dyb3p3bndkbHBhbmR3dWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0ODksImV4cCI6MjA4NzcyMDQ4OX0.1eHNkL6pfcRpfrWsh_UyYTcnuNIT6LQLCrpmV2EgyFg";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("=== INSPEÇÃO DE WA_MESSAGES ===");

  const { data: msgs, error } = await supabase.from("wa_messages").select("*").limit(5);
  if (error) console.error("Error:", error);
  console.log("Sample wa_messages:", JSON.stringify(msgs, null, 2));

  // Also query by conversation_id
  const CONV_ID = "026fbfff-5e6d-46ce-8f46-7159538de0e5";
  const { data: convMsgs } = await supabase.from("wa_messages").select("*").eq("conversation_id", CONV_ID).order("created_at", { ascending: true });
  console.log(`\nMensagens na conversa ${CONV_ID} (${convMsgs?.length ?? 0}):`);
  for (const m of convMsgs || []) {
    console.log("  Msg:", JSON.stringify(m, null, 2));
  }
}

main().catch(console.error);
