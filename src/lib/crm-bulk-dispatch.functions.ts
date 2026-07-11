import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function dbFor(context: any) {
  if (context?.vendor && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
  }
  return context.supabase as any;
}

function digits(s: unknown) {
  return String(s ?? "").replace(/\D+/g, "");
}

function normalizeBrWhatsappNumber(raw: string): string {
  const d = digits(raw);
  if (!d) return "";
  if (d.startsWith("55") && d.length === 12) return `${d.slice(0, 4)}9${d.slice(4)}`;
  return d;
}

function phoneVariants(raw: string): string[] {
  const out = new Set<string>();
  for (const v of [raw, digits(raw), normalizeBrWhatsappNumber(raw)]) {
    const c = digits(v);
    if (c) out.add(c);
  }
  for (const v of Array.from(out)) {
    if (v.startsWith("55") && v.length === 13 && v[4] === "9") out.add(`${v.slice(0, 4)}${v.slice(5)}`);
    if (v.startsWith("55") && v.length === 12) out.add(`${v.slice(0, 4)}9${v.slice(4)}`);
  }
  return Array.from(out).filter(Boolean);
}

async function loadColumnLeads(db: any, operacao: string, stage_id: string) {
  const { data, error } = await db
    .from("crm_leads" as any)
    .select("id,nome,telefone,expert,status")
    .eq("expert", operacao)
    .eq("status", stage_id);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; nome: string; telefone: string | null; expert: string; status: string }>;
}

async function classifyLeads(db: any, channel_id: string, leads: Array<{ id: string; telefone: string | null }>) {
  const now = Date.now();
  const windowFrom = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // Collect all phone variants
  const allVariants = new Set<string>();
  const perLead = new Map<string, string[]>();
  for (const l of leads) {
    const vs = phoneVariants(l.telefone ?? "");
    perLead.set(l.id, vs);
    for (const v of vs) allVariants.add(v);
  }
  const variantsArr = Array.from(allVariants);

  // Look up conversations by (channel_id, contact_wa_id in variants)
  const convByContact = new Map<string, { id: string; last_message_at: string | null }>();
  if (variantsArr.length > 0) {
    const { data: convs } = await db
      .from("wa_conversations" as any)
      .select("id, contact_wa_id, last_message_at")
      .eq("channel_id", channel_id)
      .in("contact_wa_id", variantsArr);
    for (const c of (convs ?? []) as any[]) {
      convByContact.set(String(c.contact_wa_id), { id: String(c.id), last_message_at: c.last_message_at ?? null });
    }
  }

  // Find inbound messages within last 24h for these contacts on this channel
  const inboundSince = new Set<string>();
  if (variantsArr.length > 0) {
    const { data: msgs } = await db
      .from("wa_messages" as any)
      .select("from_wa_id, created_at")
      .eq("channel_id", channel_id)
      .eq("direction", "inbound")
      .gte("created_at", windowFrom)
      .in("from_wa_id", variantsArr);
    for (const m of (msgs ?? []) as any[]) {
      if (m.from_wa_id) inboundSince.add(String(m.from_wa_id));
    }
  }

  const eligible: Array<{ lead_id: string; contact_wa_id: string; conversation_id: string | null }> = [];
  let noPhone = 0;
  let noWindow = 0;
  for (const l of leads) {
    const vs = perLead.get(l.id) ?? [];
    if (vs.length === 0) { noPhone++; continue; }
    const openVariant = vs.find((v) => inboundSince.has(v));
    if (!openVariant) { noWindow++; continue; }
    const conv = vs.map((v) => convByContact.get(v)).find(Boolean) ?? null;
    eligible.push({ lead_id: l.id, contact_wa_id: openVariant, conversation_id: conv?.id ?? null });
  }

  return { eligible, noPhone, noWindow, total: leads.length };
}

export const previewCrmBulkDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { operacao: string; stage_id: string; channel_id: string }) => ({
    operacao: String(d?.operacao ?? ""),
    stage_id: String(d?.stage_id ?? ""),
    channel_id: String(d?.channel_id ?? ""),
  }))
  .handler(async ({ context, data }) => {
    if (!data.operacao || !data.stage_id || !data.channel_id) {
      return { total: 0, eligible: 0, noPhone: 0, noWindow: 0 };
    }
    const db = await dbFor(context);
    const leads = await loadColumnLeads(db, data.operacao, data.stage_id);
    const { eligible, noPhone, noWindow, total } = await classifyLeads(db, data.channel_id, leads);
    return { total, eligible: eligible.length, noPhone, noWindow };
  });

export const startCrmBulkDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    operacao: string;
    stage_id: string;
    channel_id: string;
    flow_id: string;
    delay_seconds: number;
  }) => ({
    operacao: String(d?.operacao ?? ""),
    stage_id: String(d?.stage_id ?? ""),
    channel_id: String(d?.channel_id ?? ""),
    flow_id: String(d?.flow_id ?? ""),
    delay_seconds: Math.max(60, Math.floor(Number(d?.delay_seconds) || 60)),
  }))
  .handler(async ({ context, data }) => {
    if (!data.operacao || !data.stage_id || !data.channel_id || !data.flow_id) {
      throw new Error("Parâmetros inválidos");
    }
    const db = await dbFor(context);
    const leads = await loadColumnLeads(db, data.operacao, data.stage_id);
    const { eligible, noPhone, noWindow, total } = await classifyLeads(db, data.channel_id, leads);

    if (eligible.length === 0) {
      throw new Error("Nenhum lead com janela de 24h aberta nesta coluna.");
    }

    const userId = (context as any)?.userId ?? null;
    const { data: disp, error: dispErr } = await db
      .from("crm_bulk_dispatches" as any)
      .insert({
        created_by: userId,
        operacao: data.operacao,
        stage_id: data.stage_id,
        flow_id: data.flow_id,
        channel_id: data.channel_id,
        delay_seconds: data.delay_seconds,
        status: "running",
        total_leads: total,
        eligible_leads: eligible.length,
        skipped_count: noPhone + noWindow,
      })
      .select("id")
      .single();
    if (dispErr) throw new Error(dispErr.message);

    const now = Date.now();
    // First item due immediately; subsequent items spaced by delay_seconds.
    const rows = eligible.map((e, i) => ({
      dispatch_id: (disp as any).id,
      lead_id: e.lead_id,
      contact_wa_id: e.contact_wa_id,
      conversation_id: e.conversation_id,
      scheduled_at: new Date(now + i * data.delay_seconds * 1000).toISOString(),
      status: "pending",
    }));
    // Insert in chunks to avoid huge payloads
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await db.from("crm_bulk_dispatch_items" as any).insert(chunk);
      if (error) throw new Error(error.message);
    }
    return { dispatch_id: (disp as any).id, eligible: eligible.length, total, noPhone, noWindow };
  });

export const listActiveCrmBulkDispatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { operacao?: string }) => ({ operacao: d?.operacao ?? "" }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    let q = db
      .from("crm_bulk_dispatches" as any)
      .select("id,operacao,stage_id,flow_id,channel_id,delay_seconds,status,total_leads,eligible_leads,sent_count,failed_count,skipped_count,started_at,finished_at")
      .eq("status", "running");
    if (data.operacao) q = q.eq("operacao", data.operacao);
    const { data: rows, error } = await q.order("started_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const cancelCrmBulkDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (!data.id) throw new Error("id obrigatório");
    const { error: e1 } = await db
      .from("crm_bulk_dispatch_items" as any)
      .update({ status: "cancelled" })
      .eq("dispatch_id", data.id)
      .eq("status", "pending");
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await db
      .from("crm_bulk_dispatches" as any)
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
