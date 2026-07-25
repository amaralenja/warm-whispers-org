import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const QUIZ_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";
const quizSb = createClient(QUIZ_URL, QUIZ_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

/** Converte qualquer ISO/Timestamp ou string de data para YYYY-MM-DD no fuso de São Paulo (America/Sao_Paulo) */
function toSpDateString(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();

  // Plain date "YYYY-MM-DD" — not a timestamp, return as-is (no timezone shift)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Full ISO timestamp — convert to SP local date
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }

  // Brazilian format "DD/MM/YYYY" or "DD-MM-YYYY"
  const m2 = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;

  return null;
}

/**
 * Converte campo de data (string ou número) para timestamp UTC em ms.
 * Datas simples "YYYY-MM-DD" são tratadas como meia-noite em São Paulo.
 * Retorna null se inválido.
 */
function parseDataField(raw: unknown): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Plain date "YYYY-MM-DD" — treat as SP midnight (UTC-3 = +3h offset)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    // SP midnight = UTC 03:00 of same day
    return Date.UTC(y, m - 1, d, 3, 0, 0);
  }

  // Full ISO or any other string
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();

  // Brazilian format "DD/MM/YYYY"
  const m2 = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m2) return Date.UTC(+m2[3], +m2[2] - 1, +m2[1], 3, 0, 0);

  return null;
}


function inRangeSp(raw: unknown, fromStr?: string | null, toStr?: string | null): boolean {
  if (!fromStr && !toStr) return true;
  const isoSp = toSpDateString(raw);
  if (!isoSp) return false;
  if (fromStr && isoSp < fromStr) return false;
  if (toStr && isoSp > toStr) return false;
  return true;
}

export type ExpertStats = {
  id: number;
  nome: string;
  foto_url: string | null;
  ativo: boolean;
  vendedoresCount: number;
  faturamento: number;
  vendas: number;
  ticketMedio: number;
  reembolsos: number;
  pctTotal: number; // 0..1 do faturamento total
};

export type VendedorStat = {
  utm: string;
  nome: string;
  expert: string | null;
  fotoUrl: string | null;
  faturamento: number;
  vendas: number;
  pctTotal: number;
};

export type SerieDiaria = { data: string; total: number; vendas: number };

export type ReembolsoItem = {
  idVenda: string;
  produto: string | null;
  cliente: string | null;
  valor: number;
  dataVenda: string | null;
  dataReembolso: string | null;
  expert: string | null;
};

export type OperacoesPayload = {
  experts: ExpertStats[];
  totalFaturamento: number;
  totalVendas: number;
  totalReembolsos: number;
  totalValorReembolsado: number;
  ticketMedioGeral: number;
  gastosMes: number;
  saldoEstimado: number;
  vendedores: VendedorStat[];
  serieDiaria: SerieDiaria[];
  reembolsos: ReembolsoItem[];
  caioFontes?: { fonte: string; faturamento: number; vendas: number }[];
  htFontes?: { fonte: string; faturamento: number; vendas: number }[];
};

export type DateRange = { from?: string | null; to?: string | null; expert?: string | null; includeHighTicket?: boolean };

const CAIO_UTMS = ["GC", "BP"];
const GUSTAVO_UTMS = ["LS", "LF"];

async function dbFor(context: any) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (supabaseAdmin) return supabaseAdmin as any;
  } catch (err) {
    console.warn("[operacoes] supabaseAdmin indisponível — usando client autenticado", err);
  }
  return context?.supabase as any;
}

function vendorWorkspaceIds(context: any): string[] | null {
  if (!context?.vendor) return null;
  const ids = context.vendor.workspace_ids;
  const expert = context.vendor.expert ? [String(context.vendor.expert)] : [];
  if (Array.isArray(ids)) {
    const list = ids.map(String).filter(Boolean);
    return list.length > 0 ? list : expert;
  }
  return expert;
}

// Coerce defensivo: alguns campos podem vir como objeto/jsonb vazio do Postgres
const asStr = (x: unknown): string => {
  if (x == null) return "";
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  return "";
};
const asStrOrNull = (x: unknown): string | null => {
  const s = asStr(x);
  return s ? s : null;
};

const EMPTY_OPERACOES: OperacoesPayload = {
  experts: [],
  totalFaturamento: 0,
  totalVendas: 0,
  totalReembolsos: 0,
  totalValorReembolsado: 0,
  ticketMedioGeral: 0,
  gastosMes: 0,
  saldoEstimado: 0,
  vendedores: [],
  serieDiaria: [],
  reembolsos: [],
};

function classifyOpByUtm(raw: unknown): string | null {
  const utm = String(raw ?? "").trim().toUpperCase();
  if (!utm) return null;
  if (CAIO_UTMS.some((prefix) => utm.startsWith(prefix))) return "Caio";
  if (GUSTAVO_UTMS.some((prefix) => utm.startsWith(prefix))) return "Gustavo";
  return null;
}

export const getOperacoesStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DateRange | undefined) => input ?? {})
  .handler(async (opts): Promise<OperacoesPayload> => {
    const context = opts?.context;
    const data = opts?.data ?? {};
    if (!context?.supabase) throw new Error("Sessão Supabase indisponível");
    const supabase = await dbFor(context);
    let expertFilter = data.expert && data.expert !== "all" ? data.expert : null;
    const allowedWorkspaces = vendorWorkspaceIds(context);
    if (allowedWorkspaces) {
      if (allowedWorkspaces.length === 0) return EMPTY_OPERACOES;
      if (expertFilter && !allowedWorkspaces.includes(expertFilter)) return EMPTY_OPERACOES;
      expertFilter = expertFilter ?? allowedWorkspaces[0];
    }
    const fromTs = data.from ? Date.UTC(+data.from.slice(0, 4), +data.from.slice(5, 7) - 1, +data.from.slice(8, 10)) : null;
    const toTs = data.to ? Date.UTC(+data.to.slice(0, 4), +data.to.slice(5, 7) - 1, +data.to.slice(8, 10)) : null;

    async function fetchAll<T = any>(
      build: (from: number, to: number) => any,
    ): Promise<T[]> {
      const PAGE = 1000;
      const out: T[] = [];
      for (let i = 0; ; i++) {
        const { data, error } = await build(i * PAGE, i * PAGE + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < PAGE) break;
      }
      return out;
    }

    const [expertsRes, vendedoresRes, produtosMapRes, vendasRes, reembolsosRes, financeiroRes, htVendasRes] = await Promise.all([
      supabase.from("experts").select("id, nome, foto_url, ativo").eq("ativo", true),
      supabase.from("vendedores").select("utm, nome, expert, foto_url, ativo"),
      supabase.from("produtos_map").select("nome_produto, nome_expert, tipo_produto"),
      supabase
        .from("vendas")
        .select('"Ticket", nome_expert, tipo_produto, "Data", "ID de Referência", "UTM", "Produto", "Evento", "Email", "Telefone"')
        .or('Evento.eq.purchase_approved,Evento.ilike.*aprov*')
        .order('"Data"', { ascending: false })
        .limit(3000),
      supabase
        .from("reembolsos")
        .select('"ID da Venda", "Data do Reembolso", "Data da Venda", "Produto", "Nome do Cliente", "Valor Base do Produto", "Tipo da Venda", utm_source')
        .order('"Data do Reembolso"', { ascending: false })
        .limit(1000),
      supabase
        .from("financeiro")
        .select("valor, tipo, data_ref")
        .order("data_ref", { ascending: false })
        .limit(1000),
      data.includeHighTicket
        ? supabase.from("ht_vendas").select("valor_total, data, status, lead_id, cliente").neq("status", "reembolso").order("data", { ascending: false }).limit(1000)
        : Promise.resolve({ data: [] }),
    ]);

    const vendasAll = (vendasRes.data ?? []) as any[];
    const reembolsosAll = (reembolsosRes.data ?? []) as any[];
    const financeiroAll = (financeiroRes.data ?? []) as any[];
    const htVendasAll = (htVendasRes.data ?? []) as any[];

    // Coerce defensivo: alguns campos podem vir como objeto/jsonb vazio do Postgres
    const asStr = (x: unknown): string => {
      if (x == null) return "";
      if (typeof x === "string") return x;
      if (typeof x === "number" || typeof x === "boolean") return String(x);
      return ""; // objetos/arrays viram string vazia
    };
    const asStrOrNull = (x: unknown): string | null => {
      const s = asStr(x);
      return s ? s : null;
    };

    // Mapa produto -> { expert, tipo } — vendas com produto NÃO mapeado são descartadas (igual ao dashboard antigo)
    const produtoMap = new Map<string, { expert: string; tipo: string }>();
    for (const p of (produtosMapRes.data ?? []) as any[]) {
      const key = asStr(p.nome_produto).trim().toLowerCase();
      const expertName = asStr(p.nome_expert).trim();
      if (key && expertName) produtoMap.set(key, { expert: expertName, tipo: asStr(p.tipo_produto || "main").toLowerCase() });
    }
    const lookupProduto = (v: any) => produtoMap.get(asStr(v.Produto).trim().toLowerCase()) ?? null;


    const experts = expertsRes.data ?? [];
    const vendedoresRaw = vendedoresRes.data ?? [];

    const inRange = (t: number | null) => {
      if (fromTs == null && toTs == null) return true;
      if (t == null) return false;
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t > toTs) return false;
      return true;
    };

    // Filtra vendas aprovadas pelo período + EXIGE produto mapeado (=dashboard antigo)
    // Atribui expert via produtos_map (sobrescreve nome_expert)
    const vendasPeriodo = vendasAll
      .filter((v: any) => inRange(parseDataField(v.Data)))
      .map((v: any) => {
        const mapped = lookupProduto(v);
        if (!mapped) return null;
        return { ...v, _expert: mapped.expert, _tipo: mapped.tipo };
      })
      .filter((v: any): v is any => v !== null);

    const vendasScoped = expertFilter
      ? vendasPeriodo.filter((v: any) => v._expert === expertFilter)
      : vendasPeriodo;

    // Map ID da venda -> expert: usa produtos_map (consistente com vendas filtradas)
    const vendaToExpert = new Map<string, string>();
    for (const v of vendasAll as any[]) {
      const mapped = lookupProduto(v);
      const expertName = mapped?.expert ?? v.nome_expert;
      if (v["ID de Referência"] && expertName) {
        vendaToExpert.set(String(v["ID de Referência"]), expertName);
      }
    }

    const getRefundExpert = (r: any) =>
      classifyOpByUtm(r.utm_source) ??
      classifyOpByUtm(r["UTM Source"]) ??
      classifyOpByUtm(r.UTM) ??
      lookupProduto(r)?.expert ??
      vendaToExpert.get(String(r["ID da Venda"] ?? "")) ??
      null;

    const reembolsos = reembolsosAll.filter((r: any) => {
      if (!inRange(parseDataField(r["Data do Reembolso"]))) return false;
      if (!expertFilter) return true;
      return getRefundExpert(r) === expertFilter;
    });

    const getGastosScoped = (financeiroItems: any[]): number => {
      const direct = financeiroItems.filter((f: any) => {
        const tipo = String(f.tipo ?? "").toLowerCase();
        const isGasto = tipo === "gasto" || tipo === "saida" || tipo === "despesa";
        return isGasto && inRange(parseDataField(f.data_ref));
      });
      const directKeys = new Set(direct.map((f: any) => `${f.categoria}|${String(f.descricao || "").toLowerCase().trim()}`));

      let sum = direct.reduce((acc, f: any) => acc + Number(f.valor ?? 0), 0);

      const handledRecurring = new Set<string>();
      for (const f of financeiroItems) {
        const tipo = String(f.tipo ?? "").toLowerCase();
        const isGasto = tipo === "gasto" || tipo === "saida" || tipo === "despesa";
        if (!isGasto || !f.recorrente) continue;
        const refDate = parseDataField(f.data_ref);
        if (refDate && toTs != null && refDate > toTs) continue;
        const key = `${f.categoria}|${String(f.descricao || "").toLowerCase().trim()}`;
        if (!directKeys.has(key) && !handledRecurring.has(key)) {
          if (refDate && fromTs != null && refDate < fromTs) {
            handledRecurring.add(key);
            sum += Number(f.valor ?? 0);
          }
        }
      }
      return sum;
    };

    const gastosMes = getGastosScoped(financeiroAll);

    let totalFaturamento = vendasScoped.reduce((acc, v: any) => acc + parseTicket(v.Ticket), 0);
    let totalVendas = vendasScoped.length;

    const htVendasPeriodo = data.includeHighTicket
      ? (htVendasAll as any[]).filter((v: any) => inRange(parseDataField(v.data)))
      : [];
    const fatHt = htVendasPeriodo.reduce((acc, v) => acc + (parseFloat(v.valor_total) || 0), 0);
    const vendasHt = htVendasPeriodo.length;


    // Stats por expert (sempre considera todas as vendas do período, sem o filtro de expert)
    const TICKET_MIN = 97; // mesmo threshold do dashboard antigo — exclui order bumps
    const expertStats: ExpertStats[] = experts.map((e: any) => {
      const vds = vendasPeriodo.filter((v: any) => v._expert === e.nome);
      const faturamento = vds.reduce((acc, v: any) => acc + parseTicket(v.Ticket), 0);
      const vendasCount = vds.length;
      // Ticket Médio: só vendas com ticket >= 97 (igual ao antigo)
      const vdsTm = vds.filter((v: any) => parseTicket(v.Ticket) >= TICKET_MIN);
      const fatTm = vdsTm.reduce((a, v: any) => a + parseTicket(v.Ticket), 0);
      const vendedoresCount = vendedoresRaw.filter((vd: any) => vd.expert === e.nome && vd.ativo).length;
      const reembolsosCount = reembolsosAll.filter((r: any) => {
        if (!inRange(parseDataField(r["Data do Reembolso"]))) return false;
        return getRefundExpert(r) === e.nome;
      }).length;
      let totalFatPeriodo = vendasPeriodo.reduce((a, v: any) => a + parseTicket(v.Ticket), 0);
      if (data.includeHighTicket) {
        totalFatPeriodo += fatHt;
      }
      return {
        id: e.id,
        nome: e.nome,
        foto_url: e.foto_url || null,
        ativo: e.ativo,
        vendedoresCount,
        faturamento,
        vendas: vendasCount,
        ticketMedio: vdsTm.length ? fatTm / vdsTm.length : 0,
        reembolsos: reembolsosCount,
        pctTotal: totalFatPeriodo > 0 ? faturamento / totalFatPeriodo : 0,
      };
    });

    if (data.includeHighTicket) {
      if (expertFilter == null || expertFilter === "High Ticket") {
        totalFaturamento += fatHt;
        totalVendas += vendasHt;
      }
      const totalFatPeriodo = vendasPeriodo.reduce((a, v: any) => a + parseTicket(v.Ticket), 0) + fatHt;
      expertStats.push({
        id: -1,
        nome: "High Ticket",
        foto_url: null,
        ativo: true,
        vendedoresCount: 0,
        faturamento: fatHt,
        vendas: vendasHt,
        ticketMedio: vendasHt > 0 ? fatHt / vendasHt : 0,
        reembolsos: 0,
        pctTotal: totalFatPeriodo > 0 ? fatHt / totalFatPeriodo : 0,
      });
      expertStats.forEach((e) => {
        e.pctTotal = totalFatPeriodo > 0 ? e.faturamento / totalFatPeriodo : 0;
      });
    }

    // Participação por vendedor (UTM)
    const vendedorMap = new Map<string, VendedorStat>();
    for (const vd of vendedoresRaw as any[]) {
      if (!vd.utm) continue;
      vendedorMap.set(String(vd.utm).toUpperCase(), {
        utm: String(vd.utm).toUpperCase(),
        nome: vd.nome ?? vd.utm,
        expert: vd.expert ?? null,
        fotoUrl: vd.foto_url || null,
        faturamento: 0,
        vendas: 0,
        pctTotal: 0,
      });
    }
    for (const v of vendasScoped as any[]) {
      const rawUtm = v.UTM ? String(v.UTM).toUpperCase() : "";
      if (!rawUtm) continue;
      let entry = vendedorMap.get(rawUtm);
      if (!entry) {
        entry = { utm: rawUtm, nome: rawUtm, expert: null, fotoUrl: null, faturamento: 0, vendas: 0, pctTotal: 0 };
        vendedorMap.set(rawUtm, entry);
      }
      entry.faturamento += parseTicket(v.Ticket);
      entry.vendas += 1;
    }
    const vendedores = Array.from(vendedorMap.values())
      .filter((v) => v.vendas > 0)
      .map((v) => ({ ...v, pctTotal: totalFaturamento > 0 ? v.faturamento / totalFaturamento : 0 }))
      .sort((a, b) => b.faturamento - a.faturamento);

    // Série diária — agrupa por dia ISO
    const serieMap = new Map<string, { total: number; vendas: number }>();
    for (const v of vendasScoped as any[]) {
      const t = parseDataField(v.Data);
      if (t == null) continue;
      const d = new Date(t);
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const entry = serieMap.get(iso) ?? { total: 0, vendas: 0 };
      entry.total += parseTicket(v.Ticket);
      entry.vendas += 1;
      serieMap.set(iso, entry);
    }
    if (data.includeHighTicket && (expertFilter == null || expertFilter === "High Ticket")) {
      for (const v of htVendasPeriodo) {
        const t = parseDataField(v.data);
        if (t == null) continue;
        const d = new Date(t);
        const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        const entry = serieMap.get(iso) ?? { total: 0, vendas: 0 };
        entry.total += (parseFloat(v.valor_total) || 0);
        entry.vendas += 1;
        serieMap.set(iso, entry);
      }
    }
    // Preenche dias vazios entre from e to (ou min/max)
    let startTs = fromTs;
    let endTs = toTs;
    if (startTs == null || endTs == null) {
      const allTs = Array.from(serieMap.keys()).map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
      if (allTs.length) {
        startTs = startTs ?? Math.min(...allTs);
        endTs = endTs ?? Math.max(...allTs);
      }
    }
    const serieDiaria: SerieDiaria[] = [];
    if (startTs != null && endTs != null) {
      const DAY = 86400_000;
      for (let t = startTs; t <= endTs; t += DAY) {
        const d = new Date(t);
        const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        const entry = serieMap.get(iso) ?? { total: 0, vendas: 0 };
        serieDiaria.push({ data: iso, total: entry.total, vendas: entry.vendas });
      }
    }

    const totalReembolsos = reembolsos.length;
    // Ticket Médio Geral: aplica mesmo threshold de R$97 do dashboard antigo
    const vendasTm = vendasScoped.filter((v: any) => parseTicket(v.Ticket) >= TICKET_MIN);
    const fatTm = vendasTm.reduce((a, v: any) => a + parseTicket(v.Ticket), 0);
    const ticketMedioGeral = vendasTm.length ? fatTm / vendasTm.length : 0;
    const saldoEstimado = totalFaturamento - gastosMes;

    const reembolsosList: ReembolsoItem[] = (reembolsos as any[]).map((r) => ({
      idVenda: asStr(r["ID da Venda"]),
      produto: asStrOrNull(r["Produto"]),
      cliente: asStrOrNull(r["Nome do Cliente"]),
      valor: parseTicket(r["Valor Base do Produto"]),
      dataVenda: asStrOrNull(r["Data da Venda"]),
      dataReembolso: asStrOrNull(r["Data do Reembolso"]),
      expert: asStrOrNull(getRefundExpert(r)),
    })).sort((a, b) => (b.dataReembolso ?? "").localeCompare(a.dataReembolso ?? ""));

    const totalValorReembolsado = reembolsosList.reduce((a, r) => a + r.valor, 0);

    // Origens de tráfego do Caio
    let caioFontes: { fonte: string; faturamento: number; vendas: number }[] = [];
    if (vendasPeriodo.some((v: any) => v._expert === "Caio")) {
      const caioVds = vendasPeriodo.filter((v: any) => v._expert === "Caio");
      let quizLeads: any[] = [];
      try {
        const { data: qSubData } = await supabase
          .from("ht_quiz_submissions" as any)
          .select("id, email, whatsapp, utm_source, utm_medium, utm_campaign, utm_content, fbclid, fbp, gclid, received_at")
          .order("updated_at", { ascending: false })
          .limit(3000);
        if (qSubData) quizLeads.push(...qSubData);

        const { data: crmLeadsData } = await supabase
          .from("crm_leads" as any)
          .select("id, email, whatsapp, utm_source, utm_medium, utm_campaign, utm_content, fbclid, fbp, gclid, created_at")
          .order("created_at", { ascending: false })
          .limit(3000);
        if (crmLeadsData) quizLeads.push(...crmLeadsData);
      } catch (err) {
        console.warn("Falha ao buscar leads para fontes do Caio", err);
      }

      const cleanPhone = (s: string) => String(s ?? "").replace(/\D+/g, "");

      const phonesMatch = (phone1: string, phone2: string): boolean => {
        const d1 = cleanPhone(phone1);
        const d2 = cleanPhone(phone2);
        if (!d1 || !d2) return false;
        if (d1 === d2) return true;
        if (d1.length >= 8 && d2.length >= 8) {
          const tail1 = d1.slice(-8);
          const tail2 = d2.slice(-8);
          if (tail1 === tail2) {
            const ddd1 = d1.length > 8 ? (d1.startsWith("55") ? d1.slice(2, 4) : d1.slice(0, 2)) : "";
            const ddd2 = d2.length > 8 ? (d2.startsWith("55") ? d2.slice(2, 4) : d2.slice(0, 2)) : "";
            if (!ddd1 || !ddd2 || ddd1 === ddd2) return true;
          }
        }
        return false;
      };

      const fontesMap = new Map<string, { faturamento: number; vendas: number }>();
      const initFonte = (name: string) => {
        if (!fontesMap.has(name)) fontesMap.set(name, { faturamento: 0, vendas: 0 });
      };
      
      initFonte("Tráfego Pago");
      initFonte("Criar SaaS");
      initFonte("Google Ads");
      initFonte("Prospecção SDR");
      initFonte("Orgânico (Typebot)");
      initFonte("Orgânico Direto");

      for (const v of caioVds) {
        const vEmail = String(v.Email ?? "").trim().toLowerCase();
        const vTel = cleanPhone(v.Telefone ?? "");
        const vUtm = String(v.UTM ?? "").trim().toLowerCase();
        const value = parseTicket(v.Ticket);

        const lead = quizLeads.find((l: any) => {
          if (vEmail && l.email && String(l.email).trim().toLowerCase() === vEmail) return true;
          if (vTel && l.whatsapp && phonesMatch(vTel, l.whatsapp)) return true;
          return false;
        });

        let fonte = "Orgânico Direto";

        if (lead) {
          const norm = (s: any) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const src = norm(lead.utm_source || lead.origem);
          const med = norm(lead.utm_medium);
          const rawCp = String(lead.utm_campaign || "").trim();
          const cp = norm(rawCp);
          const cont = norm(lead.utm_content);
          const fbclid = String(lead.fbclid || "").trim();
          const fbp = String(lead.fbp || "").trim();
          const gclid = String(lead.gclid || "").trim();
          const origem = norm(lead.origem);

          const isCampEmpty = !rawCp || rawCp === "—" || rawCp === "-" || cp === "none" || cp === "null" || cp === "undefined";
          const cleanCp = isCampEmpty ? "" : cp;

          const organicPattern = /organic|organico|direto|direct|link_?in_?bio|link_?bio|ig_?bio|bio_?instagram|instagram_?bio|\bbio\b|whatsapp|referral|email|sms|none/i;
          const isOrganicWord = organicPattern.test(src) || organicPattern.test(med) || (!!cleanCp && organicPattern.test(cleanCp)) || organicPattern.test(cont) || organicPattern.test(origem);

          const hasClickId = !!fbclid || !!gclid || !!fbp;
          const isPaidMedium = /^(cpc|cpm|ppc|paid|ads|ad|anuncio|patrocinado)$/i.test(med) || med.includes("cpc") || med.includes("cpm") || med.includes("paid");
          const isPaidSource = /\b(facebook_ads|meta_ads|gads|patrocinado)\b/i.test(src) || /(-ads|_ads|ads-|patrocinado)/i.test(src);
          const hasRealCampaign = !!cleanCp && !organicPattern.test(cleanCp);

          const isPaid = (hasClickId || isPaidMedium || isPaidSource || hasRealCampaign) && !isOrganicWord;

          if (src === "criar_saas" || src === "criar_saas_hub") {
            fonte = "Criar SaaS";
          } else if (isPaid) {
            fonte = "Tráfego Pago";
          } else if (src.includes("google_ads") || src.includes("gads") || !!gclid) {
            fonte = "Google Ads";
          } else if (src === "sdr-manual" || med === "sdr-manual") {
            fonte = "Prospecção SDR";
          } else {
            fonte = "Orgânico (Typebot)";
          }
        } else if (vUtm) {
          if (vUtm.includes("criar_saas")) {
            fonte = "Criar SaaS";
          } else if (
            vUtm.includes("link_in_bio") || vUtm.includes("linkinbio") || vUtm.includes("bio") || vUtm.includes("organico") || vUtm.includes("direto")
          ) {
            fonte = "Orgânico Direto";
          } else if (
            vUtm.includes("cpc") || vUtm.includes("cpm") || vUtm.includes("paid") || vUtm.includes("patrocinado") || vUtm.includes("facebook_ads") || vUtm.includes("meta_ads")
          ) {
            fonte = "Tráfego Pago";
          } else if (vUtm.includes("google") || vUtm.includes("gclid")) {
            fonte = "Google Ads";
          } else if (vUtm.includes("sdr")) {
            fonte = "Prospecção SDR";
          }
        }

        const entry = fontesMap.get(fonte) ?? { faturamento: 0, vendas: 0 };
        entry.faturamento += value;
        entry.vendas += 1;
        fontesMap.set(fonte, entry);
      }

      caioFontes = Array.from(fontesMap.entries())
        .map(([fonte, stats]) => ({ fonte, ...stats }))
        .filter((f) => f.vendas > 0)
        .sort((a, b) => b.faturamento - a.faturamento);
    }

    // Origens de tráfego do High Ticket
    let htFontes: { fonte: string; faturamento: number; vendas: number }[] = [];
    if (data.includeHighTicket && htVendasPeriodo.length > 0) {
      let quizLeadsHt: any[] = [];
      try {
        const { data: qSubData } = await supabase
          .from("ht_quiz_submissions" as any)
          .select("id, email, whatsapp, utm_source, utm_medium, utm_campaign, utm_content, fbclid, fbp, gclid, received_at")
          .order("updated_at", { ascending: false })
          .limit(3000);
        if (qSubData) quizLeadsHt.push(...qSubData);

        const { data: crmLeadsData } = await supabase
          .from("crm_leads" as any)
          .select("id, email, telefone, expert, fonte, responsavel_utm, created_at, updated_at, dados")
          .order("created_at", { ascending: false })
          .limit(3000);
        if (crmLeadsData) quizLeadsHt.push(...crmLeadsData);
      } catch (err) {
        console.warn("Falha ao buscar leads para htFontes", err);
      }

      const cleanPhone = (s: string) => String(s ?? "").replace(/\D+/g, "");

      const phonesMatch = (phone1: string, phone2: string): boolean => {
        const d1 = cleanPhone(phone1);
        const d2 = cleanPhone(phone2);
        if (!d1 || !d2) return false;
        if (d1 === d2) return true;
        if (d1.length >= 8 && d2.length >= 8) {
          const tail1 = d1.slice(-8);
          const tail2 = d2.slice(-8);
          if (tail1 === tail2) {
            const ddd1 = d1.length > 8 ? (d1.startsWith("55") ? d1.slice(2, 4) : d1.slice(0, 2)) : "";
            const ddd2 = d2.length > 8 ? (d2.startsWith("55") ? d2.slice(2, 4) : d2.slice(0, 2)) : "";
            if (!ddd1 || !ddd2 || ddd1 === ddd2) return true;
          }
        }
        return false;
      };

      const htFontesMap = new Map<string, { faturamento: number; vendas: number }>();
      const initF = (name: string) => { if (!htFontesMap.has(name)) htFontesMap.set(name, { faturamento: 0, vendas: 0 }); };
      initF("Tráfego Pago"); initF("Orgânico (Typebot)"); initF("SDR Manual"); initF("Direto");

      for (const v of htVendasPeriodo) {
        const value = parseFloat(v.valor_total) || 0;
        const vEmail = String(v.cliente ?? "").trim().toLowerCase();
        const vTel = cleanPhone(v.telefone || v.whatsapp || "");
        const lead = quizLeadsHt.find((l: any) => {
          if (String(v.lead_id) === String(l.id)) return true;
          if (vEmail && l.email && String(l.email).trim().toLowerCase() === vEmail) return true;
          if (vTel && l.whatsapp && phonesMatch(vTel, l.whatsapp)) return true;
          return false;
        });

        let fonte = "Direto";
        if (lead) {
          const norm = (s: any) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const src = norm(lead.utm_source || lead.origem);
          const med = norm(lead.utm_medium);
          const rawCp = String(lead.utm_campaign || "").trim();
          const cp = norm(rawCp);
          const cont = norm(lead.utm_content);
          const fbclid = String(lead.fbclid || "").trim();
          const fbp = String(lead.fbp || "").trim();
          const gclid = String(lead.gclid || "").trim();
          const origem = norm(lead.origem);

          const isCampEmpty = !rawCp || rawCp === "—" || rawCp === "-" || cp === "none" || cp === "null" || cp === "undefined";
          const cleanCp = isCampEmpty ? "" : cp;

          const organicPattern = /organic|organico|direto|direct|link_?in_?bio|link_?bio|ig_?bio|bio_?instagram|instagram_?bio|\bbio\b|whatsapp|referral|email|sms|none/i;
          const isOrganicWord = organicPattern.test(src) || organicPattern.test(med) || (!!cleanCp && organicPattern.test(cleanCp)) || organicPattern.test(cont) || organicPattern.test(origem);

          const hasClickId = !!fbclid || !!gclid || !!fbp;
          const isPaidMedium = /^(cpc|cpm|ppc|paid|ads|ad|anuncio|patrocinado)$/i.test(med) || med.includes("cpc") || med.includes("cpm") || med.includes("paid");
          const isPaidSource = /\b(facebook_ads|meta_ads|gads|patrocinado)\b/i.test(src) || /(-ads|_ads|ads-|patrocinado)/i.test(src);
          const hasRealCampaign = !!cleanCp && !organicPattern.test(cleanCp);

          const isPaid = (hasClickId || isPaidMedium || isPaidSource || hasRealCampaign) && !isOrganicWord;

          if (src === "sdr-manual" || med === "sdr-manual") fonte = "SDR Manual";
          else if (isPaid) fonte = "Tráfego Pago";
          else if (lead.id) fonte = "Orgânico (Typebot)";
        }

        const entry = htFontesMap.get(fonte) ?? { faturamento: 0, vendas: 0 };
        entry.faturamento += value;
        entry.vendas += 1;
        htFontesMap.set(fonte, entry);
      }

      htFontes = Array.from(htFontesMap.entries())
        .map(([fonte, stats]) => ({ fonte, ...stats }))
        .filter((f) => f.vendas > 0)
        .sort((a, b) => b.faturamento - a.faturamento);
    }

    return {
      experts: expertStats,
      totalFaturamento,
      totalVendas,
      totalReembolsos,
      totalValorReembolsado,
      ticketMedioGeral,
      gastosMes,
      saldoEstimado,
      vendedores,
      serieDiaria,
      reembolsos: reembolsosList,
      caioFontes,
      htFontes,
    };
  });

// ─── Dashboard Otimizado ──────────────────────────────────────────────────────
// Busca leads UMA ÚNICA vez e classifica por operação via UTM.
// Pré-agrupa vendas por expert para evitar O(E*V).
// Retorna leads por operação + breakdown de fontes de tráfego por operação.

export type DashboardOpStats = {
  id: number;
  nome: string;
  foto_url: string | null;
  faturamento: number;
  vendas: number;
  ticketMedio: number;
  reembolsos: number;
  leads: number;
  conversao: number;
  vendedoresCount: number;
  pctTotal: number;
  fontes: { fonte: string; vendas: number; faturamento: number }[];
  leadBreakdown: { tipo: string; leads: number; vendas: number; conversao: number }[];
};

export type DashboardPayload = {
  ops: DashboardOpStats[];
  totalFat: number;
  totalVendas: number;
  totalReembolsos: number;
  totalLeads: number;
  ticketMedioGeral: number;
  gastosMes: number;
  saldoEstimado: number;
  vendedores: VendedorStat[];
  serieDiaria: SerieDiaria[];
  reembolsos: ReembolsoItem[];
};

const EMPTY_DASHBOARD: DashboardPayload = {
  ops: [],
  totalFat: 0,
  totalVendas: 0,
  totalReembolsos: 0,
  totalLeads: 0,
  ticketMedioGeral: 0,
  gastosMes: 0,
  saldoEstimado: 0,
  vendedores: [],
  serieDiaria: [],
  reembolsos: [],
};

function classifyLeadOp(lead: any): string | null {
  if (!lead) return null;
  // 1. Expert explícito do lead (Ex: "Caio", "Gustavo", "Jessica", "High Ticket")
  const exp = String(lead.expert ?? "").trim();
  if (exp) {
    const normExp = exp.toLowerCase();
    if (normExp.includes("caio")) return "Caio";
    if (normExp.includes("gustavo") || normExp.includes("gu")) return "Gustavo";
    if (normExp.includes("jessica") || normExp.includes("je")) return "Jessica";
    if (normExp.includes("high") || normExp.includes("ticket") || normExp.includes("ht")) return "High Ticket";
  }

  // 2. Submissão de quiz sem expert -> High Ticket
  if (lead.received_at && !lead.expert) {
    return "High Ticket";
  }

  // 3. Verifica parâmetros de UTM, origem e fonte
  const fields = [
    lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.utm_content, lead.origem, lead.fonte
  ].map((f) => String(f ?? "").trim().toUpperCase());

  for (const src of fields) {
    if (!src) continue;
    if (CAIO_UTMS.some((p) => src.includes(p)) || src.includes("CAIO")) return "Caio";
    if (GUSTAVO_UTMS.some((p) => src.includes(p)) || src.includes("GUSTAVO")) return "Gustavo";
    if (src.includes("GM") || src.includes("JESSICA")) return "Jessica";
    if (src.includes("HT") || src.includes("HIGH")) return "High Ticket";
  }

  return "Caio";
}

export const getDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DateRange | undefined) => input ?? {})
  .handler(async (opts): Promise<DashboardPayload> => {
    const context = opts?.context;
    const data = opts?.data ?? {};
    if (!context?.supabase) throw new Error("Sessão Supabase indisponível");
    const supabase = await dbFor(context);

    let expertFilter = data.expert && data.expert !== "all" ? data.expert : null;
    const allowedWorkspaces = vendorWorkspaceIds(context);
    if (allowedWorkspaces) {
      if (allowedWorkspaces.length === 0) return EMPTY_DASHBOARD;
      if (expertFilter && !allowedWorkspaces.includes(expertFilter)) return EMPTY_DASHBOARD;
      expertFilter = expertFilter ?? allowedWorkspaces[0];
    }

    const inRange = (raw: unknown) => inRangeSp(raw, data.from, data.to);

    const PAGE = 1000;
    async function fetchAll<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
      const out: T[] = [];
      for (let i = 0; ; i++) {
        const { data: rows, error } = await build(i * PAGE, (i + 1) * PAGE - 1);
        if (error) throw error;
        const chunk = (rows ?? []) as T[];
        out.push(...chunk);
        if (chunk.length < PAGE) break;
      }
      return out;
    }

    // ── 1. Busca paralela ultrarrápida: experts, vendedores, produtos, vendas, reembolsos, financeiro, ht_vendas, leads ──
    const [expertsRes, vendedoresRes, produtosMapRes, vendasRes, reembolsosRes, financeiroRes, htVendasRes, quizLeadsRes, crmLeadsRes] = await Promise.all([
      supabase.from("experts").select("id, nome, foto_url, ativo").eq("ativo", true),
      supabase.from("vendedores").select("utm, nome, expert, foto_url, ativo"),
      supabase.from("produtos_map").select("nome_produto, nome_expert, tipo_produto"),
      supabase.from("vendas")
        .select('"Ticket", nome_expert, tipo_produto, "Data", "ID de Referência", "UTM", "Produto", "Evento", "Email", "Telefone"')
        .or('Evento.eq.purchase_approved,Evento.ilike.*aprov*')
        .order('"Data"', { ascending: false })
        .limit(3000),
      supabase.from("reembolsos")
        .select('"ID da Venda", "Data do Reembolso", "Data da Venda", "Produto", "Nome do Cliente", "Valor Base do Produto", "Tipo da Venda", utm_source')
        .order('"Data do Reembolso"', { ascending: false })
        .limit(1000),
      supabase.from("financeiro")
        .select("valor, tipo, data_ref")
        .order("data_ref", { ascending: false })
        .limit(1000),
      data.includeHighTicket
        ? supabase.from("ht_vendas").select("valor_total, data, status, lead_id, cliente").neq("status", "reembolso").order("data", { ascending: false }).limit(1000)
        : Promise.resolve({ data: [] }),
      supabase.from("ht_quiz_submissions" as any)
        .select("id, email, whatsapp, utm_source, utm_medium, utm_campaign, utm_content, fbclid, fbp, gclid, received_at, updated_at")
        .order("received_at", { ascending: false })
        .limit(2000),
      supabase.from("crm_leads" as any)
        .select("id, email, telefone, expert, fonte, responsavel_utm, created_at, updated_at, dados")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    const vendasAll = (vendasRes.data ?? []) as any[];
    const reembolsosAll = (reembolsosRes.data ?? []) as any[];
    const financeiroAll = (financeiroRes.data ?? []) as any[];
    const htVendasAll = (htVendasRes.data ?? []) as any[];
    const quizLeadsRaw = (quizLeadsRes.data ?? []) as any[];
    const crmLeadsRaw = (crmLeadsRes.data ?? []) as any[];

    // ── Log diagnóstico (visível nos logs da Vercel) ──
    const erros = [
      expertsRes.error && `experts: ${expertsRes.error.message}`,
      vendedoresRes.error && `vendedores: ${vendedoresRes.error.message}`,
      produtosMapRes.error && `produtos_map: ${produtosMapRes.error.message}`,
      vendasRes.error && `vendas: ${vendasRes.error.message}`,
      reembolsosRes.error && `reembolsos: ${reembolsosRes.error.message}`,
      crmLeadsRes.error && `crm_leads: ${crmLeadsRes.error.message}`,
    ].filter(Boolean);

    if (erros.length > 0) {
      console.error("[getDashboardStats] ERROS nas queries:", erros.join(" | "));
      throw new Error(`Falha ao carregar dados: ${erros.join(" | ")}`);
    }

    console.log(`[getDashboardStats] OK — vendas:${vendasAll.length} leads:${crmLeadsRaw.length} reembolsos:${reembolsosAll.length} experts:${expertsRes.data?.length}`);


    // ── 2. Maps de lookup (O(1) em vez de O(N)) ──
    const produtoMap = new Map<string, { expert: string; tipo: string }>();
    for (const p of (produtosMapRes.data ?? []) as any[]) {
      const key = asStr(p.nome_produto).trim().toLowerCase();
      if (key) produtoMap.set(key, { expert: asStr(p.nome_expert).trim(), tipo: asStr(p.tipo_produto || "main").toLowerCase() });
    }
    const lookupProduto = (v: any) => produtoMap.get(asStr(v.Produto).trim().toLowerCase()) ?? null;

    const vendedoresRaw = vendedoresRes.data ?? [];

    // Map ID da venda -> expert (para getRefundExpert)
    const vendaToExpert = new Map<string, string>();
    for (const v of vendasAll as any[]) {
      const mapped = lookupProduto(v);
      const expertName = mapped?.expert ?? v.nome_expert;
      if (v["ID de Referência"] && expertName) {
        vendaToExpert.set(String(v["ID de Referência"]), expertName);
      }
    }

    const getRefundExpert = (r: any) =>
      classifyOpByUtm(r.utm_source) ??
      classifyOpByUtm(r["UTM Source"]) ??
      classifyOpByUtm(r.UTM) ??
      lookupProduto(r)?.expert ??
      vendaToExpert.get(String(r["ID da Venda"] ?? "")) ??
      null;

    // ── 3. Filtra e atribui expert via produtos_map ──
    const vendasPeriodo = vendasAll
      .filter((v: any) => inRange(v.Data))
      .map((v: any) => {
        const m = produtoMap.get(asStr(v.Produto).trim().toLowerCase());
        if (!m) return null;
        return { ...v, _expert: m.expert, _tipo: m.tipo };
      })
      .filter((v: any): v is any => v !== null);

    const sameExpert = (a?: string | null, b?: string | null) => {
      if (!a || !b) return false;
      return a.trim().toLowerCase() === b.trim().toLowerCase();
    };

    const vendasScoped = expertFilter ? vendasPeriodo.filter((v: any) => sameExpert(v._expert, expertFilter)) : vendasPeriodo;

    // ── 4. Pré-agrupa vendas por expert (O(V) em vez de O(E*V)) ──
    const vendasByExpert = new Map<string, any[]>();
    for (const v of vendasPeriodo) {
      const list = vendasByExpert.get(v._expert) || [];
      list.push(v);
      vendasByExpert.set(v._expert, list);
    }

    // ── 5. Classifica leads por operação e constrói Maps por email/phone ──
    const cleanPhone = (s: string) => String(s ?? "").replace(/\D+/g, "");
    const leadsByOp = new Map<string, number>();
    const leadBreakdownByOp = new Map<string, Map<string, { leads: number; vendas: number }>>();
    const emailToLead = new Map<string, any>();
    const phoneToLead = new Map<string, any>();

    const norm = (s: any) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const organicPattern = /organic|organico|direto|direct|link_?in_?bio|whatsapp|referral|email|sms|none/i;

    const classifyLeadType = (lead: any): string => {
      const src = norm(lead.utm_source || lead.origem);
      const med = norm(lead.utm_medium);
      const rawCp = String(lead.utm_campaign || "").trim();
      const cp = norm(rawCp);
      const cont = norm(lead.utm_content);
      const fbclid = String(lead.fbclid || "").trim();
      const gclid = String(lead.gclid || "").trim();
      const fbp = String(lead.fbp || "").trim();

      const isCampEmpty = !rawCp || rawCp === "—" || rawCp === "-" || cp === "none" || cp === "null" || cp === "undefined";
      const cleanCp = isCampEmpty ? "" : cp;
      const isOrganicWord = organicPattern.test(src) || organicPattern.test(med) || (!!cleanCp && organicPattern.test(cleanCp)) || organicPattern.test(cont);
      const hasClickId = !!fbclid || !!gclid || !!fbp;
      const isPaidMedium = /^(cpc|cpm|ppc|paid|ads|ad|anuncio|patrocinado)$/i.test(med) || med.includes("cpc") || med.includes("cpm") || med.includes("paid");
      const isPaidSource = /\b(facebook_ads|meta_ads|gads|patrocinado)\b/i.test(src) || /(-ads|_ads|ads-|patrocinado)/i.test(src);
      const hasRealCampaign = !!cleanCp && !organicPattern.test(cleanCp);
      const isPaid = (hasClickId || isPaidMedium || isPaidSource || hasRealCampaign) && !isOrganicWord;

      const isFromTypebot = !!(lead.received_at); // quiz_submissions have received_at

      if (isFromTypebot) {
        return isPaid ? "Typebot (Tráfego Pago)" : "Typebot (Orgânico)";
      }
      return "Orgânico Direto";
    };

    for (const l of quizLeadsRaw) {
      if (!inRange(l.received_at || l.created_at || l.updated_at)) continue;
      const email = String(l.email ?? "").trim().toLowerCase();
      if (email) emailToLead.set(email, l);
      const phone = cleanPhone(l.whatsapp ?? l.telefone ?? "");
      if (phone) phoneToLead.set(phone, l);
      const op = classifyLeadOp(l) || "Caio";
      leadsByOp.set(op, (leadsByOp.get(op) || 0) + 1);
      const leadType = classifyLeadType(l);
      if (!leadBreakdownByOp.has(op)) leadBreakdownByOp.set(op, new Map());
      const typeMap = leadBreakdownByOp.get(op)!;
      const entry = typeMap.get(leadType) || { leads: 0, vendas: 0 };
      entry.leads += 1;
      typeMap.set(leadType, entry);
    }
    for (const l of crmLeadsRaw) {
      if (!inRange(l.created_at || l.updated_at || l.received_at)) continue;
      const email = String(l.email ?? "").trim().toLowerCase();
      if (email && !emailToLead.has(email)) emailToLead.set(email, l);
      const phone = cleanPhone(l.whatsapp ?? l.telefone ?? "");
      if (phone && !phoneToLead.has(phone)) phoneToLead.set(phone, l);
      const op = classifyLeadOp(l) || "Caio";
      leadsByOp.set(op, (leadsByOp.get(op) || 0) + 1);
      const leadType = classifyLeadType(l);
      if (!leadBreakdownByOp.has(op)) leadBreakdownByOp.set(op, new Map());
      const typeMap = leadBreakdownByOp.get(op)!;
      const entry = typeMap.get(leadType) || { leads: 0, vendas: 0 };
      entry.leads += 1;
      typeMap.set(leadType, entry);
    }

    const matchLead = (vEmail: string, vTel: string) => {
      if (vEmail && emailToLead.has(vEmail)) return emailToLead.get(vEmail);
      if (vTel && phoneToLead.has(vTel)) return phoneToLead.get(vTel);
      return null;
    };

    // ── 5b. Complementa leads por operação via match venda→lead (email/phone) ──
    // Leads que não foram classificados por UTM mas têm venda associada são contabilizados aqui
    const countedLeadsByOp = new Map<string, Set<string>>();
    for (const v of vendasPeriodo) {
      const vEmail = String(v.Email ?? "").trim().toLowerCase();
      const vTel = cleanPhone(v.Telefone ?? "");
      const lead = matchLead(vEmail, vTel);
      if (!lead) continue;
      const leadId = String(lead.id ?? lead.email ?? lead.whatsapp ?? "");
      const op = v._expert;
      if (!countedLeadsByOp.has(op)) countedLeadsByOp.set(op, new Set());
      countedLeadsByOp.get(op)!.add(leadId);
    }
    for (const [op, ids] of countedLeadsByOp) {
      const existing = leadsByOp.get(op) || 0;
      if (ids.size > existing) leadsByOp.set(op, ids.size);
    }

    const classifyFonte = (lead: any): string => {
      const src = norm(lead.utm_source || lead.origem);
      const med = norm(lead.utm_medium);
      const rawCp = String(lead.utm_campaign || "").trim();
      const cp = norm(rawCp);
      const cont = norm(lead.utm_content);
      const fbclid = String(lead.fbclid || "").trim();
      const gclid = String(lead.gclid || "").trim();
      const fbp = String(lead.fbp || "").trim();

      const isCampEmpty = !rawCp || rawCp === "—" || rawCp === "-" || cp === "none" || cp === "null" || cp === "undefined";
      const cleanCp = isCampEmpty ? "" : cp;
      const isOrganicWord = organicPattern.test(src) || organicPattern.test(med) || (!!cleanCp && organicPattern.test(cleanCp)) || organicPattern.test(cont);
      const hasClickId = !!fbclid || !!gclid || !!fbp;
      const isPaidMedium = /^(cpc|cpm|ppc|paid|ads|ad|anuncio|patrocinado)$/i.test(med) || med.includes("cpc") || med.includes("cpm") || med.includes("paid");
      const isPaidSource = /\b(facebook_ads|meta_ads|gads|patrocinado)\b/i.test(src) || /(-ads|_ads|ads-|patrocinado)/i.test(src);
      const hasRealCampaign = !!cleanCp && !organicPattern.test(cleanCp);
      const isPaid = (hasClickId || isPaidMedium || isPaidSource || hasRealCampaign) && !isOrganicWord;

      if (src === "criar_saas" || src === "criar_saas_hub") return "Criar SaaS";
      if (isPaid) return "Tráfego Pago";
      if (src.includes("google_ads") || src.includes("gads") || !!gclid) return "Google Ads";
      if (src === "sdr-manual" || med === "sdr-manual") return "Prospecção SDR";
      if (organicPattern.test(src) || organicPattern.test(med) || organicPattern.test(cont) || organicPattern.test(norm(lead.origem))) return "Orgânico";
      return "Orgânico";
    };

    // ── 6. Fontes de tráfego por operação ──
    const fontesByOp = new Map<string, Map<string, { vendas: number; faturamento: number }>>();
    for (const [opName] of vendasByExpert) {
      fontesByOp.set(opName, new Map());
    }

    for (const v of vendasPeriodo) {
      const vEmail = String(v.Email ?? "").trim().toLowerCase();
      const vTel = cleanPhone(v.Telefone ?? "");
      const value = parseTicket(v.Ticket);
      const lead = matchLead(vEmail, vTel);

      let fonte = "Orgânico";
      if (lead) {
        fonte = classifyFonte(lead);
      } else {
        const vUtm = String(v.UTM ?? "").trim().toLowerCase();
        if (vUtm.includes("criar_saas")) fonte = "Criar SaaS";
        else if (vUtm.includes("cpc") || vUtm.includes("cpm") || vUtm.includes("paid") || vUtm.includes("patrocinado")) fonte = "Tráfego Pago";
        else if (vUtm.includes("google") || vUtm.includes("gclid")) fonte = "Google Ads";
        else if (vUtm.includes("sdr")) fonte = "Prospecção SDR";
      }

      const opFontes = fontesByOp.get(v._expert);
      if (opFontes) {
        const entry = opFontes.get(fonte) || { vendas: 0, faturamento: 0 };
        entry.vendas += 1;
        entry.faturamento += value;
        opFontes.set(fonte, entry);
      }
    }

    // ── 7. Stats por expert (O(V) total usando pré-agrupamento) ──
    const experts = expertsRes.data ?? [];
    const allExpertNames = new Set<string>(["Gustavo", "Caio", "Jessica"]);
    for (const e of experts) {
      const name = asStr(e.nome).trim();
      if (name) allExpertNames.add(name);
    }
    for (const opName of leadsByOp.keys()) {
      if (opName) allExpertNames.add(opName);
    }
    for (const opName of vendasByExpert.keys()) {
      if (opName) allExpertNames.add(opName);
    }
    if (data.includeHighTicket !== false) allExpertNames.add("High Ticket");

    let totalFat = 0;
    let totalVendas = vendasScoped.length;

    const opStats: DashboardOpStats[] = [];
    for (const eName of allExpertNames) {
      const vds = vendasByExpert.get(eName) || [];
      const scopedVds = expertFilter ? vds.filter((v) => sameExpert(v._expert, expertFilter)) : vds;
      const faturamento = scopedVds.reduce((a: number, v: any) => a + parseTicket(v.Ticket), 0);
      const vendasCount = scopedVds.length;
      const vdsTm = scopedVds.filter((v: any) => parseTicket(v.Ticket) >= 97);
      const fatTm = vdsTm.reduce((a: number, v: any) => a + parseTicket(v.Ticket), 0);
      const ticketMedio = vdsTm.length ? fatTm / vdsTm.length : 0;

      const reembCount = reembolsosAll.filter((r: any) => {
        if (!inRange(parseDataField(r["Data do Reembolso"]))) return false;
        return getRefundExpert(r) === eName;
      }).length;

      const leads = leadsByOp.get(eName) || 0;
      const conversao = leads > 0 ? (vendasCount / leads) * 100 : 0;

      let eId = -1;
      let eFoto: string | null = null;
      if (eName !== "High Ticket") {
        const found = experts.find((ex: any) => asStr(ex.nome).trim() === eName);
        if (found) { eId = found.id; eFoto = found.foto_url || null; }
      }

      const vdsCount = vendedoresRaw.filter((vd: any) => vd.expert === eName && vd.ativo).length;
      totalFat += faturamento;

      const fontesArr = Array.from(fontesByOp.get(eName)?.entries() || [])
        .map(([fonte, s]) => ({ fonte, ...s }))
        .filter((f) => f.vendas > 0)
        .sort((a, b) => b.faturamento - a.faturamento);

      // Lead breakdown: conta vendas convertidas por tipo de lead
      const typeVendas = new Map<string, number>();
      for (const v of scopedVds) {
        const vEmail = String(v.Email ?? "").trim().toLowerCase();
        const vTel = cleanPhone(v.Telefone ?? "");
        const lead = matchLead(vEmail, vTel);
        if (lead) {
          const lt = classifyLeadType(lead);
          typeVendas.set(lt, (typeVendas.get(lt) || 0) + 1);
        }
      }
      const typeMap = leadBreakdownByOp.get(eName);
      const leadBreakdownArr = ["Typebot (Orgânico)", "Typebot (Tráfego Pago)", "Orgânico Direto"]
        .map((tipo) => {
          const entry = typeMap?.get(tipo) || { leads: 0, vendas: 0 };
          const vendasConvertidas = typeVendas.get(tipo) || 0;
          return { tipo, leads: entry.leads, vendas: vendasConvertidas, conversao: entry.leads > 0 ? Math.round((vendasConvertidas / entry.leads) * 1000) / 10 : 0 };
        })
        .filter((b) => b.leads > 0 || b.vendas > 0);

      opStats.push({
        id: eId, nome: eName, foto_url: eFoto,
        faturamento, vendas: vendasCount, ticketMedio,
        reembolsos: reembCount, leads, conversao: Math.round(conversao * 10) / 10,
        vendedoresCount: vdsCount, pctTotal: 0, fontes: fontesArr, leadBreakdown: leadBreakdownArr,
      });
    }

    if (data.includeHighTicket) {
      const htVendas = (htVendasAll as any[]).filter((v: any) => inRange(parseDataField(v.data)));
      const fatHt = htVendas.reduce((a: number, v: any) => a + (parseFloat(v.valor_total) || 0), 0);
      totalFat += fatHt;
      const htEntry = opStats.find((o) => o.nome === "High Ticket");
      if (htEntry) {
        htEntry.faturamento = fatHt;
        htEntry.vendas = htVendas.length;
        htEntry.ticketMedio = htVendas.length ? fatHt / htVendas.length : 0;
        htEntry.leads = leadsByOp.get("High Ticket") || 0;
        htEntry.conversao = htEntry.leads > 0 ? (htEntry.vendas / htEntry.leads) * 100 : 0;
      }
    }

    for (const o of opStats) {
      o.pctTotal = totalFat > 0 ? o.faturamento / totalFat : 0;
    }

    opStats.sort((a, b) => b.faturamento - a.faturamento);

    // ── 8. Ticket Médio Geral ──
    const vendasTm = vendasScoped.filter((v: any) => parseTicket(v.Ticket) >= 97);
    const fatTmGeral = vendasTm.reduce((a: number, v: any) => a + parseTicket(v.Ticket), 0);
    const ticketMedioGeral = vendasTm.length ? fatTmGeral / vendasTm.length : 0;

    // ── 9. Gastos ──
    const gastosMes = financeiroAll
      .filter((f: any) => {
        const tipo = String(f.tipo ?? "").toLowerCase();
        return (tipo === "gasto" || tipo === "saida" || tipo === "despesa") && inRange(parseDataField(f.data_ref));
      })
      .reduce((acc: number, f: any) => acc + Number(f.valor ?? 0), 0);

    // ── 10. Reembolsos ──
    const reembolsos = reembolsosAll.filter((r: any) => {
      if (!inRange(parseDataField(r["Data do Reembolso"]))) return false;
      if (expertFilter) return getRefundExpert(r) === expertFilter;
      return true;
    });

    const reembolsosList: ReembolsoItem[] = (reembolsos as any[]).map((r) => ({
      idVenda: asStr(r["ID da Venda"]),
      produto: asStrOrNull(r["Produto"]),
      cliente: asStrOrNull(r["Nome do Cliente"]),
      valor: parseTicket(r["Valor Base do Produto"]),
      dataVenda: asStrOrNull(r["Data da Venda"]),
      dataReembolso: asStrOrNull(r["Data do Reembolso"]),
      expert: asStrOrNull(getRefundExpert(r)),
    })).sort((a, b) => (b.dataReembolso ?? "").localeCompare(a.dataReembolso ?? ""));

    // ── 11. Vendedores (UTM) ──
    const vendedorMap = new Map<string, VendedorStat>();
    for (const vd of vendedoresRaw as any[]) {
      if (!vd.utm) continue;
      vendedorMap.set(String(vd.utm).toUpperCase(), {
        utm: String(vd.utm).toUpperCase(), nome: vd.nome ?? vd.utm,
        expert: vd.expert ?? null, fotoUrl: vd.foto_url || null,
        faturamento: 0, vendas: 0, pctTotal: 0,
      });
    }
    for (const v of vendasScoped as any[]) {
      const rawUtm = v.UTM ? String(v.UTM).toUpperCase() : "";
      if (!rawUtm) continue;
      let entry = vendedorMap.get(rawUtm);
      if (!entry) {
        entry = { utm: rawUtm, nome: rawUtm, expert: null, fotoUrl: null, faturamento: 0, vendas: 0, pctTotal: 0 };
        vendedorMap.set(rawUtm, entry);
      }
      entry.faturamento += parseTicket(v.Ticket);
      entry.vendas += 1;
    }
    const vendedores = Array.from(vendedorMap.values())
      .filter((v) => v.vendas > 0)
      .map((v) => ({ ...v, pctTotal: totalFat > 0 ? v.faturamento / totalFat : 0 }))
      .sort((a, b) => b.faturamento - a.faturamento);

    // ── 12. Série diária ──
    const serieMap = new Map<string, { total: number; vendas: number }>();
    for (const v of vendasScoped as any[]) {
      const t = parseDataField(v.Data);
      if (t == null) continue;
      const d = new Date(t);
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const entry = serieMap.get(iso) ?? { total: 0, vendas: 0 };
      entry.total += parseTicket(v.Ticket);
      entry.vendas += 1;
      serieMap.set(iso, entry);
    }
    if (data.includeHighTicket) {
      const htVendas = (htVendasAll as any[]).filter((v: any) => inRange(parseDataField(v.data)));
      for (const v of htVendas) {
        const t = parseDataField(v.data);
        if (t == null) continue;
        const d = new Date(t);
        const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        const entry = serieMap.get(iso) ?? { total: 0, vendas: 0 };
        entry.total += (parseFloat(v.valor_total) || 0);
        entry.vendas += 1;
        serieMap.set(iso, entry);
      }
    }
    let startTs = fromTs, endTs = toTs;
    if (startTs == null || endTs == null) {
      const allTs = Array.from(serieMap.keys()).map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
      if (allTs.length) { startTs = startTs ?? Math.min(...allTs); endTs = endTs ?? Math.max(...allTs); }
    }
    const serieDiaria: SerieDiaria[] = [];
    if (startTs != null && endTs != null) {
      const DAY = 86400_000;
      for (let t = startTs; t <= endTs; t += DAY) {
        const d = new Date(t);
        const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        const entry = serieMap.get(iso) ?? { total: 0, vendas: 0 };
        serieDiaria.push({ data: iso, total: entry.total, vendas: entry.vendas });
      }
    }

    const totalReembolsos = reembolsosList.length;
    // totalLeads = leads únicos — usa id/email/phone pra dedup entre quiz e CRM
    const allLeadKeys = new Set<string>();
    for (const l of quizLeadsRaw) {
      const leadDate = parseDataField(l.received_at || l.updated_at || l.created_at);
      if (!inRange(leadDate)) continue;
      const id = String(l.id ?? "");
      const email = String(l.email ?? "").trim().toLowerCase();
      const phone = cleanPhone(l.whatsapp ?? "");
      if (id) allLeadKeys.add(`id:${id}`);
      else if (email) allLeadKeys.add(`e:${email}`);
      else if (phone) allLeadKeys.add(`p:${phone}`);
    }
    for (const l of crmLeadsRaw) {
      const leadDate = parseDataField(l.created_at || l.received_at || l.updated_at);
      if (!inRange(leadDate)) continue;
      const id = String(l.id ?? "");
      const email = String(l.email ?? "").trim().toLowerCase();
      const phone = cleanPhone(l.whatsapp ?? "");
      if (id) allLeadKeys.add(`id:${id}`);
      else if (email) allLeadKeys.add(`e:${email}`);
      else if (phone) allLeadKeys.add(`p:${phone}`);
    }
    const totalLeads = allLeadKeys.size;

    return {
      ops: opStats,
      totalFat,
      totalVendas,
      totalReembolsos,
      totalLeads,
      ticketMedioGeral,
      gastosMes,
      saldoEstimado: totalFat - gastosMes,
      vendedores,
      serieDiaria,
      reembolsos: reembolsosList,
    };
  });

