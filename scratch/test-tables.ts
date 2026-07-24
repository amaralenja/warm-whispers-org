import { supabase } from "../src/integrations/supabase/client";

async function testTables() {
  const { data: v, error: errV } = await supabase.from("vendedores").select("*").limit(1);
  console.log("vendedores:", { data: v, error: errV });

  const { data: st, error: errSt } = await supabase.from("system_settings" as any).select("*").limit(1);
  console.log("system_settings:", { data: st, error: errSt });
}

testTables().catch(console.error);
