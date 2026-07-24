import { supabase } from "../src/integrations/supabase/client";

async function checkAssetsTable() {
  const { data, error } = await supabase.from("ht_assets" as any).select("*").limit(5);
  console.log("ht_assets test:", { data, error });
}

checkAssetsTable().catch(console.error);
