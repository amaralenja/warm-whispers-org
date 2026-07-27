import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wvcwrozwnwdlpandwubp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3dyb3p3bndkbHBhbmR3dWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0ODksImV4cCI6MjA4NzcyMDQ4OX0.1eHNkL6pfcRpfrWsh_UyYTcnuNIT6LQLCrpmV2EgyFg";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("=== INSPEÇÃO GERAL DE FLUXOS, DISPAROS E REMARKETING ===");

  // 1. wa_flows
  const { data: flows } = await supabase.from("wa_flows").select("*");
  console.log(`\n--- WA FLOWS (${flows?.length ?? 0}) ---`);
  for (const f of flows || []) {
    console.log({ id: f.id, nome: f.nome, operacao: f.operacao, ativo: f.ativo, nodes_count: f.nodes?.length, created_at: f.created_at });
  }

  // 2. crm_bulk_dispatches
  const { data: dispatches } = await supabase.from("crm_bulk_dispatches").select("*");
  console.log(`\n--- BULK DISPATCHES (${dispatches?.length ?? 0}) ---`);
  for (const d of dispatches || []) {
    console.log("Dispatch:", d);
  }

  // 3. remarketing_rules
  const { data: rem } = await supabase.from("remarketing_rules").select("*");
  console.log(`\n--- REMARKETING RULES (${rem?.length ?? 0}) ---`);
  for (const r of rem || []) {
    console.log("Remarketing:", r);
  }

  // 4. crm_tags in Gustavo's operation
  const { data: tags } = await supabase.from("crm_tags").select("*").eq("operacao", "Gustavo");
  console.log(`\n--- CRM TAGS GUSTAVO (${tags?.length ?? 0}) ---`);
  for (const t of tags || []) {
    console.log("Tag Gustavo:", t);
  }

  // 5. Check all leads for Gustavo created today (2026-07-27)
  const { data: gustavoLeads } = await supabase
    .from("crm_leads")
    .select("id, nome, telefone, tags, status, expert, created_at, updated_at, dados")
    .eq("expert", "Gustavo")
    .gte("created_at", "2026-07-27T00:00:00.000Z")
    .order("created_at", { ascending: false });

  console.log(`\n--- LEADS DO GUSTAVO HOJE (${gustavoLeads?.length ?? 0}) ---`);
  for (const l of gustavoLeads || []) {
    console.log({
      id: l.id,
      nome: l.nome,
      telefone: l.telefone,
      tags: l.tags,
      status: l.status,
      created_at: l.created_at,
      updated_at: l.updated_at,
      conversation_id: l.dados?.conversation_id,
    });
  }
}

main().catch(console.error);
