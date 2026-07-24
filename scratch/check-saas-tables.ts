import { supabase } from "../src/integrations/supabase/client";

async function checkSaasTables() {
  const { data: pData, error: pErr } = await supabase.from("ht_saas_projects" as any).select("*").limit(1);
  console.log("ht_saas_projects test:", { data: pData, error: pErr });

  const { data: nData, error: nErr } = await supabase.from("ht_saas_notes" as any).select("*").limit(1);
  console.log("ht_saas_notes test:", { data: nData, error: nErr });
}

checkSaasTables().catch(console.error);
