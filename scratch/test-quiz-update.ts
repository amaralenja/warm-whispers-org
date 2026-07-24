import { createClient } from "@supabase/supabase-js";

const QUIZ_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";

const quizSb = createClient(QUIZ_URL, QUIZ_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function testUpdateReal() {
  const { data: leads } = await quizSb.from("leads").select("id, crm_valor").limit(1);
  console.log("SELECT LEAD:", leads);
  if (leads && leads.length > 0) {
    const realId = leads[0].id;
    const { data: updated, error } = await quizSb
      .from("leads")
      .update({ crm_valor: leads[0].crm_valor || 100 })
      .eq("id", realId)
      .select();
    console.log("UPDATED DATA:", updated);
    console.log("UPDATE ERROR:", error);
  }
}

testUpdateReal().catch(console.error);
