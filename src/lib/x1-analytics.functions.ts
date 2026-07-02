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

export type X1Filter = {
  from?: string | null;
  to?: string | null;
  operacao?: string | null; // "all" | operacao_id
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

export type X1AnalyticsPayload = {
  kpis: {
    novosLeads: number;
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
  operacoesDisponiveis: string[];
};

const EMPTY: X1AnalyticsPayload = {
  kpis: {
    novosLeads: 0,
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
  operacoesDisponiveis: [],
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

async function dbFor(context: any) {
  if (context?.vendor && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
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
    const supabase = await dbFor(context);

    const fromIso = data.from ? new Date(data.from + "T00:00:00Z").toISOString() : null;
    const toIso = data.to ? new Date(data.to + "T23:59:59Z").toISOString() : null;
    const opFilter = data.operacao && data.operacao !== "all" ? String(data.operacao) : null;

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
      .select("id, operacao_id, verified_name, name")
      .neq("operacao_id", "__notificador__");
    const channelToOp = new Map<string, string>();
    const operacoesSet = new Set<string>();
    for (const c of (channels ?? []) as any[]) {
      const op = String(c.operacao_id ?? "").trim();
      if (!op || op === "__notificador__") continue;
      channelToOp.set(String(c.id), op);
      operacoesSet.add(op);
    }

    // Conversas (todas com created_at no período OU last_message_at no período)
    let convQuery = supabase
      .from("wa_conversations")
      .select("id, channel_id, contact_wa_id, operacao_id, created_at, last_message_at, assigned_vendor_id");
    if (fromIso) convQuery = convQuery.gte("last_message_at", fromIso);
    if (toIso) convQuery = convQuery.lte("last_message_at", toIso);
    if (opFilter) convQuery = convQuery.eq("operacao_id", opFilter);
    const conversations = await pageAll<any>((from, to) => convQuery.range(from, to));

    // Novos leads (created_at no período)
    let novoQuery = supabase
      .from("wa_conversations")
      .select("id, operacao_id, created_at, contact_wa_id, channel_id");
    if (fromIso) novoQuery = novoQuery.gte("created_at", fromIso);
    if (toIso) novoQuery = novoQuery.lte("created_at", toIso);
    if (opFilter) novoQuery = novoQuery.eq("operacao_id", opFilter);
    const novosLeadsRows = await pageAll<any>((from, to) => novoQuery.range(from, to));

    // Mensagens do período
    let msgQuery = supabase
      .from("wa_messages")
      .select("id, conversation_id, channel_id, direction, created_at, sent_by")
      .is("deleted_at", null);
    if (fromIso) msgQuery = msgQuery.gte("created_at", fromIso);
    if (toIso) msgQuery = msgQuery.lte("created_at", toIso);
    const messages = await pageAll<any>((from, to) => msgQuery.range(from, to));

    // filtra mensagens pela operação (via canal)
    const msgsScoped = messages.filter((m) => {
      const op = channelToOp.get(String(m.channel_id)) ?? "";
      if (!op) return false;
      if (opFilter && op !== opFilter) return false;
      return true;
    });

    // Vendas & vendedores (para conversão e faturamento por operação)
    const [vendedoresRes, vendasAll] = await Promise.all([
      supabase.from("vendedores").select("id, utm, nome, expert, foto_url, ativo"),
      pageAll<any>((from, to) =>
        supabase
          .from("vendas")
          .select('"Ticket","Data","UTM","Evento"')
          .or('Evento.eq.purchase_approved,Evento.ilike.*aprov*')
          .range(from, to),
      ),
    ]);
    const vendedores = (vendedoresRes.data ?? []) as any[];
    const utmToVendedor = new Map<string, any>();
    for (const v of vendedores) if (v.utm) utmToVendedor.set(String(v.utm).toUpperCase(), v);

    const inDay = (t: number | null) => {
      if (!t) return false;
      if (fromIso && t < Date.parse(fromIso)) return false;
      if (toIso && t > Date.parse(toIso)) return false;
      return true;
    };
    const vendasPeriodo = vendasAll.filter((v) => inDay(parseDataField(v.Data)));
    const vendasScoped = vendasPeriodo.filter((v) => {
      const op = operacaoFromUtm(v.UTM);
      if (opFilter) return op === opFilter;
      return true;
    });

    // KPIs
    const msgsIn = msgsScoped.filter((m) => m.direction === "in").length;
    const msgsOut = msgsScoped.filter((m) => m.direction === "out").length;
    const faturamento = vendasScoped.reduce((a, v) => a + parseTicket(v.Ticket), 0);
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
      const convOp = conversations.filter((c) => (c.operacao_id ?? "") === op);
      const novosOp = novosLeadsRows.filter((c) => (c.operacao_id ?? "") === op);
      const msgOp = msgsScoped.filter((m) => channelToOp.get(String(m.channel_id)) === op);
      const inC = msgOp.filter((m) => m.direction === "in").length;
      const outC = msgOp.filter((m) => m.direction === "out").length;
      const vdsOp = vendasPeriodo.filter((v) => operacaoFromUtm(v.UTM) === op);
      const fatOp = vdsOp.reduce((a, v) => a + parseTicket(v.Ticket), 0);
      const leadsCount = novosOp.length;
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
    const keyFor = (v: any) => `id:${v?.id ?? "?"}|utm:${v?.utm ?? "?"}`;
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
    // leads atribuídos (conversas com assigned_vendor_id)
    for (const c of conversations) {
      const vid = c.assigned_vendor_id;
      if (!vid) continue;
      const v = vendedores.find((x) => Number(x.id) === Number(vid));
      if (!v) continue;
      const row = vRows.get(keyFor(v));
      if (row) row.leadsAtribuidos += 1;
    }
    // msgs enviadas por vendedor
    for (const m of msgsScoped) {
      if (m.direction !== "out" || !m.sent_by) continue;
      const v = vendedores.find((x) => String(x.id) === String(m.sent_by));
      if (!v) continue;
      const row = vRows.get(keyFor(v));
      if (row) row.msgsEnviadas += 1;
    }
    // vendas por UTM
    for (const v of vendasScoped) {
      const utm = String(v.UTM ?? "").toUpperCase();
      if (!utm) continue;
      const vend = utmToVendedor.get(utm);
      const key = vend ? keyFor(vend) : `utm-only:${utm}`;
      let row = vRows.get(key);
      if (!row) {
        row = {
          vendedorId: vend?.id ?? null,
          utm,
          nome: vend?.nome ?? utm,
          expert: vend?.expert ?? operacaoFromUtm(utm),
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
      const iso = toIsoDay(new Date(t));
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

    const novosLeads = novosLeadsRows.length;
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
      operacoesDisponiveis: Array.from(operacoesSet).sort(),
    };
  });
