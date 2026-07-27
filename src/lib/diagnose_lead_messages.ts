import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wvcwrozwnwdlpandwubp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3dyb3p3bndkbHBhbmR3dWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0ODksImV4cCI6MjA4NzcyMDQ4OX0.1eHNkL6pfcRpfrWsh_UyYTcnuNIT6LQLCrpmV2EgyFg";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONV_ID = "026fbfff-5e6d-46ce-8f46-7159538de0e5";

async function main() {
  console.log(`=== MENSAGENS DA CONVERSA ${CONV_ID} ===`);

  const { data: msgs, error } = await supabase
    .from("wa_messages")
    .select("*")
    .eq("conversation_id", CONV_ID)
    .order("created_at", { ascending: true });

  if (error) console.error("Error fetching msgs:", error);
  console.log(`Mensagens encontradas (${msgs?.length ?? 0}):`);
  for (const m of msgs || []) {
    console.log({
      id: m.id,
      direction: m.direction,
      text_body: m.text_body || m.text || m.content || m.body,
      media_type: m.msg_type || m.media_type,
      media_url: m.media_url,
      created_at: m.created_at,
      status: m.status,
      raw: m.raw,
    });
  }
}

main().catch(console.error);
