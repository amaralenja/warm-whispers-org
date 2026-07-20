import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 
              process.env.SUPABASE_SECRET_KEY || 
              process.env.SUPABASE_SECRET_KEYS || 
              process.env.SUPABASE_SERVICE_KEY ||
              process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Credenciais do Supabase não configuradas no servidor.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function hashToken(token: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export const listHtApiTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ht_api_tokens" as any)
      .select("id, name, token_prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tokens: ((data ?? []) as unknown) as Array<{
      id: string;
      name: string;
      token_prefix: string;
      created_at: string;
      last_used_at: string | null;
      revoked_at: string | null;
    }> };
  });

export const createHtApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string }) => {
    const name = String(data?.name ?? "").trim();
    if (!name) throw new Error("Nome obrigatório");
    if (name.length > 80) throw new Error("Nome muito longo");
    return { name };
  })
  .handler(async ({ data, context }) => {
    const { randomBytes } = await import("crypto");
    const raw = randomBytes(30).toString("base64").replace(/[+/=]/g, "").slice(0, 40);
    const token = `htq_${raw}`;
    const token_hash = await hashToken(token);
    const token_prefix = token.slice(0, 12);
    const { data: row, error } = await context.supabase
      .from("ht_api_tokens" as any)
      .insert({
        name: data.name,
        token_hash,
        token_prefix,
        created_by: context.userId,
      })
      .select("id, name, token_prefix, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { token, row };
  });

export const revokeHtApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    const id = String(data?.id ?? "").trim();
    if (!id) throw new Error("id obrigatório");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ht_api_tokens" as any)
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function syncQuizLeadsInternal(supabaseLocal: any) {
  const QUIZ_SUPABASE_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
  const QUIZ_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";

  const { createClient } = await import("@supabase/supabase-js");
  const extClient = createClient(QUIZ_SUPABASE_URL, QUIZ_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Puxa as submissões/leads do Supabase externo (últimos 1000)
  const { data: extLeads, error: extError } = await extClient
    .from("leads")
    .select("*")
    .order("data_criacao", { ascending: false })
    .limit(1000);

  if (extError || !extLeads || extLeads.length === 0) {
    return;
  }

  // Busca os IDs locais existentes
  const { data: localIdsData } = await supabaseLocal
    .from("ht_quiz_submissions")
    .select("id");
  const localIdsSet = new Set((localIdsData || []).map((x: any) => String(x.id)));

  // Filtra apenas leads que não estão no local
  const newLeads = extLeads.filter((l: any) => l.id && !localIdsSet.has(String(l.id)));
  if (newLeads.length === 0) return;

  const submissionsToInsert = newLeads.map((l: any) => {
    const respostas = l.respostas_json || {
      caixa_letra: l.caixa_letra,
      caixa_label: l.caixa_label,
      faturamento: l.faturamento,
      momento: l.momento,
      investir: l.investir,
      objetivo: l.objetivo,
      comprometimento: l.comprometimento,
      renda: l.renda,
      situacao: l.situacao,
      funil: l.funil,
      porque: l.porque
    };

    return {
      id: l.id,
      nome: l.nome,
      email: l.email,
      whatsapp: l.whatsapp,
      instagram: l.instagram,
      utm_source: l.utm_source,
      utm_medium: l.utm_medium,
      utm_campaign: l.utm_campaign,
      utm_content: l.utm_content,
      fbc: l.fbc,
      fbp: l.fbp,
      fbclid: l.fbclid,
      gclid: l.gclid,
      respostas,
      received_at: l.data_criacao || new Date().toISOString(),
      updated_at: l.data_criacao || new Date().toISOString(),
      status: l.status || "completed"
    };
  });

  const { error: insertSubmissionsError } = await supabaseLocal
    .from("ht_quiz_submissions")
    .insert(submissionsToInsert);

  if (insertSubmissionsError) {
    console.error("Erro ao sincronizar submissões locais:", insertSubmissionsError);
    return;
  }

  // Sincroniza no Kanban local APENAS novos leads (não sobrescreve posições salvas pelos SDRs/Closers)
  const { data: existingKanbanRows } = await supabaseLocal
    .from("ht_kanban_state")
    .select("lead_id");
  const existingSet = new Set((existingKanbanRows || []).map((x: any) => String(x.lead_id)));

  const kanbanRowsToInsert = newLeads
    .filter((l: any) => !existingSet.has(String(l.id)))
    .map((l: any) => {
      let sdr_stage = "novos";
      let closer_stage = null;
      const crmStatus = String(l.crm_status || "").toLowerCase();

      if (crmStatus.includes("fechado") || crmStatus.includes("ganho")) {
        sdr_stage = "won";
        closer_stage = "fechado";
      } else if (crmStatus.includes("perdido") || crmStatus.includes("lost")) {
        sdr_stage = "lost";
      } else if (l.crm_data_agendamento || crmStatus.includes("agendado")) {
        sdr_stage = "scheduled";
      }

      return {
        lead_id: l.id,
        scheduled_at: l.crm_data_agendamento || l.data_criacao || new Date().toISOString(),
        sdr_stage,
        closer_stage,
        is_fake: false,
        updated_at: l.data_criacao || new Date().toISOString()
      };
    });

  if (kanbanRowsToInsert.length > 0) {
    await supabaseLocal
      .from("ht_kanban_state")
      .insert(kanbanRowsToInsert);
  }
}

export const saveKanbanStateServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    lead_id: string;
    scheduled_at?: string | null;
    closer_email?: string | null;
    sdr_stage?: string | null;
    closer_stage?: string | null;
    is_fake?: boolean;
  }) => ({
    lead_id: String(data?.lead_id ?? ""),
    scheduled_at: data?.scheduled_at != null ? String(data.scheduled_at) : null,
    closer_email: data?.closer_email != null ? String(data.closer_email) : null,
    sdr_stage: data?.sdr_stage != null ? String(data.sdr_stage) : null,
    closer_stage: data?.closer_stage != null ? String(data.closer_stage) : null,
    is_fake: Boolean(data?.is_fake),
  }))
  .handler(async ({ data }) => {
    if (!data.lead_id) throw new Error("lead_id obrigatório");
    const admin = await getAdminClient();
    const { error } = await admin
      .from("ht_kanban_state" as any)
      .upsert({
        lead_id: data.lead_id,
        scheduled_at: data.scheduled_at,
        closer_email: data.closer_email,
        sdr_stage: data.sdr_stage,
        closer_stage: data.closer_stage,
        is_fake: data.is_fake,
        updated_at: new Date().toISOString(),
      }, { onConflict: "lead_id" });
    if (error) {
      console.error("[saveKanbanStateServer] error:", error);
      throw new Error(error.message);
    }
    return { ok: true };
  });

async function syncCriarSaasLeadsInternal(supabaseLocal: any) {
  try {
    const url = "https://criarsaashub.vercel.app/api/public/onboarding-leads";
    const apiKey = "sk_onboarding_9il22601t8jcyri0mrwz6v";

    const resp = await fetch(url, {
      headers: {
        "X-API-Key": apiKey
      }
    });

    if (!resp.ok) {
      console.error(`Erro ao consultar API do Criar SaaS Hub: ${resp.status}`);
      return;
    }

    const body = await resp.json().catch(() => null);
    const extLeads = body?.leads;
    if (!extLeads || !Array.isArray(extLeads) || extLeads.length === 0) {
      return;
    }

    // Busca os IDs locais existentes para deduplicação
    const { data: localIdsData } = await supabaseLocal
      .from("ht_quiz_submissions")
      .select("id");
    const localIdsSet = new Set((localIdsData || []).map((x: any) => String(x.id)));

    // Filtra apenas leads que não estão no local
    const newLeads = extLeads.filter((l: any) => l.user_id && !localIdsSet.has(String(l.user_id)));
    if (newLeads.length === 0) return;

    const submissionsToInsert = newLeads.map((l: any) => {
      return {
        id: l.user_id,
        nome: l.display_name,
        email: l.email,
        whatsapp: l.whatsapp,
        utm_source: "criar_saas",
        respostas: {
          ...l,
          origem: "criar_saas"
        },
        received_at: l.completed_at || new Date().toISOString(),
        updated_at: l.completed_at || new Date().toISOString(),
        status: "completed"
      };
    });

    const { error: insertSubmissionsError } = await supabaseLocal
      .from("ht_quiz_submissions")
      .insert(submissionsToInsert);

    if (insertSubmissionsError) {
      console.error("Erro ao salvar leads sincronizados do Criar SaaS:", insertSubmissionsError);
    }
  } catch (err) {
    console.error("Falha geral na sincronização do Criar SaaS Hub:", err);
  }
}

export const listHtQuizSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Sincroniza em background silenciosamente ao listar
    try {
      await syncQuizLeadsInternal(context.supabase);
    } catch (err) {
      console.error("Falha ao sincronizar leads antigos do Quiz:", err);
    }

    try {
      await syncCriarSaasLeadsInternal(context.supabase);
    } catch (err) {
      console.error("Falha ao sincronizar leads antigos do Criar SaaS:", err);
    }

    const { data, error } = await context.supabase
      .from("ht_quiz_submissions" as any)
      .select("id, received_at, updated_at, status, nome, email, whatsapp, instagram, utm_source, utm_medium, utm_campaign, utm_content, fbc, fbp, fbclid, gclid, respostas")
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (error) throw new Error(error.message);
    return { submissions: (data ?? []) as Array<any> };
  });

export const getKanbanLocalData = createServerFn({ method: "POST" })
  .inputValidator((d: { startIso?: string | null; endIso?: string | null }) => d)
  .handler(async ({ data: { startIso, endIso } }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                process.env.SUPASUPABASE_SERVICE_ROLE_KEY || 
                process.env.SUPABASE_SECRET_KEY || 
                process.env.SUPABASE_SECRET_KEYS || 
                process.env.SUPABASE_SERVICE_KEY ||
                process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Credenciais do Supabase não configuradas no servidor.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Sincroniza em background silenciosamente ao consultar os dados locais
    try {
      await syncQuizLeadsInternal(client);
    } catch (err) {
      console.error("Falha ao sincronizar leads antigos do Quiz em getKanbanLocalData:", err);
    }

    try {
      await syncCriarSaasLeadsInternal(client);
    } catch (err) {
      console.error("Falha ao sincronizar leads antigos do Criar SaaS em getKanbanLocalData:", err);
    }

    let qVendas = client.from("ht_vendas").select("*").limit(5000);
    if (startIso) qVendas = qVendas.gte("data", startIso);
    if (endIso) qVendas = qVendas.lt("data", endIso);

    let qLeads = client.from("ht_leads").select("*").limit(5000);
    if (startIso) qLeads = qLeads.gte("created_at", startIso);
    if (endIso) qLeads = qLeads.lt("created_at", endIso);

    let qReunioes = client.from("ht_reunioes").select("*").limit(5000);
    if (startIso) qReunioes = qReunioes.gte("data", startIso);
    if (endIso) qReunioes = qReunioes.lt("data", endIso);

    let qAgenda = client.from("agenda_leads").select("*").limit(5000);
    if (startIso) qAgenda = qAgenda.gte("data_agendada", startIso);
    if (endIso) qAgenda = qAgenda.lt("data_agendada", endIso);

    const [vendasRes, reunioesRes, leadsRes, agendaRes, notesRes] = await Promise.all([
      qVendas,
      qReunioes,
      qLeads,
      qAgenda,
      client.from("ht_lead_notes").select("lead_id, role, author, body, created_at").order("created_at", { ascending: true }),
    ]);

    return {
      vendas: vendasRes.data || [],
      reunioes: reunioesRes.data || [],
      leads: leadsRes.data || [],
      agenda: agendaRes.data || [],
      notes: notesRes.data || [],
    };
  });

