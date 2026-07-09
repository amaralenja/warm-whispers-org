import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Parse ticket em BR/US: aceita "R$ 1.234,56", "1234.56", etc. */
function parseTicket(raw: unknown): number {
  if (raw == null) return 0;
  let s = String(raw).replace(/R\$\s?/g, "").replace(/\s/g, "").trim();
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (hasComma) {
    const after = s.split(",")[1] || "";
    s = after.length <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const after = s.split(".").pop() || "";
    if (after.length === 3) s = s.replace(/\./g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDataField(raw: unknown): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let y = 0, m = 0, d = 0;
  let match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else {
    match = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (match) { d = +match[1]; m = +match[2]; y = +match[3]; }
    else return null;
  }
  const t = Date.UTC(y, m - 1, d);
  return Number.isFinite(t) ? t : null;
}

function parseFilterDay(raw: unknown): number | null {
  const s = safeString(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(t) ? t : null;
}

function toBrIsoDay(ts: number) {
  const d = new Date(ts - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function brStartIso(day: unknown): string | null {
  const s = safeString(day).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T03:00:00.000Z` : null;
}

function brEndIso(day: unknown): string | null {
  const start = parseFilterDay(day);
  if (start == null) return null;
  return new Date(start + 27 * 60 * 60 * 1000 - 1).toISOString();
}

function isWithinDayField(t: number | null, fromDay: number | null, toDay: number | null) {
  if (t == null) return false;
  if (fromDay != null && t < fromDay) return false;
  if (toDay != null && t > toDay) return false;
  return true;
}

export type X1Filter = {
  from?: string | null;
  to?: string | null;
  operacao?: string | null; // "all" | operacao_id
  channelId?: string | null; // "all" | wa_channels.id
  vendedorId?: string | null; // "all" | vendedores.id
};

export type X1VendedorOpcao = {
  id: number;
  nome: string;
  utm: string | null;
  fotoUrl: string | null;
};


export type X1CanalRow = {
  id: string;
  name: string;
  displayPhone: string | null;
  verifiedName: string | null;
  operacao: string;
};

export type X1OperacaoRow = {
  operacao: string;
  leads: number;
  conversas: number;
  msgsIn: number;
  msgsOut: number;
  vendas: number;
  faturamento: number;
  conversao: number; // 0..1
  ticketMedio: number;
};

export type X1VendedorRow = {
  vendedorId: number | null;
  utm: string | null;
  nome: string;
  expert: string | null;
  fotoUrl: string | null;
  leadsAtribuidos: number;
  msgsEnviadas: number;
  vendas: number;
  faturamento: number;
  conversao: number;
  ticketMedio: number;
};

export type X1SerieDia = { data: string; msgsIn: number; msgsOut: number; vendas: number };
export type X1SerieHora = { hora: string; msgsIn: number; msgsOut: number; vendas: number };

export type X1AnalyticsPayload = {
  kpis: {
    novosLeads: number;
    leadsAntigosAtivos: number; // conversas ativas no período que já existiam antes
    conversas: number;
    msgsIn: number;
    msgsOut: number;
    vendas: number;
    faturamento: number;
    ticketMedio: number;
    conversao: number;
    contatosUnicos: number;
    tempoRespostaMedio: number; // segundos
  };
  porOperacao: X1OperacaoRow[];
  porVendedor: X1VendedorRow[];
  serieDiaria: X1SerieDia[];
  serieHoraria: X1SerieHora[];
  operacoesDisponiveis: string[];
  canaisDisponiveis: X1CanalRow[];
  vendedoresDisponiveis: X1VendedorOpcao[];
};

const EMPTY: X1AnalyticsPayload = {
  kpis: {
    novosLeads: 0,
    leadsAntigosAtivos: 0,
    conversas: 0,

    msgsIn: 0,
    msgsOut: 0,
    vendas: 0,
    faturamento: 0,
    ticketMedio: 0,
    conversao: 0,
    contatosUnicos: 0,
    tempoRespostaMedio: 0,
  },
  porOperacao: [],
  porVendedor: [],
  serieDiaria: [],
  serieHoraria: [],
  operacoesDisponiveis: [],
  canaisDisponiveis: [],
  vendedoresDisponiveis: [],
};

// mapping UTM → operação (compatível com operacoes.functions.ts)
const OP_UTM_PREFIX: Record<string, string[]> = {
  Caio: ["GC", "BP"],
  Gustavo: ["LS", "LF"],
};
function operacaoFromUtm(utm: string | null | undefined): string | null {
  if (!utm) return null;
  const u = String(utm).trim().toUpperCase();
  for (const [op, prefixes] of Object.entries(OP_UTM_PREFIX)) {
    if (prefixes.some((p) => u.startsWith(p))) return op;
  }
  return null;
}

function safeString(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function safeNullableString(value: unknown): string | null {
  const s = safeString(value).trim();
  return s ? s : null;
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isApprovedEvent(value: unknown): boolean {
  const event = safeString(value).trim().toLowerCase();
  return event === "purchase_approved" || event.includes("aprov");
}

function normalizeUtm(value: unknown): string {
  return safeString(value).trim().toUpperCase();
}

function numericId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function messageVendorId(message: any): number | null {
  const raw = message?.raw && typeof message.raw === "object" ? message.raw as Record<string, unknown> : null;
  return numericId(message?.sent_by_vendor_id)
    ?? numericId(raw?.sent_by_vendor_id)
    ?? numericId((raw?.request as any)?.sent_by_vendor_id);
}

function messageSentByVendor(message: any, vendorId: number) {
  return messageVendorId(message) === vendorId;
}

function contactLeadKey(...values: unknown[]): string | null {
  for (const value of values) {
    const digits = safeString(value).replace(/\D/g, "");
    if (!digits) continue;
    return `phone:${digits.length > 11 ? digits.slice(-11) : digits}`;
  }
  for (const value of values) {
    const s = safeString(value).trim();
    if (s) return `id:${s}`;
  }
  return null;
}

function vendedorMatchesLead(vendedor: any, lead: any) {
  const leadUtm = normalizeUtm(lead?.responsavel_utm);
  const vendedorUtm = normalizeUtm(vendedor?.utm);
  if (leadUtm && vendedorUtm && leadUtm === vendedorUtm) return true;
  const respNome = safeNullableString(lead?.responsavel_nome);
  const vendedorNome = safeNullableString(vendedor?.nome);
  return !!respNome && !!vendedorNome && sameText(respNome, vendedorNome);
}

function resolveVendaOperacao(venda: any, produtoToOperacao: Map<string, string>, utmToVendedor?: Map<string, any>): string | null {
  const produto = safeString(venda?.Produto).trim().toLowerCase();
  const mapped = produto ? produtoToOperacao.get(produto) : null;
  if (mapped) return mapped;
  const explicit = safeNullableString(venda?.nome_expert);
  if (explicit) return explicit;
  const utm = normalizeUtm(venda?.UTM);
  const vendorExpert = safeNullableString(utmToVendedor?.get(utm)?.expert);
  if (vendorExpert) return vendorExpert;
  return operacaoFromUtm(utm);
}

function qualifiedVendaOperacao(venda: any, produtoToOperacao: Map<string, string>): string | null {
  const produto = safeString(venda?.Produto).trim().toLowerCase();
  const mapped = produto ? produtoToOperacao.get(produto) : null;
  return mapped ?? null;
}

function normalizeText(value: unknown): string {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sameText(a: unknown, b: unknown) {
  return normalizeText(a) === normalizeText(b);
}

async function pageAllWithDb<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let i = 0; i < 40; i++) {
    const { data: rows, error } = await build(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw error;
    const arr = (rows ?? []) as T[];
    out.push(...arr);
    if (arr.length < PAGE) break;
  }
  return out;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchAnalyticsMessages(
  db: any,
  channelIds: string[],
  fromIso: string | null,
  toIso: string | null,
): Promise<any[]> {
  const ids = Array.from(new Set(channelIds.map((id) => safeString(id).trim()).filter(Boolean)));
  if (ids.length === 0) return [];

  const rows: any[] = [];
  for (const chunk of chunkArray(ids, 50)) {
    const chunkRows = await pageAllWithDb<any>((from, to) => {
      let q = db
        .from("wa_messages" as any)
        .select("id, conversation_id, channel_id, direction, created_at, sent_by, raw, deleted_at")
        .is("deleted_at", null)
        .in("channel_id", chunk)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (fromIso) q = q.gte("created_at", fromIso);
      if (toIso) q = q.lte("created_at", toIso);
      return q.range(from, to);
    });
    rows.push(...chunkRows);
  }
  rows.sort((a, b) => {
    const dt = Date.parse(safeString(a?.created_at)) - Date.parse(safeString(b?.created_at));
    return dt || safeString(a?.id).localeCompare(safeString(b?.id));
  });
  return rows;
}

function vendorRpcArgs(context: any) {
  const id = Number(context?.vendor?.id);
  const codigo = safeString(context?.vendor?.codigo).trim();
  return Number.isFinite(id) && id > 0 && codigo ? { _vendor_id: id, _codigo: codigo } : null;
}

function vendorWorkspaceIds(context: any): string[] {
  const ids = context?.vendor?.workspace_ids;
  const expert = safeNullableString(context?.vendor?.expert);
  if (Array.isArray(ids)) {
    const list = ids.map((id) => safeString(id).trim()).filter(Boolean);
    return list.length > 0 ? list : expert ? [expert] : [];
  }
  return expert ? [expert] : [];
}

function isWithinIso(raw: unknown, fromIso: string | null, toIso: string | null) {
  const t = Date.parse(safeString(raw));
  if (!Number.isFinite(t)) return false;
  if (fromIso && t < Date.parse(fromIso)) return false;
  if (toIso && t > Date.parse(toIso)) return false;
  return true;
}

function opAllowed(op: unknown, allowed: string[]) {
  if (allowed.length === 0) return true;
  return allowed.some((a) => sameText(a, op));
}

async function getVendorX1Analytics(
  context: any,
  data: X1Filter,
  opFilter: string | null,
  fromIso: string | null,
  toIso: string | null,
): Promise<X1AnalyticsPayload> {
  const db = await dbFor(context);
  const rpcArgs = vendorRpcArgs(context);
  if (!rpcArgs) return EMPTY;
  const vendorId = Number(context.vendor.id);
  if (!Number.isFinite(vendorId) || vendorId <= 0) return EMPTY;
  const fromDay = parseFilterDay(data.from);
  const toDay = parseFilterDay(data.to);

  const channelFilterRaw = safeString(data.channelId).trim();
  const channelFilterActive = channelFilterRaw && channelFilterRaw !== "all" ? channelFilterRaw : null;


  let allowedWorkspaces = vendorWorkspaceIds(context);
  try {
    const { data: rpcWorkspaces } = await (context.supabase as any).rpc("vendor_allowed_workspace_ids" as any, rpcArgs);
    if (Array.isArray(rpcWorkspaces) && rpcWorkspaces.length > 0) {
      allowedWorkspaces = rpcWorkspaces.map((x: unknown) => safeString(x).trim()).filter(Boolean);
    }
  } catch {
    // usa o contexto local como fallback
  }
  if (opFilter && !opAllowed(opFilter, allowedWorkspaces)) {
    return { ...EMPTY, operacoesDisponiveis: allowedWorkspaces };
  }

  const [channelsRes, conversationsRes, messagesRes, crmLeadsRes, produtosMapRes, vendasRes] = await Promise.all([
    db.rpc("vendor_list_wa_channels" as any, rpcArgs),
    db.rpc("vendor_list_x1_wa_conversations" as any, {
      ...rpcArgs,
      _operacao_id: opFilter ?? null,
      _from: fromIso,
      _to: toIso,
    }),
    db.rpc("vendor_list_x1_wa_messages" as any, {
      ...rpcArgs,
      _operacao_id: opFilter ?? null,
      _from: fromIso,
      _to: toIso,
    }),
    db.rpc("vendor_list_crm_leads" as any, rpcArgs),
    db.from("produtos_map").select("nome_produto, nome_expert, tipo_produto"),
    db.rpc("vendor_list_x1_sales" as any, {
      ...rpcArgs,
      _from: data.from || null,
      _to: data.to || null,
    }),
  ]);
  if (channelsRes.error) throw new Error(channelsRes.error.message);
  if (conversationsRes.error) throw new Error(conversationsRes.error.message);
  if (messagesRes.error) throw new Error(messagesRes.error.message);
  if (crmLeadsRes.error) throw new Error(crmLeadsRes.error.message);
  if (produtosMapRes.error) throw new Error(produtosMapRes.error.message);
  if (vendasRes.error) throw new Error(vendasRes.error.message);

  const produtoToOperacao = new Map<string, string>();
  for (const p of ((produtosMapRes.data ?? []) as any[])) {
    const produto = safeString(p?.nome_produto).trim().toLowerCase();
    const expert = safeString(p?.nome_expert).trim();
    if (produto && expert) produtoToOperacao.set(produto, expert);
  }

  const channelsAll = ((channelsRes.data ?? []) as any[]).filter((c) => {
    const op = safeString(c?.operacao_id).trim();
    if (!op || op === "__notificador__") return false;
    if (safeString(c?.kind, "chat") === "notification") return false;
    if (opFilter && !sameText(op, opFilter)) return false;
    return opAllowed(op, allowedWorkspaces);
  });
  const canaisDisponiveis: X1CanalRow[] = channelsAll.map((c) => ({
    id: safeString(c?.id).trim(),
    name: safeString(c?.name, safeString(c?.verified_name, "Canal")),
    displayPhone: safeNullableString(c?.display_phone_number),
    verifiedName: safeNullableString(c?.verified_name),
    operacao: safeString(c?.operacao_id).trim(),
  })).filter((c) => c.id).sort((a, b) => a.name.localeCompare(b.name));
  const channels = channelFilterActive
    ? channelsAll.filter((c) => safeString(c?.id).trim() === channelFilterActive)
    : channelsAll;
  const channelToOp = new Map<string, string>();
  const channelIds = new Set<string>();
  const operacoesSet = new Set<string>();
  for (const c of channels) {
    const id = safeString(c?.id).trim();
    const op = safeString(c?.operacao_id).trim();
    if (!id || !op) continue;
    channelIds.add(id);
    channelToOp.set(id, op);
    operacoesSet.add(op);
  }
  if (!channelFilterActive) {
    for (const op of allowedWorkspaces) if (!opFilter || sameText(op, opFilter)) operacoesSet.add(op);
  }

  const allConversations = ((conversationsRes.data ?? []) as any[]).filter((c) => {
    const channelId = safeString(c?.channel_id).trim();
    const op = safeString(c?.operacao_id ?? channelToOp.get(channelId)).trim();
    if (channelIds.size > 0 && !channelIds.has(channelId)) return false;
    if (opFilter && !sameText(op, opFilter)) return false;
    return opAllowed(op, allowedWorkspaces);
  });
  const assignedConversations = allConversations.filter((c) => Number(c?.assigned_vendor_id) === vendorId);
  const assignedConversationIds = new Set(assignedConversations.map((c) => safeString(c?.id)).filter(Boolean));
  const conversations = assignedConversations.filter((c) => (
    isWithinIso(c?.last_message_at ?? c?.created_at, fromIso, toIso)
    || isWithinIso(c?.created_at, fromIso, toIso)
  ));
  const novosLeadsRows = assignedConversations.filter((c) => isWithinIso(c?.created_at, fromIso, toIso));
  const vendorUtm = safeNullableString(context?.vendor?.utm);
  const vendorUtmNorm = normalizeUtm(vendorUtm);
  const crmLeads = ((crmLeadsRes.data ?? []) as any[]).filter((lead) => {
    if (!isWithinIso(lead?.created_at, fromIso, toIso)) return false;
    if (opFilter && !sameText(lead?.expert, opFilter)) return false;
    if (!opAllowed(lead?.expert, allowedWorkspaces)) return false;
    return vendedorMatchesLead(context.vendor, lead);
  });
  const leadKeys = new Set<string>();
  for (const c of novosLeadsRows) {
    const key = contactLeadKey(c?.contact_wa_id, c?.id);
    if (key) leadKeys.add(key);
  }
  for (const lead of crmLeads) {
    const key = contactLeadKey(lead?.telefone, lead?.id);
    if (key) leadKeys.add(key);
  }

  const messages = (messagesRes.data ?? []) as any[];
  const msgsScoped = messages.filter((m: any) => {
    if (m?.deleted_at) return false;
    if (!isWithinIso(m?.created_at, fromIso, toIso)) return false;
    const conversationId = safeString(m?.conversation_id).trim();
    if (!assignedConversationIds.has(conversationId)) return false;
    const channelId = safeString(m?.channel_id).trim();
    if (channelIds.size > 0 && !channelIds.has(channelId)) return false;
    const op = channelToOp.get(channelId) ?? "";
    if (opFilter && !sameText(op, opFilter)) return false;
    if (safeString(m?.direction) === "out") {
      const explicitVendorId = messageVendorId(m);
      if (explicitVendorId && explicitVendorId !== vendorId) return false;
    }
    return true;
  });

  const vendorExpert = safeNullableString(context?.vendor?.expert);
  const primaryOp = vendorExpert ?? allowedWorkspaces[0] ?? Array.from(operacoesSet)[0] ?? null;
  const inDay = (t: number | null) => isWithinDayField(t, fromDay, toDay);
  const vendorSales = ((vendasRes.data ?? []) as any[]).filter((v) => {
    if (!isApprovedEvent(v?.Evento)) return false;
    if (!vendorUtmNorm || normalizeUtm(v?.UTM) !== vendorUtmNorm) return false;
    if (!inDay(parseDataField(v?.Data))) return false;
    // Opera com o expert do vendedor como fallback quando o produto não está mapeado
    const op = resolveVendaOperacao(v, produtoToOperacao) ?? vendorExpert;
    if (opFilter && op && !sameText(op, opFilter)) return false;
    return true;
  });
  const vendas = vendorSales.length;
  const faturamento = vendorSales.reduce((acc: number, v: any) => acc + parseTicket(v?.Ticket), 0);
  const ticketMedio = vendas > 0 ? faturamento / vendas : 0;

  const msgsIn = msgsScoped.filter((m: any) => safeString(m?.direction) === "in").length;
  const msgsOut = msgsScoped.filter((m: any) => safeString(m?.direction) === "out").length;
  const contatosUnicos = new Set(
    conversations.map((c) => `${safeString(c?.channel_id)}|${safeString(c?.contact_wa_id)}`),
  ).size;

  const byConv: Record<string, any[]> = {};
  for (const m of msgsScoped) {
    const k = safeString(m?.conversation_id);
    if (!k) continue;
    (byConv[k] ??= []).push(m);
  }
  let respostas = 0;
  let somaSeg = 0;
  for (const arr of Object.values(byConv)) {
    arr.sort((a, b) => Date.parse(safeString(a?.created_at)) - Date.parse(safeString(b?.created_at)));
    let lastIn: number | null = null;
    for (const m of arr) {
      if (safeString(m?.direction) === "in") {
        if (lastIn == null) lastIn = Date.parse(safeString(m?.created_at));
      } else if (safeString(m?.direction) === "out" && lastIn != null) {
        const dt = (Date.parse(safeString(m?.created_at)) - lastIn) / 1000;
        if (dt >= 0 && dt < 86400 * 3) {
          somaSeg += dt;
          respostas += 1;
        }
        lastIn = null;
      }
    }
  }
  const tempoRespostaMedio = respostas > 0 ? somaSeg / respostas : 0;

  const opRows: X1OperacaoRow[] = Array.from(operacoesSet).map((op) => {
    const convOp = conversations.filter((c) => sameText(c?.operacao_id ?? channelToOp.get(safeString(c?.channel_id)), op));
    const novosOp = novosLeadsRows.filter((c) => sameText(c?.operacao_id ?? channelToOp.get(safeString(c?.channel_id)), op));
    const leadOpKeys = new Set<string>();
    for (const c of novosOp) {
      const key = contactLeadKey(c?.contact_wa_id, c?.id);
      if (key) leadOpKeys.add(key);
    }
    for (const lead of crmLeads.filter((l) => sameText(l?.expert, op))) {
      const key = contactLeadKey(lead?.telefone, lead?.id);
      if (key) leadOpKeys.add(key);
    }
    const msgOp = msgsScoped.filter((m: any) => sameText(channelToOp.get(safeString(m?.channel_id)), op));
    const vdsOp = vendorSales.filter((v: any) => sameText(resolveVendaOperacao(v, produtoToOperacao) ?? vendorExpert, op));
    const fatOp = vdsOp.reduce((acc: number, v: any) => acc + parseTicket(v?.Ticket), 0);
    return {
      operacao: op,
      leads: leadOpKeys.size,
      conversas: convOp.length,
      msgsIn: msgOp.filter((m: any) => safeString(m?.direction) === "in").length,
      msgsOut: msgOp.filter((m: any) => safeString(m?.direction) === "out").length,
      vendas: vdsOp.length,
      faturamento: fatOp,
      conversao: leadOpKeys.size > 0 ? vdsOp.length / leadOpKeys.size : 0,
      ticketMedio: vdsOp.length > 0 ? fatOp / vdsOp.length : 0,
    };
  }).sort((a, b) => b.faturamento - a.faturamento || b.msgsOut - a.msgsOut);

  const leadsAtribuidos = leadKeys.size;
  const porVendedor: X1VendedorRow[] = [{
    vendedorId: vendorId,
    utm: vendorUtm,
    nome: safeString(context.vendor.nome, vendorUtm ?? "Vendedor"),
    expert: primaryOp,
    fotoUrl: safeNullableString(context.vendor.foto_url),
    leadsAtribuidos,
    msgsEnviadas: msgsOut,
    vendas,
    faturamento,
    conversao: leadsAtribuidos > 0 ? vendas / leadsAtribuidos : 0,
    ticketMedio,
  }];

  const dayMap = new Map<string, X1SerieDia>();
  for (const m of msgsScoped) {
    const t = Date.parse(safeString(m?.created_at));
    if (!Number.isFinite(t)) continue;
    const iso = toBrIsoDay(t);
    const e = dayMap.get(iso) ?? { data: iso, msgsIn: 0, msgsOut: 0, vendas: 0 };
    if (safeString(m?.direction) === "in") e.msgsIn += 1;
    else if (safeString(m?.direction) === "out") e.msgsOut += 1;
    dayMap.set(iso, e);
  }
  for (const row of vendorSales) {
    const t = parseDataField(row?.Data);
    if (!t) continue;
    const iso = toIsoDay(new Date(t));
    if (!iso) continue;
    const e = dayMap.get(iso) ?? { data: iso, msgsIn: 0, msgsOut: 0, vendas: 0 };
    e.vendas += 1;
    dayMap.set(iso, e);
  }
  const serieDiaria = Array.from(dayMap.values()).sort((a, b) => a.data.localeCompare(b.data));

  const hourMap = new Map<number, X1SerieHora>();
  for (let h = 0; h < 24; h++) {
    hourMap.set(h, { hora: `${String(h).padStart(2, "0")}h`, msgsIn: 0, msgsOut: 0, vendas: 0 });
  }
  const brHour = (ts: number) => (new Date(ts).getUTCHours() - 3 + 24) % 24;
  for (const m of msgsScoped) {
    const t = Date.parse(safeString(m?.created_at));
    if (!Number.isFinite(t)) continue;
    const e = hourMap.get(brHour(t))!;
    if (safeString(m?.direction) === "in") e.msgsIn += 1;
    else if (safeString(m?.direction) === "out") e.msgsOut += 1;
  }
  for (const row of vendorSales) {
    const t = parseDataField(row?.Data);
    if (!t) continue;
    hourMap.get(brHour(t))!.vendas += 1;
  }

  const novosLeads = leadKeys.size;
  return {
    kpis: {
      novosLeads,
      leadsAntigosAtivos: Math.max(0, conversations.length - novosLeads),
      conversas: conversations.length,
      msgsIn,
      msgsOut,
      vendas,
      faturamento,
      ticketMedio,
      conversao: novosLeads > 0 ? vendas / novosLeads : 0,
      contatosUnicos,
      tempoRespostaMedio,
    },
    porOperacao: opRows,
    porVendedor,
    serieDiaria,
    serieHoraria: Array.from(hourMap.values()),
    operacoesDisponiveis: Array.from(operacoesSet).sort(),
    canaisDisponiveis,
    vendedoresDisponiveis: [],
  };
}

async function dbFor(context: any) {
  if (context?.vendor) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return supabaseAdmin as any;
    } catch (err) {
      console.warn("[x1-analytics] supabaseAdmin indisponível — usando client autenticado", err);
    }
  }
  return context.supabase as any;
}

function toIsoDay(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export const getX1Analytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: X1Filter | undefined) => input ?? {})
  .handler(async (opts): Promise<X1AnalyticsPayload> => {
    const context = opts?.context;
    const data = opts?.data ?? {};
    if (!context?.supabase) return EMPTY;

    const fromIso = brStartIso(data.from);
    const toIso = brEndIso(data.to);
    const fromDay = parseFilterDay(data.from);
    const toDay = parseFilterDay(data.to);
    const opFilter = data.operacao && data.operacao !== "all" ? String(data.operacao) : null;
    const channelFilterRaw = safeString(data.channelId).trim();
    const channelFilterActive = channelFilterRaw && channelFilterRaw !== "all" ? channelFilterRaw : null;

    if (context?.vendor) {
      return getVendorX1Analytics(context, data, opFilter, fromIso, toIso);
    }

    const supabase = await dbFor(context);

    async function pageAll<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
      const PAGE = 1000;
      const out: T[] = [];
      for (let i = 0; i < 40; i++) {
        const { data: rows, error } = await build(i * PAGE, i * PAGE + PAGE - 1);
        if (error) throw error;
        const arr = (rows ?? []) as T[];
        out.push(...arr);
        if (arr.length < PAGE) break;
      }
      return out;
    }

    // canais + operações
    const { data: channels } = await supabase
      .from("wa_channels")
      .select("id, operacao_id, verified_name, name, display_phone_number, kind")
      .neq("operacao_id", "__notificador__");
    const channelToOp = new Map<string, string>();
    const operacoesSet = new Set<string>();
    const canaisDisponiveis: X1CanalRow[] = [];
    for (const c of (channels ?? []) as any[]) {
      const op = String(c.operacao_id ?? "").trim();
      if (!op || op === "__notificador__") continue;
      if (safeString(c?.kind, "chat") === "notification") continue;
      channelToOp.set(String(c.id), op);
      operacoesSet.add(op);
      if (!opFilter || sameText(op, opFilter)) {
        canaisDisponiveis.push({
          id: safeString(c?.id).trim(),
          name: safeString(c?.name, safeString(c?.verified_name, "Canal")),
          displayPhone: safeNullableString(c?.display_phone_number),
          verifiedName: safeNullableString(c?.verified_name),
          operacao: op,
        });
      }
    }
    canaisDisponiveis.sort((a, b) => a.name.localeCompare(b.name));
    const channelAllowed = (channelId: unknown) => {
      if (!channelFilterActive) return true;
      return safeString(channelId).trim() === channelFilterActive;
    };

    // Conversas (todas com created_at no período OU last_message_at no período)
    const convQuery = supabase
      .from("wa_conversations")
      .select("id, channel_id, contact_wa_id, operacao_id, created_at, last_message_at, assigned_vendor_id")
      .order("id", { ascending: true });
    const allConversationsRaw = await pageAll<any>((from, to) => convQuery.range(from, to));
    const allConversations = allConversationsRaw.filter((c: any) => {
      const op = safeString(c?.operacao_id ?? channelToOp.get(safeString(c?.channel_id))).trim();
      if (opFilter && !sameText(op, opFilter)) return false;
      if (!channelAllowed(c?.channel_id)) return false;
      return true;
    });
    const conversationToVendorId = new Map<string, number>();
    for (const c of allConversations) {
      const id = safeString(c?.id).trim();
      const vendorId = numericId(c?.assigned_vendor_id);
      if (id && vendorId) conversationToVendorId.set(id, vendorId);
    }
    const conversations = allConversations.filter((c: any) => (
      isWithinIso(c?.last_message_at ?? c?.created_at, fromIso, toIso)
      || isWithinIso(c?.created_at, fromIso, toIso)
    ));

    // Novos leads (created_at no período)
    let novoQuery = supabase
      .from("wa_conversations")
      .select("id, operacao_id, created_at, contact_wa_id, channel_id, assigned_vendor_id")
      .order("id", { ascending: true });
    if (fromIso) novoQuery = novoQuery.gte("created_at", fromIso);
    if (toIso) novoQuery = novoQuery.lte("created_at", toIso);
    const novosLeadsRowsRaw = await pageAll<any>((from, to) => novoQuery.range(from, to));
    const novosLeadsRows = novosLeadsRowsRaw.filter((c: any) => {
      const op = safeString(c?.operacao_id ?? channelToOp.get(safeString(c?.channel_id))).trim();
      if (opFilter && !sameText(op, opFilter)) return false;
      if (!channelAllowed(c?.channel_id)) return false;
      return true;
    });

    let crmLeadQuery = supabase
      .from("crm_leads" as any)
      .select("id, telefone, expert, responsavel_utm, responsavel_nome, created_at")
      .order("id", { ascending: true });
    if (fromIso) crmLeadQuery = crmLeadQuery.gte("created_at", fromIso);
    if (toIso) crmLeadQuery = crmLeadQuery.lte("created_at", toIso);
    if (opFilter) crmLeadQuery = crmLeadQuery.eq("expert", opFilter);
    const crmLeadsRows = await pageAll<any>((from, to) => crmLeadQuery.range(from, to));

    // Mensagens do período
    const messageChannelIds = Array.from(channelToOp.keys()).filter((id) => channelAllowed(id));
    const messages = await fetchAnalyticsMessages(supabase, messageChannelIds, fromIso, toIso);

    // filtra mensagens: só descarta se opFilter estiver ativo e o canal não pertencer.
    // Sem opFilter, contamos TODAS as mensagens do período (mesmo de canais sem operacao_id).
    const msgsScoped = messages.filter((m) => {
      if (!channelAllowed(m.channel_id)) return false;
      if (opFilter) {
        const op = channelToOp.get(String(m.channel_id)) ?? "";
        if (op !== opFilter) return false;
      }
      return true;
    });


    // Vendas & vendedores (para conversão e faturamento por operação)
    const [vendedoresRes, produtosMapRes, vendasAll] = await Promise.all([
      supabase.from("vendedores").select("id, utm, nome, expert, foto_url, ativo"),
      supabase.from("produtos_map").select("nome_produto, nome_expert, tipo_produto"),
      pageAll<any>((from, to) =>
        supabase
          .from("vendas")
          .select('"Ticket","Data","UTM","Evento","Produto",nome_expert,tipo_produto')
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);
    const vendedores = (vendedoresRes.data ?? []) as any[];
    const utmToVendedor = new Map<string, any>();
    for (const v of vendedores) {
      const utm = normalizeUtm(v.utm);
      if (utm) utmToVendedor.set(utm, v);
    }
    const vendedorById = new Map<number, any>();
    for (const v of vendedores) {
      const id = numericId(v?.id);
      if (id) vendedorById.set(id, v);
    }
    const produtoToOperacao = new Map<string, string>();
    for (const p of ((produtosMapRes.data ?? []) as any[])) {
      const produto = safeString(p?.nome_produto).trim().toLowerCase();
      const expert = safeString(p?.nome_expert).trim();
      if (produto && expert) produtoToOperacao.set(produto, expert);
    }

    const vendaOperacao = (venda: any): string | null => resolveVendaOperacao(venda, produtoToOperacao, utmToVendedor);

    const inDay = (t: number | null) => isWithinDayField(t, fromDay, toDay);
    const vendasPeriodo = vendasAll.filter((v: any) => (
      isApprovedEvent(v?.Evento)
      && inDay(parseDataField(v.Data))
      && !!(vendaOperacao(v) ?? safeNullableString(v?.nome_expert))
    ));
    const vendasScoped = vendasPeriodo.filter((v: any) => {
      const op = vendaOperacao(v);
      if (opFilter) return sameText(op, opFilter);
      return true;
    });

    const allLeadKeys = new Set<string>();
    const vendorLeadKeys = new Map<string, Set<string>>();
    const keyForVendor = (v: any) => `id:${v?.id ?? "?"}|utm:${v?.utm ?? "?"}`;
    const addVendorLead = (v: any, key: string | null) => {
      if (!v || !key) return;
      allLeadKeys.add(key);
      const vendorKey = keyForVendor(v);
      const set = vendorLeadKeys.get(vendorKey) ?? new Set<string>();
      set.add(key);
      vendorLeadKeys.set(vendorKey, set);
    };
    for (const c of novosLeadsRows) {
      const leadKey = contactLeadKey(c?.contact_wa_id, c?.id);
      if (leadKey) allLeadKeys.add(leadKey);
      const vend = vendedorById.get(Number(c?.assigned_vendor_id));
      addVendorLead(vend, leadKey);
    }
    for (const lead of crmLeadsRows) {
      const leadKey = contactLeadKey(lead?.telefone, lead?.id);
      if (leadKey) allLeadKeys.add(leadKey);
      const vend = vendedores.find((v: any) => vendedorMatchesLead(v, lead));
      addVendorLead(vend, leadKey);
    }

    // KPIs
    const msgsIn = msgsScoped.filter((m) => m.direction === "in").length;
    const msgsOut = msgsScoped.filter((m) => m.direction === "out").length;
    const faturamento = vendasScoped.reduce((a: number, v: any) => a + parseTicket(v.Ticket), 0);
    const contatosUnicos = new Set(
      conversations.map((c) => `${c.channel_id}|${c.contact_wa_id}`),
    ).size;

    // tempo médio de resposta: por conversa, primeira msg OUT após INBOUND
    const byConv: Record<string, any[]> = {};
    for (const m of msgsScoped) {
      const k = String(m.conversation_id);
      (byConv[k] ??= []).push(m);
    }
    let respostas = 0;
    let somaSeg = 0;
    for (const arr of Object.values(byConv)) {
      arr.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      let lastIn: number | null = null;
      for (const m of arr) {
        if (m.direction === "in") {
          if (lastIn == null) lastIn = Date.parse(m.created_at);
        } else if (m.direction === "out" && lastIn != null) {
          const dt = (Date.parse(m.created_at) - lastIn) / 1000;
          if (dt >= 0 && dt < 86400 * 3) {
            somaSeg += dt;
            respostas += 1;
          }
          lastIn = null;
        }
      }
    }
    const tempoRespostaMedio = respostas > 0 ? somaSeg / respostas : 0;

    // Por operação
    const opRows: X1OperacaoRow[] = [];
    for (const op of operacoesSet) {
      if (opFilter && op !== opFilter) continue;
      const convOp = conversations.filter((c) => sameText(c?.operacao_id ?? channelToOp.get(safeString(c?.channel_id)), op));
      const novosOp = novosLeadsRows.filter((c) => sameText(c?.operacao_id ?? channelToOp.get(safeString(c?.channel_id)), op));
      const leadOpKeys = new Set<string>();
      for (const c of novosOp) {
        const key = contactLeadKey(c?.contact_wa_id, c?.id);
        if (key) leadOpKeys.add(key);
      }
      for (const lead of crmLeadsRows.filter((l: any) => sameText(l?.expert, op))) {
        const key = contactLeadKey(lead?.telefone, lead?.id);
        if (key) leadOpKeys.add(key);
      }
      const msgOp = msgsScoped.filter((m) => channelToOp.get(String(m.channel_id)) === op);
      const inC = msgOp.filter((m) => m.direction === "in").length;
      const outC = msgOp.filter((m) => m.direction === "out").length;
      const vdsOp = vendasPeriodo.filter((v: any) => sameText(vendaOperacao(v), op));
      const fatOp = vdsOp.reduce((a: number, v: any) => a + parseTicket(v.Ticket), 0);
      const leadsCount = leadOpKeys.size;
      opRows.push({
        operacao: op,
        leads: leadsCount,
        conversas: convOp.length,
        msgsIn: inC,
        msgsOut: outC,
        vendas: vdsOp.length,
        faturamento: fatOp,
        conversao: leadsCount > 0 ? vdsOp.length / leadsCount : 0,
        ticketMedio: vdsOp.length > 0 ? fatOp / vdsOp.length : 0,
      });
    }
    opRows.sort((a, b) => b.faturamento - a.faturamento);

    // Por vendedor
    const vRows = new Map<string, X1VendedorRow>();
    const keyFor = keyForVendor;
    for (const v of vendedores) {
      vRows.set(keyFor(v), {
        vendedorId: v.id ?? null,
        utm: v.utm ?? null,
        nome: v.nome ?? String(v.utm ?? "—"),
        expert: v.expert ?? null,
        fotoUrl: v.foto_url ?? null,
        leadsAtribuidos: 0,
        msgsEnviadas: 0,
        vendas: 0,
        faturamento: 0,
        conversao: 0,
        ticketMedio: 0,
      });
    }
    // Leads atribuídos: une CRM (responsavel_utm/nome) + WhatsApp (assigned_vendor_id), deduplicando por telefone.
    for (const [vendorKey, keys] of vendorLeadKeys.entries()) {
      const row = vRows.get(vendorKey);
      if (row) row.leadsAtribuidos = keys.size;
    }
    // msgs enviadas por vendedor
    for (const m of msgsScoped) {
      if (m.direction !== "out") continue;
      const msgVendorId = messageVendorId(m) ?? conversationToVendorId.get(safeString(m?.conversation_id).trim()) ?? null;
      if (!msgVendorId) continue;
      const v = vendedores.find((x) => Number(x.id) === msgVendorId);
      if (!v) continue;
      const row = vRows.get(keyFor(v));
      if (row) row.msgsEnviadas += 1;
    }
    // vendas por UTM
    for (const v of vendasScoped) {
      const utm = normalizeUtm(v.UTM);
      if (!utm) continue;
      const vend = utmToVendedor.get(utm);
      const key = vend ? keyFor(vend) : `utm-only:${utm}`;
      let row = vRows.get(key);
      if (!row) {
        row = {
          vendedorId: vend?.id ?? null,
          utm,
          nome: vend?.nome ?? utm,
          expert: vend?.expert ?? vendaOperacao(v),
          fotoUrl: vend?.foto_url ?? null,
          leadsAtribuidos: 0,
          msgsEnviadas: 0,
          vendas: 0,
          faturamento: 0,
          conversao: 0,
          ticketMedio: 0,
        };
        vRows.set(key, row);
      }
      row.vendas += 1;
      row.faturamento += parseTicket(v.Ticket);
    }
    const porVendedor = Array.from(vRows.values())
      .filter((r) => r.vendas + r.leadsAtribuidos + r.msgsEnviadas > 0)
      .map((r) => ({
        ...r,
        conversao: r.leadsAtribuidos > 0 ? r.vendas / r.leadsAtribuidos : 0,
        ticketMedio: r.vendas > 0 ? r.faturamento / r.vendas : 0,
      }))
      .sort((a, b) => b.faturamento - a.faturamento);

    // Série diária
    const dayMap = new Map<string, X1SerieDia>();
    for (const m of msgsScoped) {
      const t = Date.parse(m.created_at);
      if (!Number.isFinite(t)) continue;
      const iso = toBrIsoDay(t);
      const e = dayMap.get(iso) ?? { data: iso, msgsIn: 0, msgsOut: 0, vendas: 0 };
      if (m.direction === "in") e.msgsIn += 1;
      else if (m.direction === "out") e.msgsOut += 1;
      dayMap.set(iso, e);
    }
    for (const v of vendasScoped) {
      const t = parseDataField(v.Data);
      if (!t) continue;
      const iso = toIsoDay(new Date(t));
      const e = dayMap.get(iso) ?? { data: iso, msgsIn: 0, msgsOut: 0, vendas: 0 };
      e.vendas += 1;
      dayMap.set(iso, e);
    }
    const serieDiaria = Array.from(dayMap.values()).sort((a, b) => a.data.localeCompare(b.data));

    // Série horária (0..23) — usa horário local BR (UTC-3)
    const hourMap = new Map<number, X1SerieHora>();
    for (let h = 0; h < 24; h++) {
      hourMap.set(h, { hora: `${String(h).padStart(2, "0")}h`, msgsIn: 0, msgsOut: 0, vendas: 0 });
    }
    const brHour = (ts: number) => {
      const d = new Date(ts);
      // UTC-3 (Brasil)
      return (d.getUTCHours() - 3 + 24) % 24;
    };
    for (const m of msgsScoped) {
      const t = Date.parse(m.created_at);
      if (!Number.isFinite(t)) continue;
      const h = brHour(t);
      const e = hourMap.get(h)!;
      if (m.direction === "in") e.msgsIn += 1;
      else if (m.direction === "out") e.msgsOut += 1;
    }
    for (const v of vendasScoped) {
      const t = parseDataField(v.Data);
      if (!t) continue;
      const h = brHour(t);
      const e = hourMap.get(h)!;
      e.vendas += 1;
    }
    const serieHoraria = Array.from(hourMap.values());

    const novosLeads = allLeadKeys.size;
    return {
      kpis: {
        novosLeads,
        conversas: conversations.length,
        msgsIn,
        msgsOut,
        vendas: vendasScoped.length,
        faturamento,
        ticketMedio: vendasScoped.length > 0 ? faturamento / vendasScoped.length : 0,
        conversao: novosLeads > 0 ? vendasScoped.length / novosLeads : 0,
        contatosUnicos,
        tempoRespostaMedio,
      },
      porOperacao: opRows,
      porVendedor,
      serieDiaria,
      serieHoraria,
      operacoesDisponiveis: Array.from(operacoesSet).sort(),
      canaisDisponiveis,
    };
  });
