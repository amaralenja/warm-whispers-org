import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function dbFor(context: any) {
  if (context?.vendor) {
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

async function vendorAllowedWorkspaceIds(context: any, db: any): Promise<string[]> {
  const explicit = context?.vendor?.workspace_ids;
  if (Array.isArray(explicit) && explicit.length > 0) return explicit.map(String).filter(Boolean);

  const expert = context?.vendor?.expert ? String(context.vendor.expert).trim() : "";
  if (expert) return [expert];

  const rpcArgs = vendorRpcArgs(context);
  if (!rpcArgs) return [];
  const { data } = await db.rpc("vendor_allowed_workspace_ids" as any, rpcArgs);
  return Array.isArray(data) ? data.map(String).filter(Boolean) : [];
}

async function coerceVendorOperacaoId(context: any, db: any, operacaoId?: string | null): Promise<string | null> {
  if (!context?.vendor) return operacaoId ?? null;
  const allowed = await vendorAllowedWorkspaceIds(context, db);
  if (allowed.length === 0) throw new Error("Sessão de vendedor sem operação liberada");

  const desired = String(operacaoId ?? "").trim();
  if (!desired) return allowed[0];

  const ok = allowed.some((op) => normalizeText(op) === normalizeText(desired));
  if (!ok) throw new Error("Inautorizado: vendedor sem acesso a esta operação");
  return desired;
}

async function assertVendorFlowAccess(context: any, db: any, flowId: string) {
  if (!context?.vendor) return;
  const rpcArgs = vendorRpcArgs(context);
  if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
  const { data, error } = await db.rpc("vendor_get_flow" as any, { ...rpcArgs, _flow_id: flowId });
  if (error) throw new Error(error.message);
  const flow = Array.isArray(data) ? data[0] : data;
  if (!flow) throw new Error("Fluxo não encontrado ou indisponível para esta operação");
  return flow;
}

async function createVendorFlowViaRpc(
  context: any,
  db: any,
  payload: {
    nome: string;
    operacao_id: string | null;
    folder?: string | null;
    ativo: boolean;
    entry_node_id?: string | null;
    nodes: any[];
    edges: any[];
    descricao?: string | null;
  },
) {
  const rpcArgs = vendorRpcArgs(context);
  if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
  const { data, error } = await db.rpc("vendor_create_wa_flow" as any, {
    ...rpcArgs,
    _nome: payload.nome,
    _operacao_id: payload.operacao_id,
    _folder: payload.folder ?? null,
    _ativo: payload.ativo,
    _entry_node_id: payload.entry_node_id ?? null,
    _nodes: payload.nodes ?? [],
    _edges: payload.edges ?? [],
    _descricao: payload.descricao ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Não foi possível criar o fluxo do vendedor");
  return row as any;
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

async function attachFlowTriggers(db: any, flows: any[], context?: any) {
  if (!Array.isArray(flows) || flows.length === 0) return flows ?? [];
  const ids = flows.map((f) => String(f.id)).filter(Boolean);
  const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
  if (rpcArgs) {
    const entries = await Promise.all(ids.map(async (flowId) => {
      const { data, error } = await db.rpc("vendor_list_wa_flow_triggers" as any, { ...rpcArgs, _flow_id: flowId });
      if (error) return [flowId, [] as any[]] as const;
      return [flowId, Array.isArray(data) ? data : []] as const;
    }));
    const byFlow = new Map<string, any[]>(entries);
    return flows.map((f) => ({ ...f, wa_flow_triggers: byFlow.get(String(f.id)) ?? [] }));
  }
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

async function vendorReplaceTriggers(context: any, db: any, flowId: string, triggers: any[]) {
  const rpcArgs = vendorRpcArgs(context);
  if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
  const { data, error } = await db.rpc("vendor_replace_wa_flow_triggers" as any, {
    ...rpcArgs,
    _flow_id: flowId,
    _triggers: triggers ?? [],
  });
  if (error) throw new Error(error.message);
  if (data === false) throw new Error("Fluxo não encontrado ou indisponível para esta operação");
  return { ok: true };
}

async function vendorUpdateFlowViaRpc(context: any, db: any, flowId: string, patch: Record<string, any>) {
  const rpcArgs = vendorRpcArgs(context);
  if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
  const { data, error } = await db.rpc("vendor_update_wa_flow" as any, {
    ...rpcArgs,
    _flow_id: flowId,
    _nome: Object.prototype.hasOwnProperty.call(patch, "nome") ? patch.nome : null,
    _operacao_id: Object.prototype.hasOwnProperty.call(patch, "operacao_id") ? patch.operacao_id : null,
    _folder: Object.prototype.hasOwnProperty.call(patch, "folder") ? patch.folder : null,
    _ativo: Object.prototype.hasOwnProperty.call(patch, "ativo") ? patch.ativo : null,
    _entry_node_id: Object.prototype.hasOwnProperty.call(patch, "entry_node_id") ? patch.entry_node_id : null,
    _nodes: Object.prototype.hasOwnProperty.call(patch, "nodes") ? patch.nodes : null,
    _edges: Object.prototype.hasOwnProperty.call(patch, "edges") ? patch.edges : null,
    _set_operacao: Object.prototype.hasOwnProperty.call(patch, "operacao_id"),
    _set_folder: Object.prototype.hasOwnProperty.call(patch, "folder"),
    _set_ativo: Object.prototype.hasOwnProperty.call(patch, "ativo"),
    _set_entry_node_id: Object.prototype.hasOwnProperty.call(patch, "entry_node_id"),
    _set_nodes: Object.prototype.hasOwnProperty.call(patch, "nodes"),
    _set_edges: Object.prototype.hasOwnProperty.call(patch, "edges"),
  });
  if (error) throw new Error(error.message);
  if (data === false) throw new Error("Fluxo não encontrado ou indisponível para esta operação");
  return { ok: true };
}

async function listFlowsForNameCheck(db: any, context?: any) {
  const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
  if (rpcArgs) {
    const { data } = await db.rpc("vendor_list_flows" as any, rpcArgs);
    return (data ?? []) as any[];
  }
  const { data } = await db.from("wa_flows" as any).select("id, nome");
  return (data ?? []) as any[];
}

async function flowNameExists(db: any, nome: string, excludeId: string | null = null, context?: any) {
  const rows = await listFlowsForNameCheck(db, context);
  const wanted = String(nome ?? "").trim().toLowerCase();
  return rows.some((r) => (!excludeId || String(r.id) !== String(excludeId)) && String(r.nome ?? "").trim().toLowerCase() === wanted);
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
  if (!conversationId && (!fallback?.channelId || !fallback?.contactWaId)) return;

  const rpcArgs = vendorRpcArgs(context);
  if (!rpcArgs) throw new Error("Sessão de vendedor inválida");

  const channelId = String(fallback?.channelId ?? "").trim() || null;
  const contactWaId = String(fallback?.contactWaId ?? "").trim() || null;
  const { data: rpcData, error: rpcError } = await db.rpc("vendor_resolve_wa_conversation" as any, {
    ...rpcArgs,
    _conversation_id: conversationId || null,
    _channel_id: channelId,
    _contact_wa_id: contactWaId,
  });

  if (rpcError) {
    console.error("[flow-engine] vendor_resolve_wa_conversation failed", {
      error: rpcError,
      vendorId: rpcArgs._vendor_id,
      conversationId,
      channelId,
      contactWaId,
    });
    throw new Error("Conversa não encontrada");
  }

  const resolved = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (resolved?.id) return resolved as any;
  if (!conversationId) throw new Error("Conversa não encontrada");

  const conv = await findVendorConversation(db, conversationId, fallback);
  if (!conv) throw new Error("Conversa não encontrada");
  const assigned = (conv as any).assigned_vendor_id;
  const assignedId = assigned == null ? null : Number(assigned);
  const currentVendorId = Number(context.vendor.id);
  // Conversas já atribuídas ao vendedor devem funcionar mesmo se o canal antigo
  // ainda estiver sem vínculo de operação/canal no cadastro do vendedor.
  if (assignedId !== currentVendorId) {
    const allowed = await vendorAllowedChannelIds(context, db);
    if (!allowed.includes(String((conv as any).channel_id))) {
      throw new Error("Inautorizado: vendedor sem acesso a este número");
    }
  }
  if (assignedId == null) {
    await db
      .from("wa_conversations" as any)
      .update({ assigned_vendor_id: currentVendorId })
      .eq("id", (conv as any).id)
      .is("assigned_vendor_id", null);
    return { ...(conv as any), assigned_vendor_id: currentVendorId };
  }
  if (assignedId !== currentVendorId) {
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
      return attachFlowTriggers(db, (data ?? []) as any[], context);
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
      return (await attachFlowTriggers(db, [flow], context))[0];
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
  context?: any,
): Promise<string> {
  const base = (desired || "").trim() || "Novo Fluxo";
  const rows = await listFlowsForNameCheck(supabase, context);
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
    const db = await dbFor(context);
    const isVendor = Boolean((context as any)?.vendor);
    const startId = "n-trigger";
    const nome = data.nome.trim();
    const operacaoId = await coerceVendorOperacaoId(context, db, data.operacao_id);
    if (await flowNameExists(db, nome, null, context)) {
      throw new Error(`Já existe um fluxo com o nome "${nome}". Escolha outro nome.`);
    }
    if (isVendor) {
      const row = await createVendorFlowViaRpc(context, db, {
        nome,
        operacao_id: operacaoId,
        folder: data.folder,
        ativo: true,
        entry_node_id: startId,
        nodes: [
          { id: startId, type: "trigger", position: { x: 100, y: 100 }, data: { label: "Início" } },
        ],
        edges: [],
      });
      return { id: row.id };
    }
    const { data: row, error } = await db
      .from("wa_flows" as any)
      .insert({
        nome,
        operacao_id: operacaoId,
        folder: data.folder,
        ativo: true,
        entry_node_id: startId,
        nodes: [
          { id: startId, type: "trigger", position: { x: 100, y: 100 }, data: { label: "Início" } },
        ],
        edges: [],
        created_by: isVendor ? null : context.userId,
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
    const db = await dbFor(context);
    await assertVendorFlowAccess(context, db, data.id);
    const patch: any = {};
    for (const k of ["nome", "operacao_id", "folder", "ativo", "entry_node_id", "nodes", "edges"]) {
      if ((data as any)[k] !== undefined) patch[k] = (data as any)[k];
    }
    if (typeof patch.folder === "string") patch.folder = patch.folder.trim() || null;
    if (typeof patch.nome === "string" && patch.nome.trim()) {
      const novoNome = patch.nome.trim();
      if (await flowNameExists(db, novoNome, data.id, context)) {
        throw new Error(`Já existe outro fluxo com o nome "${novoNome}".`);
      }
      patch.nome = novoNome;
    }
    if ("operacao_id" in patch) patch.operacao_id = await coerceVendorOperacaoId(context, db, patch.operacao_id);
    if ((context as any)?.vendor) return vendorUpdateFlowViaRpc(context, db, data.id, patch);
    const { error } = await db
      .from("wa_flows" as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    await assertVendorFlowAccess(context, db, data.id);
    if ((context as any)?.vendor) {
      const rpcArgs = vendorRpcArgs(context);
      if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
      const { data: ok, error } = await db.rpc("vendor_delete_wa_flow" as any, { ...rpcArgs, _flow_id: data.id });
      if (error) throw new Error(error.message);
      if (ok === false) throw new Error("Fluxo não encontrado ou indisponível para esta operação");
      return { ok: true };
    }
    const { error } = await db.from("wa_flows" as any).delete().eq("id", data.id);
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
    const db = await dbFor(context);
    const isVendor = Boolean((context as any)?.vendor);
    let src: any;
    let error: any = null;
    if (isVendor) {
      src = await assertVendorFlowAccess(context, db, data.id);
      src = (await attachFlowTriggers(db, [src], context))[0];
    } else {
      const res = await db
        .from("wa_flows" as any)
        .select("*, wa_flow_triggers(*)")
        .eq("id", data.id).single();
      src = res.data;
      error = res.error;
    }
    if (error || !src) throw new Error(error?.message ?? "Fluxo não encontrado");
    const newName = await uniqueFlowName(db, (src as any).nome, null, context);
    const operacaoId = await coerceVendorOperacaoId(context, db, (src as any).operacao_id);
    let row: any;
    let insErr: any = null;
    if (isVendor) {
      row = await createVendorFlowViaRpc(context, db, {
        nome: newName,
        operacao_id: operacaoId,
        folder: (src as any).folder ?? null,
        ativo: false,
        entry_node_id: (src as any).entry_node_id,
        nodes: (src as any).nodes ?? [],
        edges: (src as any).edges ?? [],
      });
    } else {
      const res = await db
      .from("wa_flows" as any)
      .insert({
        nome: newName,
        operacao_id: operacaoId,
        ativo: false,
        entry_node_id: (src as any).entry_node_id,
        nodes: (src as any).nodes ?? [],
        edges: (src as any).edges ?? [],
        created_by: context.userId,
      })
      .select("id").single();
      row = res.data;
      insErr = res.error;
    }
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
      if (isVendor) await vendorReplaceTriggers(context, db, (row as any).id, rows);
      else await db.from("wa_flow_triggers" as any).insert(rows);
    }
    return { id: (row as any).id, nome: newName };
  });

export const exportFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    const isVendor = Boolean((context as any)?.vendor);
    let src: any;
    let error: any = null;
    if (isVendor) {
      src = await assertVendorFlowAccess(context, db, data.id);
      src = (await attachFlowTriggers(db, [src], context))[0];
    } else {
      const res = await db
        .from("wa_flows" as any)
        .select("nome, entry_node_id, nodes, edges, wa_flow_triggers(tipo, valor, match_mode, ativo)")
        .eq("id", data.id).single();
      src = res.data;
      error = res.error;
    }
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
    const db = await dbFor(context);
    const isVendor = Boolean((context as any)?.vendor);
    const payload = decodeFlowCode(data.code);
    const desired = (data.nome?.trim() || payload.nome || "Fluxo Importado").toString().trim() || "Fluxo Importado";
    const finalName = await uniqueFlowName(db, desired, null, context);
    let operacaoId: string | null;
    try {
      operacaoId = await coerceVendorOperacaoId(context, db, data.operacao_id);
    } catch (e: any) {
      console.error("[flow-engine] importFlow coerce operação falhou", {
        vendor: !!(context as any)?.vendor,
        vendorId: (context as any)?.vendor?.id,
        requested: data.operacao_id,
        error: e?.message,
      });
      throw e;
    }
    let row: any;
    let error: any = null;
    if (isVendor) {
      try {
        row = await createVendorFlowViaRpc(context, db, {
          nome: finalName,
          operacao_id: operacaoId,
          ativo: false,
          entry_node_id: payload.entry_node_id ?? null,
          nodes: payload.nodes ?? [],
          edges: payload.edges ?? [],
        });
      } catch (e: any) {
        console.error("[flow-engine] importFlow vendor RPC falhou", {
          vendorId: (context as any)?.vendor?.id,
          finalName,
          operacaoId,
          error: e?.message,
        });
        throw e;
      }
    } else {
      const res = await db
        .from("wa_flows" as any)
        .insert({
          nome: finalName,
          operacao_id: operacaoId,
          ativo: false,
          entry_node_id: payload.entry_node_id ?? null,
          nodes: payload.nodes ?? [],
          edges: payload.edges ?? [],
          created_by: context.userId,
        })
        .select("id").single();
      row = res.data;
      error = res.error;
    }
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
      if (isVendor) {
        try {
          await vendorReplaceTriggers(context, db, (row as any).id, rows);
        } catch (e: any) {
          console.error("[flow-engine] importFlow vendorReplaceTriggers falhou", {
            vendorId: (context as any)?.vendor?.id,
            flowId: (row as any).id,
            error: e?.message,
          });
          // Não bloqueia o import — fluxo já foi criado; vendedor pode reeditar triggers depois.
        }
      } else {
        await db.from("wa_flow_triggers" as any).insert(rows);
      }
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
    const db = await dbFor(context);
    await assertVendorFlowAccess(context, db, data.flow_id);
    if ((context as any)?.vendor) return vendorReplaceTriggers(context, db, data.flow_id, data.triggers ?? []);
    await db.from("wa_flow_triggers" as any).delete().eq("flow_id", data.flow_id);
    if (data.triggers.length === 0) return { ok: true };
    const rows = data.triggers.map((t) => ({
      flow_id: data.flow_id,
      tipo: t.tipo,
      valor: t.valor ?? null,
      match_mode: t.match_mode ?? "contains",
      channel_id: t.channel_id ?? null,
      ativo: t.ativo ?? true,
    }));
    const { error } = await db.from("wa_flow_triggers" as any).insert(rows);
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
      const conv = await assertVendorConversationAccess(context, db, data.conversation_id ?? "", {
        channelId: data.channel_id,
        contactWaId: data.contact_wa_id,
      });
      if (conv?.id) data.conversation_id = String(conv.id);
    }
    const { runFlowAdmin } = await import("@/lib/flow-engine.server");
    // Enqueue only — worker (pg_cron -> /api/public/hooks/dispatch-worker) executes in background.
    return runFlowAdmin({
      flowId: data.flow_id,
      channelId: data.channel_id,
      contactWaId: data.contact_wa_id,
      conversationId: data.conversation_id ?? null,
      db,
      vendor: (context as any).vendor
        ? { id: Number((context as any).vendor.id), codigo: String((context as any).vendor.codigo ?? "") }
        : null,
      triggerContext: { manual: true },
      queueOnly: true,
    });
  });

export const triggerFlowBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    flow_id: string;
    targets: Array<{ channel_id: string; contact_wa_id: string; conversation_id?: string }>;
  }) => d)
  .handler(async ({ context, data }) => {
    if (!Array.isArray(data.targets) || data.targets.length === 0) return { enqueued: 0, results: [] };
    const db = await dbFor(context);
    const vendor = (context as any).vendor
      ? { id: Number((context as any).vendor.id), codigo: String((context as any).vendor.codigo ?? "") }
      : null;
    const allowedChannels = vendor ? await vendorAllowedChannelIds(context, db) : null;
    const { runFlowAdmin } = await import("@/lib/flow-engine.server");

    const results = await Promise.allSettled(
      data.targets.map(async (t) => {
        if (vendor && allowedChannels && !allowedChannels.includes(String(t.channel_id))) {
          throw new Error("Vendedor sem acesso ao canal");
        }
        let conversationId = t.conversation_id ?? null;
        if (vendor) {
          const conv = await assertVendorConversationAccess(context, db, conversationId ?? "", {
            channelId: t.channel_id,
            contactWaId: t.contact_wa_id,
          });
          if (conv?.id) conversationId = String(conv.id);
        }
        return runFlowAdmin({
          flowId: data.flow_id,
          channelId: t.channel_id,
          contactWaId: t.contact_wa_id,
          conversationId,
          db,
          vendor,
          triggerContext: { manual: true, bulk: true },
          queueOnly: true,
        });
      }),
    );

    return {
      enqueued: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
      results: results.map((r, i) => ({
        target: data.targets[i],
        ok: r.status === "fulfilled",
        error: r.status === "rejected" ? String((r as any).reason?.message ?? r.reason) : undefined,
      })),
    };
  });

export const listActiveFlowRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) => ({ conversationId: String(d?.conversationId ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) return [];
    const db = await dbFor(context);
    try {
      await assertVendorConversationAccess(context, db, data.conversationId);
    } catch {
      return [];
    }

    const rpcArgs = vendorRpcArgs(context);
    if (rpcArgs) {
      const { data: vendorRuns, error: vendorError } = await db.rpc(
        "vendor_list_active_wa_flow_runs" as any,
        { ...rpcArgs, _conversation_id: data.conversationId },
      );
      if (vendorError) throw new Error(vendorError.message);
      return (vendorRuns ?? []) as any[];
    }

    const { data: runs, error } = await db
      .from("wa_flow_runs" as any)
      .select("id, flow_id, status, current_node_id, waiting_for, error, updated_at, expires_at")
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

export const cancelFlowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string; conversationId: string }) => ({
    runId: String(d?.runId ?? ""),
    conversationId: String(d?.conversationId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    if (!data.runId) throw new Error("runId obrigatório");
    const db = await dbFor(context);
    const userDb = (context as any)?.supabase ?? db;

    // Valida acesso do vendedor à conversa (admin passa direto).
    if (data.conversationId && (context as any).vendor) {
      try {
        await assertVendorConversationAccess(context, db, data.conversationId);
      } catch {
        throw new Error("Sem acesso a esta conversa");
      }
    }

    // Primeiro tenta pelas RPCs SECURITY DEFINER usando a sessão autenticada.
    // Isso evita o caso em que o admin client cai pra chave publishable/anon
    // no preview e o UPDATE direto não consegue furar RLS.
    const rpcArgs = vendorRpcArgs(context);
    let rpcCancelled = 0;
    try {
      const rpcResult = rpcArgs
        ? await userDb.rpc("vendor_cancel_wa_flow_run" as any, { ...rpcArgs, _run_id: data.runId })
        : await userDb.rpc("cancel_active_wa_flow_runs" as any, { _run_id: data.runId });
      if (rpcResult?.error) {
        console.warn("[flow-engine] cancel RPC falhou, tentando fallback admin", rpcResult.error);
      } else {
        rpcCancelled = Number(rpcResult?.data ?? 0) || 0;
      }
    } catch (err) {
      console.warn("[flow-engine] cancel RPC exception, tentando fallback admin", err);
    }

    // Depois reforça com admin pra matar runs irmãs/duplicadas que a RPC antiga
    // ainda pode deixar vivas. A permissão já foi validada acima.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let target: any = null;
    const { data: targetRaw } = await supabaseAdmin
      .from("wa_flow_runs" as any)
      .select("id, flow_id, channel_id, contact_wa_id, conversation_id, status")
      .eq("id", data.runId)
      .maybeSingle();
    target = targetRaw as any;

    if (!target) {
      try {
        const { data: userTarget } = await userDb
          .from("wa_flow_runs" as any)
          .select("id, flow_id, channel_id, contact_wa_id, conversation_id, status")
          .eq("id", data.runId)
          .maybeSingle();
        target = userTarget as any;
      } catch {}
    }

    const activeStatuses = ["queued", "running", "waiting"];
    const cancelPatch = {
      status: "cancelled",
      waiting_for: null,
      expires_at: null,
      error: "Cancelado manualmente",
      updated_at: new Date().toISOString(),
    };

    const idsToKill = new Set<string>([data.runId]);
    if (target?.id) idsToKill.add(String(target.id));

    // Mata TODAS as runs irmãs (mesmo flow) na mesma conversa OU no mesmo
    // contato/canal — cobre duplicação por triggers concorrentes.
    if (target?.flow_id) {
      const conversationId = String(target.conversation_id ?? data.conversationId ?? "").trim();
      if (conversationId) {
        const { data: sib1 } = await supabaseAdmin
          .from("wa_flow_runs" as any)
          .select("id")
          .eq("flow_id", String(target.flow_id))
          .eq("conversation_id", conversationId)
          .in("status", activeStatuses);
        for (const row of (sib1 ?? []) as any[]) idsToKill.add(String(row.id));
      }
      if (target.channel_id && target.contact_wa_id) {
        const variants = whatsappNumberVariants(String(target.contact_wa_id));
        const { data: sib2 } = await supabaseAdmin
          .from("wa_flow_runs" as any)
          .select("id")
          .eq("flow_id", String(target.flow_id))
          .eq("channel_id", String(target.channel_id))
          .in("contact_wa_id", variants.length > 0 ? variants : [String(target.contact_wa_id)])
          .in("status", activeStatuses);
        for (const row of (sib2 ?? []) as any[]) idsToKill.add(String(row.id));
      }
    } else if (data.conversationId) {
      const { data: convRuns } = await supabaseAdmin
        .from("wa_flow_runs" as any)
        .select("id")
        .eq("conversation_id", data.conversationId)
        .in("status", activeStatuses);
      for (const row of (convRuns ?? []) as any[]) idsToKill.add(String(row.id));
    }

    const { data: forceRows, error: forceError } = await supabaseAdmin
      .from("wa_flow_runs" as any)
      .update(cancelPatch)
      .in("id", Array.from(idsToKill))
      .in("status", activeStatuses)
      .select("id");
    if (forceError && rpcCancelled === 0) throw new Error(forceError.message);

    return {
      ok: true,
      cancelled: rpcCancelled + (Array.isArray(forceRows) ? forceRows.length : 0),
      targetFound: Boolean(target),
    };
  });
