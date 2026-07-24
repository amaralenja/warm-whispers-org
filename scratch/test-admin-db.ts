process.env.SUPABASE_URL = "https://wvcwrozwnwdlpandwubp.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3dyb3p3bndkbHBhbmR3dWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0ODksImV4cCI6MjA4NzcyMDQ4OX0.1eHNkL6pfcRpfrWsh_UyYTcnuNIT6LQLCrpmV2EgyFg";

import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testAdminDb() {
  const { data: tables, error } = await supabaseAdmin
    .from("ht_assets")
    .select("*")
    .limit(5);
  console.log("ht_assets with admin key:", { data: tables, error });
}

testAdminDb().catch(console.error);
