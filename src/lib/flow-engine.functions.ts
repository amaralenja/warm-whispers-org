import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function dbFor(context: any) {
  if (context?.vendor && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
  }
  return context.supabase as any;
}

function vendorChannelIds(context: any): string[] {
  const ids = context?.vendor?.wa_channel_ids;
  return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeBrWhatsappNumber(raw: string): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8) return `55${ddd}9${rest}`;
  }
  return digits;
}

function whatsappNumberVariants(raw: string): string[] {
  const variants = new Set<string>();
  for (const value of [raw, String(raw ?? "").replace(/\D/g, ""), normalizeBrWhatsappNumber(raw)]) {
    const clean = String(value ?? "").replace(/\D/g, "").trim();
    if (clean) variants.add(clean);
  }
  for (const value of Array.from(variants)) {
    if (value.startsWith("55") && value.length === 13 && value[4] === "9") variants.add(`${value.slice(0, 4)}${value.slice(5)}`);
    if (value.startsWith("55") && value.length === 12) variants.add(`${value.slice(0, 4)}9${value.slice(4)}`);
  }
  return Array.from(variants).filter(Boolean);
}

function vendorRpcArgs(context: any) {
  const id = Number(context?.vendor?.id);
  const codigo = String(context?.vendor?.codigo ?? "").trim();
  return Number.isFinite(id) && id > 0 && codigo ? { _vendor_id: id, _codigo: codigo } : null;
}

async function vendorAllowedChannelIds(context: any, db: any): Promise<string[]> {
  const explicit = vendorChannelIds(context);
  if (explicit.length > 0) return explicit;
  const rpcArgs = vendorRpcArgs(context);
  if (rpcArgs) {
    const { data } = await db.rpc("vendor_allowed_channel_ids" as any, rpcArgs);
    if (Array.isArray(data)) return data.map(String).filter(Boolean);
  }
  const expert = context?.vendor?.expert ? String(context.vendor.expert) : "";
  if (!expert) return [];
  const { data } = await db.from("wa_channels" as any).select("id,operacao_id,kind");
  return ((data ?? []) as any[])
    .filter((c) => normalizeText(c.operacao_id) === normalizeText(expert) && c.kind !== "notification")
    .map((c) => String(c.id))
    .filter(Boolean);
}

async function attachFlowTriggers(db: any, flows: any[]) {
  if (!Array.isArray(flows) || flows.length === 0) return flows ?? [];
  const ids = flows.map((f) => String(f.id)).filter(Boolean);
  const { data: triggers } = await db
    .from("wa_flow_triggers" as any)
    .select("*")
    .in("flow_id", ids);
  const byFlow = new Map<string, any[]>();
  for (const t of ((triggers ?? []) as any[])) {
    const k = String(t.flow_id ?? "");
    byFlow.set(k, [...(byFlow.get(k) ?? []), t]);
  }
  return flows.map((f) => ({ ...f, wa_flow_triggers: byFlow.get(String(f.id)) ?? [] }));
}

async function findVendorConversation(
  db: any,
  conversationId: string,
  fallback?: { channelId?: string | null; contactWaId?: string | null },
) {
  const { data: conv, error } = await db
    .from("wa_conversations" as any)
    .select("id,channel_id,assigned_vendor_id,contact_wa_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (conv) return conv as any;

  const channelId = String(fallback?.channelId ?? "").trim();
  const contactIds = whatsappNumberVariants(String(fallback?.contactWaId ?? ""));
  if (!channelId || contactIds.length === 0) return null;

  const { data: fallbackConv, error: fallbackError } = await db
    .from("wa_conversations" as any)
    .select("id,channel_id,assigned_vendor_id,contact_wa_id")
    .eq("channel_id", channelId)
    .in("contact_wa_id", contactIds)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallbackError) throw new Error(fallbackError.message);
  return fallbackConv as any;
}

async function assertVendorConversationAccess(
  context: any,
  db: any,
  conversationId: string,
  fallback?: { channelId?: string | null; contactWaId?: string | null },
) {
  if (!context?.vendor) return;
  if (!conversationId) return;
  const conv = await findVendorConversation(db, conversationId, fallback);
  if (!conv) throw new Error("Conversa não encontrada");
  const allowed = await vendorAllowedChannelIds(context, db);
  if (!allowed.includes(String((conv as any).channel_id))) {
    throw new Error("Inautorizado: vendedor sem acesso a este número");
  }
  const assigned = (conv as any).assigned_vendor_id;
  const assignedId = assigned == null ? null : Number(assigned);
  if (assignedId == null) {
    await db
      .from("wa_conversations" as any)
      .update({ assigned_vendor_id: Number(context.vendor.id) })
      .eq("id", conversationId)
      .is("assigned_vendor_id", null);
    return conv as any;
  }
  if (assignedId !== Number(context.vendor.id)) {
    throw new Error("Inautorizado: este lead está com outro vendedor");
  }
  return conv as any;
}

// ============================================================
// Types
// ============================================================

export type FlowNodeType =
  | "trigger"
  | "send_text"
  | "send_image"
  | "send_video"
  | "send_audio"
  | "send_document"
  | "send_buttons"
  | "wait_message"
  | "wait_button"
  | "delay"
  | "condition"
  | "end";

export type FlowNode = {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: any;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

// ============================================================
// CRUD
// ============================================================

export const listFlows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await dbFor(context);
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data, error } = await db.rpc("vendor_list_flows" as any, rpcArgs);
      if (error) throw new Error(error.message);
      return attachFlowTriggers(db, (data ?? []) as any[]);
    }
    const { data, error } = await db
      .from("wa_flows" as any)
      .select("*, wa_flow_triggers(*)")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getFlow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data: rows, error } = await db.rpc("vendor_get_flow" as any, { ...rpcArgs, _flow_id: data.id });
      if (error) throw new Error(error.message);
      const flow = Array.isArray(rows) ? rows[0] : rows;
      if (!flow) throw new Error("Fluxo não encontrado");
      return (await attachFlowTriggers(db, [flow]))[0];
    }
    const { data: flow, error } = await db
      .from("wa_flows" as any)
      .select("*, wa_flow_triggers(*)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return flow;
  });

// Helper — gera nome único checando os fluxos existentes (case-insensitive)
async function uniqueFlowName(
  supabase: any,
  desired: string,
  excludeId: string | null = null,
): Promise<string> {
  const base = (desired || "").trim() || "Novo Fluxo";
  const { data: rows } = await supabase.from("wa_flows" as any).select("id, nome");
  const taken = new Set<string>(
    ((rows ?? []) as any[])
      .filter((r) => !excludeId || r.id !== excludeId)
      .map((r) => String(r.nome ?? "").trim().toLowerCase()),
  );
  if (!taken.has(base.toLowerCase())) return base;
  const stripped = base.replace(/\s+cópia(\s+\d+)?$/i, "").trim();
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stripped} cópia ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export const createFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string; operacao_id?: string | null; folder?: string | null }) => ({
    nome: String(d?.nome ?? "Novo Fluxo"),
    operacao_id: d?.operacao_id ?? null,
    folder: d?.folder ? String(d.folder).trim() || null : null,
  }))
  .handler(async ({ context, data }) => {
    const startId = "n-trigger";
    const nome = data.nome.trim();
    const { data: dup } = await context.supabase
      .from("wa_flows" as any).select("id").ilike("nome", nome).limit(1);
    if (dup && dup.length > 0) {
      throw new Error(`Já existe um fluxo com o nome "${nome}". Escolha outro nome.`);
    }
    const { data: row, error } = await context.supabase
      .from("wa_flows" as any)
      .insert({
        nome,
        operacao_id: data.operacao_id,
        folder: data.folder,
        ativo: true,
        entry_node_id: startId,
        nodes: [
          { id: startId, type: "trigger", position: { x: 100, y: 100 }, data: { label: "Início" } },
        ],
        edges: [],
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    nome?: string;
    operacao_id?: string | null;
    folder?: string | null;
    ativo?: boolean;
    entry_node_id?: string | null;
    nodes?: FlowNode[];
    edges?: FlowEdge[];
  }) => d)
  .handler(async ({ context, data }) => {
    const patch: any = {};
    for (const k of ["nome", "operacao_id", "folder", "ativo", "entry_node_id", "nodes", "edges"]) {
      if ((data as any)[k] !== undefined) patch[k] = (data as any)[k];
    }
    if (typeof patch.folder === "string") patch.folder = patch.folder.trim() || null;
    if (typeof patch.nome === "string" && patch.nome.trim()) {
      const novoNome = patch.nome.trim();
      const { data: dup } = await context.supabase
        .from("wa_flows" as any).select("id").ilike("nome", novoNome).neq("id", data.id).limit(1);
      if (dup && dup.length > 0) {
        throw new Error(`Já existe outro fluxo com o nome "${novoNome}".`);
      }
      patch.nome = novoNome;
    }
    const { error } = await context.supabase
      .from("wa_flows" as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("wa_flows" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Duplicate / Export / Import
// ============================================================

const FLOW_EXPORT_PREFIX = "FLOWV1:";

function encodeFlowCode(payload: unknown): string {
  const json = JSON.stringify(payload);
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(json, "utf-8").toString("base64")
    : btoa(unescape(encodeURIComponent(json)));
  return FLOW_EXPORT_PREFIX + b64;
}

function decodeFlowCode(code: string): any {
  const raw = code.trim();
  const body = raw.startsWith(FLOW_EXPORT_PREFIX) ? raw.slice(FLOW_EXPORT_PREFIX.length) : raw;
  let json: string;
  try {
    json = typeof Buffer !== "undefined"
      ? Buffer.from(body, "base64").toString("utf-8")
      : decodeURIComponent(escape(atob(body)));
  } catch { throw new Error("Código inválido — não foi possível decodificar."); }
  let parsed: any;
  try { parsed = JSON.parse(json); } catch { throw new Error("Código inválido — JSON corrompido."); }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes)) {
    throw new Error("Código inválido — formato não reconhecido.");
  }
  return parsed;
}

export const duplicateFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const { data: src, error } = await context.supabase
      .from("wa_flows" as any)
      .select("*, wa_flow_triggers(*)")
      .eq("id", data.id).single();
    if (error || !src) throw new Error(error?.message ?? "Fluxo não encontrado");
    const newName = await uniqueFlowName(context.supabase, (src as any).nome);
    const { data: row, error: insErr } = await context.supabase
      .from("wa_flows" as any)
      .insert({
        nome: newName,
        operacao_id: (src as any).operacao_id,
        ativo: false,
        entry_node_id: (src as any).entry_node_id,
        nodes: (src as any).nodes ?? [],
        edges: (src as any).edges ?? [],
        created_by: context.userId,
      })
      .select("id").single();
    if (insErr) throw new Error(insErr.message);
    const triggers = ((src as any).wa_flow_triggers ?? []) as any[];
    if (triggers.length > 0) {
      const rows = triggers.map((t) => ({
        flow_id: (row as any).id,
        tipo: t.tipo, valor: t.valor ?? null,
        match_mode: t.match_mode ?? "contains",
        channel_id: null,
        ativo: t.ativo ?? true,
      }));
      await context.supabase.from("wa_flow_triggers" as any).insert(rows);
    }
    return { id: (row as any).id, nome: newName };
  });

export const exportFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const { data: src, error } = await context.supabase
      .from("wa_flows" as any)
      .select("nome, entry_node_id, nodes, edges, wa_flow_triggers(tipo, valor, match_mode, ativo)")
      .eq("id", data.id).single();
    if (error || !src) throw new Error(error?.message ?? "Fluxo não encontrado");
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      nome: (src as any).nome,
      entry_node_id: (src as any).entry_node_id,
      nodes: (src as any).nodes ?? [],
      edges: (src as any).edges ?? [],
      triggers: ((src as any).wa_flow_triggers ?? []).map((t: any) => ({
        tipo: t.tipo, valor: t.valor, match_mode: t.match_mode, ativo: t.ativo,
      })),
    };
    return { code: encodeFlowCode(payload), nome: payload.nome };
  });

export const importFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; operacao_id?: string | null; nome?: string | null }) => ({
    code: String(d?.code ?? ""),
    operacao_id: d?.operacao_id ?? null,
    nome: d?.nome ?? null,
  }))
  .handler(async ({ context, data }) => {
    if (!data.code.trim()) throw new Error("Cole um código de fluxo.");
    const payload = decodeFlowCode(data.code);
    const desired = (data.nome?.trim() || payload.nome || "Fluxo Importado").toString();
    const finalName = await uniqueFlowName(context.supabase, desired);
    const { data: row, error } = await context.supabase
      .from("wa_flows" as any)
      .insert({
        nome: finalName,
        operacao_id: data.operacao_id,
        ativo: false,
        entry_node_id: payload.entry_node_id ?? null,
        nodes: payload.nodes ?? [],
        edges: payload.edges ?? [],
        created_by: context.userId,
      })
      .select("id").single();
    if (error) throw new Error(error.message);
    const triggers = Array.isArray(payload.triggers) ? payload.triggers : [];
    if (triggers.length > 0) {
      const rows = triggers.map((t: any) => ({
        flow_id: (row as any).id,
        tipo: t.tipo, valor: t.valor ?? null,
        match_mode: t.match_mode ?? "contains",
        channel_id: null,
        ativo: t.ativo ?? true,
      }));
      await context.supabase.from("wa_flow_triggers" as any).insert(rows);
    }
    return { id: (row as any).id, nome: finalName };
  });

// ============================================================
// Triggers
// ============================================================

export const saveTriggers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { flow_id: string; triggers: Array<{ tipo: string; valor?: string; match_mode?: string; channel_id?: string | null; ativo?: boolean }> }) => d)
  .handler(async ({ context, data }) => {
    await context.supabase.from("wa_flow_triggers" as any).delete().eq("flow_id", data.flow_id);
    if (data.triggers.length === 0) return { ok: true };
    const rows = data.triggers.map((t) => ({
      flow_id: data.flow_id,
      tipo: t.tipo,
      valor: t.valor ?? null,
      match_mode: t.match_mode ?? "contains",
      channel_id: t.channel_id ?? null,
      ativo: t.ativo ?? true,
    }));
    const { error } = await context.supabase.from("wa_flow_triggers" as any).insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Engine
// ============================================================

// Run a flow against a specific contact via webhook (admin)
export const triggerFlowManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { flow_id: string; channel_id: string; contact_wa_id: string; conversation_id?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if ((context as any).vendor) {
      if (!(await vendorAllowedChannelIds(context, db)).includes(String(data.channel_id))) throw new Error("Inautorizado: vendedor sem acesso a este número");
      if (data.conversation_id) {
        const conv = await assertVendorConversationAccess(context, db, data.conversation_id, {
          channelId: data.channel_id,
          contactWaId: data.contact_wa_id,
        });
        if (conv?.id) data.conversation_id = String(conv.id);
      }
    }
    const { runFlowAdmin } = await import("@/lib/flow-engine.server");
    return runFlowAdmin({
      flowId: data.flow_id,
      channelId: data.channel_id,
      contactWaId: data.contact_wa_id,
      conversationId: data.conversation_id ?? null,
      db,
      triggerContext: { manual: true },
    });
  });

export const listActiveFlowRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) => ({ conversationId: String(d?.conversationId ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) return [];
    const db = await dbFor(context);
    await assertVendorConversationAccess(context, db, data.conversationId);
    const { data: runs, error } = await db
      .from("wa_flow_runs" as any)
      .select("id, flow_id, status, current_node_id, waiting_for, error, updated_at")
      .eq("conversation_id", data.conversationId)
      .in("status", ["queued", "running", "waiting"])
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = ((runs ?? []) as any[]);
    const ids = Array.from(new Set(rows.map((r) => r.flow_id).filter(Boolean).map(String)));
    let nameById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: flows } = await db.from("wa_flows" as any).select("id,nome").in("id", ids);
      nameById = new Map(((flows ?? []) as any[]).map((f) => [String(f.id), String(f.nome ?? "Fluxo")]));
    }
    return rows.map((r) => ({ ...r, flow_nome: nameById.get(String(r.flow_id)) ?? "Fluxo" }));
  });

export const fireNewLeadTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lead_id: string }) => ({ lead_id: String(d?.lead_id ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.lead_id) return { matched: 0 };
    const { dispatchNewLead } = await import("@/lib/flow-engine.server");
    return dispatchNewLead({ leadId: data.lead_id, db: context.supabase });
  });
