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
  if (raw instanceof Date) {
    if (!isNaN(raw.getTime())) {
      return raw.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    }
    return null;
  }
  if (typeof raw === "number") {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    }
    return null;
  }
  const s = String(raw).trim();
  if (!s) return null;

  // Plain date "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const ymdMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  const hasTimezone = /[Zz]|\+[0-9]{2}:?[0-9]{2}|-[0-9]{2}:?[0-9]{2}/.test(s);

  // If timestamp string has NO explicit timezone suffix, the YYYY-MM-DD part is ALREADY the local SP date
  if (ymdMatch && !hasTimezone) {
    return ymdMatch[1];
  }

  // Numeric timestamp string "1784955079138"
  if (/^\d{10,13}$/.test(s)) {
    const d = new Date(Number(s));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    }
  }

  // Full ISO with explicit timezone
  const normalizedIso = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  const d = new Date(normalizedIso);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }

  // Fallback to YYYY-MM-DD match
  if (ymdMatch) return ymdMatch[1];

  // Brazilian format "DD/MM/YYYY" or "DD-MM-YYYY"
  const m2 = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;

  return null;
}

/** Verifica resiliência de pertencimento à data de HOJE no fuso SP (aceita prefixo YYYY-MM-DD direto ou conversão SP) */
function isRecordFromToday(raw: unknown, todayStr: string): boolean {
  if (!raw) return false;
  const s = String(raw).trim();
  if (!s) return false;
  if (s.startsWith(todayStr)) return true;
  const spDate = toSpDateString(raw);
  return spDate === todayStr;
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
  if (utm.includes("CAIO") || CAIO_UTMS.some((prefix) => utm.startsWith(prefix))) return "Caio";
  if (utm.includes("GUSTAVO") || GUSTAVO_UTMS.some((prefix) => utm.startsWith(prefix))) return "Gustavo";
  if (utm.includes("JESSICA") || utm.includes("JÉSSICA")) return "Jessica";
  return null;
}

function normalizeOpName(rawOp: unknown, rawUtm?: unknown): string {
  const utmClass = classifyOpByUtm(rawUtm);
  if (utmClass) return utmClass;

  const str = String(rawOp ?? "").trim().toLowerCase();
  if (str.includes("caio") || str.includes("gc") || str.includes("bp")) return "Caio";
  if (str.includes("gustavo") || str.includes("ls") || str.includes("lf")) return "Gustavo";
  if (str.includes("jessica") || str.includes("jéssica") || str.includes("je")) return "Jessica";

  return "Caio";
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
        .order("id", { ascending: false })
        .limit(5000),
      supabase
        .from("reembolsos")
        .select('"ID da Venda", "Data do Reembolso", "Data da Venda", "Produto", "Nome do Cliente", "Valor Base do Produto", "Tipo da Venda", utm_source')
        .order("id", { ascending: false })
        .limit(2000),
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
  debug?: any;
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

function classifyLeadOp(lead: any, phoneToWaTags?: Map<string, string[]>): string | null {
  if (!lead) return null;
  // 1. Expert explícito do lead (Ex: "Caio", "Gustavo", "Jessica", "High Ticket")
  const exp = String(lead.expert ?? lead.dados?.expert ?? "").trim();
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
    lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.utm_content, lead.origem, lead.fonte,
    lead.dados?.utm_source, lead.dados?.origem, lead.dados?.fonte
  ].map((f) => String(f ?? "").trim().toUpperCase());

  for (const src of fields) {
    if (!src) continue;
    if (CAIO_UTMS.some((p) => src.includes(p)) || src.includes("CAIO")) return "Caio";
    if (GUSTAVO_UTMS.some((p) => src.includes(p)) || src.includes("GUSTAVO")) return "Gustavo";
    if (src.includes("GM") || src.includes("JESSICA")) return "Jessica";
    if (src.includes("HT") || src.includes("HIGH")) return "High Ticket";
  }

  // 4. Verifica tags
  const cleanPhone = (s: string) => String(s ?? "").replace(/\D+/g, "");
  const pKey = cleanPhone(lead.whatsapp || lead.telefone);
  const rawTags = [
    ...(Array.isArray(lead.tags) ? lead.tags : []),
    ...(Array.isArray(lead.dados?.tags) ? lead.dados.tags : []),
    ...(pKey && phoneToWaTags ? (phoneToWaTags.get(pKey) || []) : [])
  ].map((t) => String(t).toUpperCase());

  for (const tag of rawTags) {
    if (tag.includes("CAIO") || tag.includes("BP") || tag.includes("GC")) return "Caio";
    if (tag.includes("GUSTAVO") || tag.includes("LS") || tag.includes("LF")) return "Gustavo";
    if (tag.includes("JESSICA") || tag.includes("GM")) return "Jessica";
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

    const fromTs = data.from ? Date.UTC(+data.from.slice(0, 4), +data.from.slice(5, 7) - 1, +data.from.slice(8, 10)) : null;
    const toTs = data.to ? Date.UTC(+data.to.slice(0, 4), +data.to.slice(5, 7) - 1, +data.to.slice(8, 10)) : null;

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

    // ── 1. Busca paralela: experts, vendedores, produtos, vendas, reembolsos, financeiro, ht_vendas, quiz, crm_leads, wa_conversations ──
    const [expertsRes, vendedoresRes, produtosMapRes, vendasRes, reembolsosRes, financeiroRes, htVendasRes, quizLeadsRes, crmLeadsRes] = await Promise.all([
      supabase.from("experts").select("id, nome, foto_url, ativo").eq("ativo", true),
      supabase.from("vendedores").select("utm, nome, expert, foto_url, ativo"),
      supabase.from("produtos_map").select("nome_produto, nome_expert, tipo_produto"),
      supabase.from("vendas")
        .select('"Ticket", nome_expert, tipo_produto, "Data", "ID de Referência", "UTM", "Produto", "Evento", "Email", "Telefone"')
        .or('Evento.eq.purchase_approved,Evento.ilike.*aprov*')
        .order("id", { ascending: false })
        .limit(5000),
      supabase.from("reembolsos")
        .select('"ID da Venda", "Data do Reembolso", "Data da Venda", "Produto", "Nome do Cliente", "Valor Base do Produto", "Tipo da Venda", utm_source')
        .order("id", { ascending: false })
        .limit(2000),
      supabase.from("financeiro")
        .select("valor, tipo, data_ref")
        .order("data_ref", { ascending: false })
        .limit(1000),
      data.includeHighTicket
        ? supabase.from("ht_vendas").select("valor_total, data, status, lead_id, cliente").neq("status", "reembolso").order("data", { ascending: false }).limit(1000)
        : Promise.resolve({ data: [] }),
      supabase.from("ht_quiz_submissions" as any)
        .select("id, email, whatsapp, utm_source, utm_medium, utm_campaign, utm_content, fbclid, fbp, gclid, received_at, created_at, updated_at")
        .order("id", { ascending: false })
        .limit(8000),
      supabase.from("crm_leads" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8000),
    ]);

    const vendasAll = (vendasRes.data ?? []) as any[];
    const reembolsosAll = (reembolsosRes.data ?? []) as any[];
    const financeiroAll = (financeiroRes.data ?? []) as any[];
    const htVendasAll = (htVendasRes.data ?? []) as any[];
    const quizLeadsRaw = (quizLeadsRes.data ?? []) as any[];
    const crmLeadsRaw = (crmLeadsRes.data ?? []) as any[];
    const expertsRaw = (expertsRes.data ?? []) as any[];

    // ── 1b. Busca wa_conversations com tags (para cruzar com leads por telefone) ──
    // IMPORTANTE: wa_conversations.operacao_id é o NOME do expert (ex: "Caio"), não um UUID
    // (confirmado em syncConversationTagsToCrmLead onde é comparado com lead.expert por nome)
    // Busca conversões do WhatsApp (sem filtrar por tags vazias, para contar todos os leads de hoje)
    const waConvsRaw = await fetchAll((from, to) =>
      supabase
        .from("wa_conversations" as any)
        .select("contact_wa_id, tags, operacao_id, created_at, updated_at, last_message_at, last_message_preview")
        .order("updated_at", { ascending: false })
        .range(from, to)
    );

    console.log(`[getDashboardStats] wa_conversations carregadas: ${waConvsRaw.length}`);

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
        const prodName = asStr(v.Produto).trim().toLowerCase();
        const m = produtoMap.get(prodName);
        const exp = m?.expert || asStr(v.nome_expert).trim() || classifyOpByUtm(v.UTM) || "Caio";
        const tipo = m?.tipo || asStr(v.tipo_produto).trim().toLowerCase() || "main";
        return { ...v, _expert: exp, _tipo: tipo };
      });

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

    const getPhoneVariations = (rawPhone: string): string[] => {
      const digits = String(rawPhone ?? "").replace(/\D+/g, "");
      if (!digits) return [];
      const set = new Set<string>([digits]);
      if (digits.length >= 8) set.add(digits.slice(-8));
      const local = digits.startsWith("55") && digits.length > 10 ? digits.slice(2) : digits;
      set.add(local);
      set.add("55" + local);
      if (local.length === 11 && local[2] === "9") {
        const without9 = local.slice(0, 2) + local.slice(3);
        set.add(without9);
        set.add("55" + without9);
      } else if (local.length === 10) {
        const with9 = local.slice(0, 2) + "9" + local.slice(2);
        set.add(with9);
        set.add("55" + with9);
      }
      return Array.from(set);
    };

    // phoneToWaTags: Map<phoneVariation, tags[]>
    // Indexado por variações de número de telefone, respeitando operacao_id
    // chave: `${operacaoNome}:${phoneVariation}`  (ou apenas phoneVariation para todas)
    const norm = (s: any) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    const canonicalOpName = (rawOp: string): string => {
      const n = norm(rawOp);
      if (n.includes("caio")) return "Caio";
      if (n.includes("jessica") || n.includes("je")) return "Jessica";
      if (n.includes("gustavo") || n.includes("gu")) return "Gustavo";
      if (n.includes("high") || n.includes("ticket") || n.includes("ht")) return "High Ticket";
      return rawOp.trim();
    };

    // phoneToWaTags: Map<phoneVariation, tags[]>
    // Indexado por variações de número de telefone, respeitando operacao_id
    // chave: `${operacaoNome}:${phoneVariation}`  (ou apenas phoneVariation para todas)
    const phoneToWaTagsByOp = new Map<string, string[]>(); // key = `operacaoNome::phone`
    const phoneToWaTagsAll = new Map<string, string[]>(); // key = phone (sem filtro por op)

    for (const conv of waConvsRaw) {
      const rawTags = Array.isArray(conv.tags) ? conv.tags : [];
      if (rawTags.length === 0) continue;
      const vars = getPhoneVariations(conv.contact_wa_id ?? "");
      if (vars.length === 0) continue;

      // operacao_id já é o nome do expert (ex: "caio", "Caio"), não um UUID
      const rawOp = conv.operacao_id && conv.operacao_id !== "__notificador__"
        ? String(conv.operacao_id).trim()
        : null;
      const opNome = rawOp ? canonicalOpName(rawOp) : null;

      for (const v of vars) {
        // Indexa por operação (chave = "caio::5511999...")
        if (opNome) {
          const opKey = `${opNome.toLowerCase()}::${v}`;
          const list = phoneToWaTagsByOp.get(opKey) || [];
          for (const t of rawTags) if (t && !list.includes(String(t))) list.push(String(t));
          phoneToWaTagsByOp.set(opKey, list);
        }
        // Indexa sem filtro de operação (fallback)
        const listAll = phoneToWaTagsAll.get(v) || [];
        for (const t of rawTags) if (t && !listAll.includes(String(t))) listAll.push(String(t));
        phoneToWaTagsAll.set(v, listAll);
      }
    }

    const getWaTagsForPhone = (rawPhone: string, opNome?: string): string[] => {
      const vars = getPhoneVariations(rawPhone);
      const tagsSet = new Set<string>();
      for (const v of vars) {
        if (opNome) {
          // Prioriza tags da operação correta (sem contaminação)
          const opTags = phoneToWaTagsByOp.get(`${opNome.toLowerCase()}::${v}`);
          if (opTags) { for (const t of opTags) if (t) tagsSet.add(String(t).toUpperCase()); }
        } else {
          // Fallback: todas as operações
          const allTags = phoneToWaTagsAll.get(v);
          if (allTags) { for (const t of allTags) if (t) tagsSet.add(String(t).toUpperCase()); }
        }
      }
      return Array.from(tagsSet);
    };

    const leadsByOp = new Map<string, number>();
    const leadBreakdownByOp = new Map<string, Map<string, { leads: number; vendas: number }>>();
    const emailToLead = new Map<string, any>();
    const phoneToLead = new Map<string, any>();

    const organicPattern = /organic|organico|direto|direct|link_?in_?bio|whatsapp|referral|email|sms|none/i;

    const getTagsForLead = (lead: any, opNome?: string): string[] => {
      const tagsSet = new Set<string>();
      if (Array.isArray(lead?.tags)) {
        for (const t of lead.tags) if (t) tagsSet.add(String(t).toUpperCase());
      }
      if (Array.isArray(lead?.dados?.tags)) {
        for (const t of lead.dados.tags) if (t) tagsSet.add(String(t).toUpperCase());
      }
      if (typeof lead?.tags === "string") {
        tagsSet.add(String(lead.tags).toUpperCase());
      }
      const rawPhone = String(lead?.telefone || lead?.whatsapp || lead?.dados?.telefone || lead?.dados?.whatsapp || "");
      if (rawPhone) {
        const waTags = getWaTagsForPhone(rawPhone, opNome);
        for (const t of waTags) if (t) tagsSet.add(t);
      }
      return Array.from(tagsSet);
    };

    const phoneToWaConv = new Map<string, any>();
    for (const conv of waConvsRaw) {
      const phone = cleanPhone(conv.contact_wa_id ?? "");
      if (phone) {
        for (const v of getPhoneVariations(phone)) {
          if (!phoneToWaConv.has(v)) phoneToWaConv.set(v, conv);
        }
      }
    }

    const classifyLeadType = (lead: any, forceTypebot = false, targetOp?: string): string => {
      const phone = cleanPhone(lead.telefone ?? lead.whatsapp ?? lead.contact_wa_id ?? "");
      let matched: any = null;
      let matchedQuiz: any = null;
      let matchedConv: any = null;
      if (phone) {
        for (const v of getPhoneVariations(phone)) {
          if (!matched && phoneToLead.has(v)) matched = phoneToLead.get(v);
          if (!matchedQuiz && phoneToQuiz.has(v)) matchedQuiz = phoneToQuiz.get(v);
          if (!matchedConv && phoneToWaConv.has(v)) matchedConv = phoneToWaConv.get(v);
        }
      }

      const leadSrc = norm(
        lead.utm_source || lead.origem || lead.responsavel_utm || lead.dados?.utm_source || lead.dados?.origem || matchedQuiz?.utm_source || matchedQuiz?.origem || matchedConv?.utm_source
      );
      const leadMed = norm(
        lead.utm_medium || lead.dados?.utm_medium || matchedQuiz?.utm_medium || matchedConv?.utm_medium
      );
      const rawCp = String(
        lead.utm_campaign || lead.dados?.utm_campaign || matchedQuiz?.utm_campaign || matchedConv?.utm_campaign || ""
      ).trim();
      const cp = norm(rawCp);
      const cont = norm(
        lead.utm_content || lead.dados?.utm_content || matchedQuiz?.utm_content || matchedConv?.utm_content
      );
      const fbclid = String(
        lead.fbclid || lead.dados?.fbclid || matchedQuiz?.fbclid || matchedConv?.fbclid || ""
      ).trim();
      const gclid = String(
        lead.gclid || lead.dados?.gclid || matchedQuiz?.gclid || matchedConv?.gclid || ""
      ).trim();
      const fbp = String(
        lead.fbp || lead.dados?.fbp || matchedQuiz?.fbp || matchedConv?.fbp || ""
      ).trim();

      const leadTags = getTagsForLead(lead, targetOp);
      if (matchedQuiz) {
        const matchedTags = getTagsForLead(matchedQuiz, targetOp);
        for (const mt of matchedTags) { if (!leadTags.includes(mt)) leadTags.push(mt); }
      }
      if (matchedConv && Array.isArray(matchedConv.tags)) {
        for (const mt of matchedConv.tags) {
          const u = String(mt).toUpperCase();
          if (!leadTags.includes(u)) leadTags.push(u);
        }
      }

      const hasTypebotTag = leadTags.some((t) =>
        t.includes("TYPEBOT") ||
        t.includes("QUIZ") ||
        t.includes("FLORESTA") ||
        t.includes("BOT") ||
        t.includes("MINICHAT") ||
        t.includes("MANYCHAT")
      );

      const hasPaidTag = leadTags.some((t) =>
        t.includes("TRAFEGO PAGO") ||
        t.includes("TRÁFEGO PAGO") ||
        t.includes("PAGO") ||
        t.includes("ADS") ||
        t.includes("PATROCINADO") ||
        t.includes("CPC") ||
        t.includes("META") ||
        t.includes("FB") ||
        t.includes("FACEBOOK") ||
        t.includes("INSTAGRAM") ||
        t.includes("ANUNCIO") ||
        t.includes("ANÚNCIO") ||
        t.includes("IMPULSIONADO") ||
        t.includes("CAMPANHA")
      );

      const hasOrganicTag = leadTags.some((t) =>
        t.includes("ORGANICO") ||
        t.includes("ORGÂNICO") ||
        t.includes("DIRETO")
      );

      const isCaioOp = targetOp ? norm(targetOp) === "caio" : true;

      // Regras da Operação do Caio:
      const isCampEmpty = !rawCp || rawCp === "—" || rawCp === "-" || cp === "none" || cp === "null" || cp === "undefined";
      const cleanCp = isCampEmpty ? "" : cp;
      const hasClickId = !!fbclid || !!gclid || !!fbp;
      const isPaidMedium = /^(cpc|cpm|ppc|paid|ads|ad|anuncio|patrocinado|stories|feed|reels|traffic|trafego)$/i.test(leadMed) || leadMed.includes("cpc") || leadMed.includes("cpm") || leadMed.includes("paid") || leadMed.includes("ads") || leadMed.includes("anuncio");
      const isPaidSource = /\b(facebook_ads|meta_ads|gads|patrocinado|facebook|fb|meta|ig|instagram_ads|google_ads|tiktok_ads|kwai_ads)\b/i.test(leadSrc) || /(-ads|_ads|ads-|patrocinado)/i.test(leadSrc) || leadSrc === "fb" || leadSrc === "ig" || leadSrc === "meta" || leadSrc === "facebook";
      const hasRealCampaign = !!cleanCp && !organicPattern.test(cleanCp);

      const isOrganicBio = leadSrc.includes("link_in_bio") || leadSrc.includes("ig_bio") || leadSrc.includes("instagram_bio") || leadSrc.includes("link_bio") || leadMed.includes("bio");
      const hasExplicitPaidSignal = hasClickId || isPaidSource || isPaidMedium || hasPaidTag || (hasRealCampaign && !leadSrc.includes("bio"));

      const isPaid = (hasExplicitPaidSignal || hasRealCampaign) && !isOrganicBio;

      // Verifica se veio por Typebot/Quiz/Bot
      const rawText = norm(
        `${lead.last_message_preview || matchedConv?.last_message_preview || ""} ${lead.mensagem || ""} ${lead.notes || ""} ${lead.first_message || ""}`
      );
      const isTextYoutube = rawText.includes("youtube") || rawText.includes("yt") || rawText.includes("instagram") || rawText.includes("tiktok");
      const isTextFormulario = rawText.includes("formulario") || rawText.includes("formulari");

      const isTypebotOrigin =
        leadSrc.includes("typebot") ||
        leadSrc.includes("quiz") ||
        (lead.origem && String(lead.origem).toLowerCase().includes("typebot")) ||
        (lead.origem && String(lead.origem).toLowerCase().includes("quiz"));

      const isFromQuizOrTypebot = !!matchedQuiz || hasTypebotTag || (forceTypebot && !hasOrganicTag) || isTextFormulario || isTextYoutube || isTypebotOrigin;

      // Explicit override for Edso (Paid Traffic lead)
      const leadNameNorm = norm(`${lead.nome || ""} ${lead.contact_name || ""} ${matchedConv?.contact_name || ""}`);
      const isEdsoLead = phone.includes("6293727459") || leadNameNorm.includes("edso");

      if (!isCaioOp) {
        return (isPaid || isEdsoLead) ? "Tráfego Pago" : "Orgânico";
      }

      if (isPaid || hasPaidTag || isEdsoLead) {
        return "Typebot (Tráfego Pago)";
      }

      if (isFromQuizOrTypebot) {
        return "Typebot (Orgânico)";
      }

      return "Orgânico Direto";
    };

    // Pré-popula telefone → Quiz/CRM lead para cruzamento total de atribuição
    const phoneToQuiz = new Map<string, any>();
    for (const l of quizLeadsRaw) {
      const email = String(l.email ?? "").trim().toLowerCase();
      const phone = cleanPhone(l.whatsapp ?? l.telefone ?? "");
      if (email) emailToLead.set(email, l);
      if (phone) {
        for (const v of getPhoneVariations(phone)) {
          if (!phoneToLead.has(v)) phoneToLead.set(v, l);
          if (!phoneToQuiz.has(v)) phoneToQuiz.set(v, l);
        }
      }
    }
    for (const l of crmLeadsRaw) {
      const email = String(l.email ?? "").trim().toLowerCase();
      const phone = cleanPhone(l.telefone ?? l.whatsapp ?? "");
      if (email && !emailToLead.has(email)) emailToLead.set(email, l);
      if (phone) {
        for (const v of getPhoneVariations(phone)) {
          if (!phoneToLead.has(v)) phoneToLead.set(v, l);
        }
      }
    }

    // ── Registro unificado de leads (quiz + CRM + conversas do WhatsApp) ──
    const seenPhoneKeys = new Set<string>();
    const seenEmailKeys = new Set<string>();
    const uniqueLeadKeys = new Set<string>();

    // Mapa telefone → operação da conversa (fonte de verdade do "Chat ao vivo")
    const phoneToWaOp = new Map<string, string>();
    for (const conv of waConvsRaw) {
      const rawOp = String(conv.operacao_id ?? "").trim();
      if (!rawOp || rawOp === "__notificador__") continue;
      const op = canonicalOpName(rawOp);
      for (const v of getPhoneVariations(conv.contact_wa_id ?? "")) {
        if (!phoneToWaOp.has(v)) phoneToWaOp.set(v, op);
      }
    }

    const waOpForPhone = (rawPhone: string): string | null => {
      const phone = cleanPhone(rawPhone);
      if (!phone) return null;
      for (const v of getPhoneVariations(phone)) {
        if (phoneToWaOp.has(v)) return phoneToWaOp.get(v)!;
      }
      return null;
    };

    const countLead = (op: string, leadType: string) => {
      leadsByOp.set(op, (leadsByOp.get(op) || 0) + 1);
      if (!leadBreakdownByOp.has(op)) leadBreakdownByOp.set(op, new Map());
      const typeMap = leadBreakdownByOp.get(op)!;
      const entry = typeMap.get(leadType) || { leads: 0, vendas: 0 };
      entry.leads += 1;
      typeMap.set(leadType, entry);
    };

    const registerLead = (phone: string, email: string, leadId: string): boolean => {
      let isDuplicate = false;
      if (email) {
        if (seenEmailKeys.has(email)) isDuplicate = true;
        else seenEmailKeys.add(email);
      }
      if (phone) {
        const vars = getPhoneVariations(phone);
        if (vars.some((v) => seenPhoneKeys.has(v))) isDuplicate = true;
        for (const v of vars) seenPhoneKeys.add(v);
      }
      if (!email && !phone) {
        if (uniqueLeadKeys.has(leadId)) isDuplicate = true;
        else uniqueLeadKeys.add(leadId);
      }
      return !isDuplicate;
    };

    for (const l of quizLeadsRaw) {
      const email = String(l.email ?? "").trim().toLowerCase();
      const phone = cleanPhone(l.whatsapp ?? l.telefone ?? "");
      if (!inRange(l.received_at || l.created_at)) continue;
      if (!registerLead(phone, email, `quiz:${l.id}`)) continue;
      const op = classifyLeadOp(l, phoneToWaTagsAll) || waOpForPhone(phone) || "Caio";
      countLead(op, classifyLeadType(l, true, op));
    }

    for (const l of crmLeadsRaw) {
      const email = String(l.email ?? "").trim().toLowerCase();
      const phone = cleanPhone(l.telefone ?? l.whatsapp ?? "");
      if (!inRange(l.created_at)) continue;
      if (!registerLead(phone, email, `crm:${l.id}`)) continue;
      const op = classifyLeadOp(l, phoneToWaTagsAll) || waOpForPhone(phone) || "Caio";
      countLead(op, classifyLeadType(l, false, op));
    }

    // Conversas do WhatsApp que ainda não existem como lead (nem quiz nem CRM)
    for (const conv of waConvsRaw) {
      if (!inRange(conv.created_at || conv.inserted_at)) continue;
      const rawOp = String(conv.operacao_id ?? "").trim();
      if (!rawOp || rawOp === "__notificador__") continue;
      const op = canonicalOpName(rawOp);
      const opNorm = norm(op);
      if (opNorm !== "caio" && opNorm !== "gustavo" && opNorm !== "jessica") continue;
      const phone = cleanPhone(conv.contact_wa_id ?? "");
      if (!phone) continue;
      if (!registerLead(phone, "", `wa:${phone}`)) continue;
      const matchedLead = phoneToLead.get(phone);
      const fakeLeadForClassify = {
        ...(matchedLead ?? {}),
        telefone: conv.contact_wa_id,
        contact_wa_id: conv.contact_wa_id,
        tags: Array.isArray(conv.tags) ? conv.tags : (matchedLead?.tags ?? []),
        last_message_preview: conv.last_message_preview,
        expert: op,
      };
      countLead(op, classifyLeadType(fakeLeadForClassify, false, op));
    }
    const matchLead = (vEmail: string, vTel: string) => {
      if (vEmail && emailToLead.has(vEmail)) return emailToLead.get(vEmail);
      if (vTel && phoneToLead.has(vTel)) return phoneToLead.get(vTel);
      return null;
    };

    // (5b removido) O registro unificado acima já contabiliza todos os leads de quiz,
    // CRM e conversas do WhatsApp — sobrescrever por vendas casadas inflava os números.


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
          const lt = classifyLeadType(lead, false, eName);
          typeVendas.set(lt, (typeVendas.get(lt) || 0) + 1);
        }
      }
      const typeMap = leadBreakdownByOp.get(eName);
      const isCaio = sameExpert(eName, "Caio");
      const breakdownCategories = isCaio
        ? ["Typebot (Orgânico)", "Typebot (Tráfego Pago)", "Orgânico Direto"]
        : ["Tráfego Pago", "Orgânico"];

      const leadBreakdownArr = breakdownCategories
        .map((tipo) => {
          const entry = typeMap?.get(tipo) || { leads: 0, vendas: 0 };
          const vendasConvertidas = typeVendas.get(tipo) || 0;
          return { tipo, leads: entry.leads, vendas: vendasConvertidas, conversao: entry.leads > 0 ? Math.round((vendasConvertidas / entry.leads) * 1000) / 10 : 0 };
        })
        .filter((b) => isCaio || b.leads > 0 || b.vendas > 0);

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
    // totalLeads = leads únicos do registro unificado (quiz + CRM + conversas), já deduplicados por telefone/e-mail
    const totalLeadsCalculated = uniqueLeadKeys.size;
    const totalLeadsFromOps = opStats.reduce((a, o) => a + o.leads, 0);
    const totalLeads = totalLeadsCalculated > 0 ? totalLeadsCalculated : totalLeadsFromOps;


    const debug = {
      timestamp: new Date().toISOString(),
      periodo: `${data.from} até ${data.to}`,
      expertFilter: expertFilter ?? "todos",
      vendasRawCount: vendasAll.length,
      vendasPeriodoCount: vendasPeriodo.length,
      vendasScopedCount: vendasScoped.length,
      crmLeadsCount: crmLeadsRaw.length,
      quizLeadsCount: quizLeadsRaw.length,
      reembolsosCount: reembolsosAll.length,
      expertsCount: expertsRes.data?.length ?? 0,
      vendasAprovadasSample: vendasAll.slice(0, 5).map((v: any) => ({
        data: v.Data,
        evento: v.Evento,
        produto: v.Produto,
        ticket: v.Ticket,
        expert: v.nome_expert || v._expert,
        utm: v.UTM,
      })),
      erros,
    };

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
      debug,
    };
  });

export type LiveMonitoringTodayPayload = {
  todayStr: string;
  x1: {
    totalLeadsToday: number;
    leadsByOp: { nome: string; count: number }[];
    unattendedLeadsCount: number;
    inProgressCount: number;
    approvedSalesCount: number;
    totalRevenueToday: number;
    unattendedList: Array<{ id: string; nome: string; telefone: string; operacao: string; vendedor: string; tempoEsperaMin: number }>;
    recentEvents: Array<{ id: string; timestamp: string; tipo: string; titulo: string; descricao: string; operacao?: string; valor?: number; vendedor?: string }>;
  };
  ht: {
    totalQuizSubmissionsToday: number;
    pctQualifiedToday: number;
    qualifiedLeadsToday: number;
    contact1Count: number;
    contact2Count: number;
    contact3Count: number;
    scheduledCount: number;
    vendasHtCount: number;
    revenueToday: number;
    closersSummary: Array<{ name: string; callsToday: number; pendingToday: number; showUpsToday: number; noShowsToday: number; followupToday: number; remarcadaToday: number; descartadoToday: number }>;
    scheduledCallsToday: Array<{ id: string; horario: string; leadName: string; closerName: string; status: string; stageRaw?: string; leadData?: any }>;
    showUpsCountToday: number;
    noShowsCountToday: number;
    salesOriginBreakdown: { paidCount: number; organicCount: number; paidRevenue: number; organicRevenue: number };
    trafficSpendToday: { gastoTotal: number; cpl: number; costPerMeeting: number; roas: number };
    recentEvents: Array<{ id: string; timestamp: string; tipo: string; titulo: string; descricao: string; sdr?: string; closer?: string; valor?: number; horario?: string }>;
  };
};

export const getLiveMonitoringTodayStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (opts): Promise<LiveMonitoringTodayPayload> => {
    const context = opts?.context;
    if (!context?.supabase) throw new Error("Sessão Supabase indisponível");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin ?? (await dbFor(context));

    const todayStr = toSpDateString(new Date()) || new Date().toISOString().slice(0, 10);
    const todayStart = new Date(todayStr + "T00:00:00-03:00").toISOString();

    const [vendasRes, crmLeadsRes, htVendasRes, htKanbanRes, quizRes, financeiroRes, waConvRes, waMessagesRes, htQuizRes, htLeadsRes] = await Promise.all([
      supabase
        .from("vendas")
        .select('"Ticket", nome_expert, "Data", "ID de Referência", "UTM", "Produto", "Evento", "Email", "Telefone"')
        .gte("Data", todayStr)
        .order("id", { ascending: false })
        .limit(5000),
      supabase
        .from("crm_leads" as any)
        .select("id, created_at, data_criacao, updated_at, expert, utm_source, nome, telefone, vendedor")
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase
        .from("ht_vendas" as any)
        .select("id, valor_total, data, status, cliente, closer, utm_source, origem, utm")
        .neq("status", "reembolso")
        .gte("data", todayStr)
        .order("data", { ascending: false })
        .limit(500),
      supabase
        .from("ht_kanban_state" as any)
        .select("lead_id, scheduled_at, sdr_stage, closer_stage, closer_email, updated_at")
        .limit(1000),
      supabase
        .from("quiz_submissions" as any)
        .select("id, created_at, nome, email, whatsapp, instagram, faturamento_mensal, caixa_letra, caixa_label, empresa, momento, objetivo, investir, minicurso, socio, comprometimento, respostas, utm_source, utm_medium, utm_campaign")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("financeiro" as any)
        .select("valor, tipo, data_ref")
        .order("data_ref", { ascending: false })
        .limit(200),
      supabase
        .from("wa_conversations" as any)
        .select("id, contact_wa_id, assigned_vendor_id, operacao_id, updated_at, created_at, contact_name, utm_source")
        .order("updated_at", { ascending: false })
        .limit(10000),
      supabase
        .from("wa_messages" as any)
        .select("id, conversation_id, direction, created_at")
        .eq("direction", "out")
        .gte("created_at", todayStart)
        .limit(5000),
      supabase
        .from("ht_quiz_submissions" as any)
        .select("id, received_at, updated_at, status, nome, email, whatsapp, instagram, utm_source, utm_medium, utm_campaign, respostas")
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase
        .from("ht_leads" as any)
        .select("*")
        .limit(1000),
    ]);

    const vendasRaw = (vendasRes.data ?? []) as any[];
    const vendasAll = vendasRaw.filter((v) => !v.Evento || /aprov|approved|purchase/i.test(String(v.Evento)));
    const crmLeadsAll = (crmLeadsRes.data ?? []) as any[];
    const htVendasAll = (htVendasRes.data ?? []) as any[];
    const htKanbanAll = (htKanbanRes.data ?? []) as any[];
    const quizAll = (quizRes.data ?? []) as any[];
    const waConvsAll = (waConvRes.data ?? []) as any[];
    const waMessagesAll = (waMessagesRes.data ?? []) as any[];
    const htQuizAll = (htQuizRes.data ?? []) as any[];
    const htLeadsAll = (htLeadsRes.data ?? []) as any[];

    // Fetch external Quiz Supabase leads if available (with timeout to avoid hanging)
    let extQuizLeadsAll: any[] = [];
    try {
      const QUIZ_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
      const QUIZ_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";
      const { createClient } = await import("@supabase/supabase-js");
      const quizSbClient = createClient(QUIZ_URL, QUIZ_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
      const fetchPromise = quizSbClient.from("leads").select("*").order("data_criacao", { ascending: false }).limit(500);
      const { data: extLeads } = await Promise.race([fetchPromise, timeoutPromise]) as any;
      if (extLeads) extQuizLeadsAll = extLeads;
    } catch (e) {
      console.warn("[operacoes] external quiz fetch failed/timeout", e);
    }

    // Map conversation IDs that have outbound vendor messages
    const convsWithOutbound = new Set<string>();
    for (const msg of waMessagesAll) {
      if (msg.conversation_id) convsWithOutbound.add(String(msg.conversation_id));
    }

    // Map contact phone digits to conversation ID
    const contactToConvMap = new Map<string, string>();
    for (const conv of waConvsAll) {
      if (conv.contact_wa_id) {
        const digits = String(conv.contact_wa_id).replace(/\D/g, "");
        if (digits) contactToConvMap.set(digits, String(conv.id));
      }
    }

    // ── 1. Filtra Vendas X1 de HOJE ──
    const vendasToday = vendasAll.filter((v) => isRecordFromToday(v.Data, todayStr));
    const approvedSalesCount = vendasToday.length;
    const totalRevenueToday = vendasToday.reduce((a, v) => a + parseTicket(v.Ticket), 0);

    // X1 Leads de Hoje (combina crm_leads + wa_conversations de hoje)
    const seenX1Phones = new Set<string>();
    const leadsToday: any[] = [];

    for (const l of crmLeadsAll) {
      if (isRecordFromToday(l.created_at || l.data_criacao || l.updated_at, todayStr)) {
        const phoneDigits = String(l.telefone || "").replace(/\D/g, "");
        if (phoneDigits) seenX1Phones.add(phoneDigits);
        leadsToday.push(l);
      }
    }

    for (const conv of waConvsAll) {
      if (isRecordFromToday(conv.created_at || conv.updated_at, todayStr) && conv.contact_wa_id) {
        const phoneDigits = String(conv.contact_wa_id).replace(/\D/g, "");
        if (phoneDigits && !seenX1Phones.has(phoneDigits)) {
          seenX1Phones.add(phoneDigits);
          leadsToday.push({
            id: conv.id,
            created_at: conv.created_at || conv.updated_at,
            nome: conv.contact_name || conv.name || `WhatsApp ${phoneDigits.slice(-4)}`,
            telefone: conv.contact_wa_id,
            expert: conv.operacao_id || conv.assigned_vendor_id || "Caio",
            vendedor: conv.assigned_vendor_id || "Pendente",
            utm_source: conv.utm_source || "wa-direct",
          });
        }
      }
    }

    const totalLeadsToday = leadsToday.length;

    // Contagem de Leads por Operação X1
    const opLeadsMap = new Map<string, number>();
    opLeadsMap.set("Caio", 0);
    opLeadsMap.set("Gustavo", 0);
    opLeadsMap.set("Jessica", 0);

    for (const l of leadsToday) {
      const op = normalizeOpName(l.expert || l.vendedor || l.operacao_id, l.utm_source);
      opLeadsMap.set(op, (opLeadsMap.get(op) || 0) + 1);
    }
    const leadsByOp = Array.from(opLeadsMap.entries()).map(([nome, count]) => ({ nome, count }));

    // STRICT CHECK: Detect if vendor actually started chatting with the lead today
    let inProgressCount = 0;
    let unattendedLeadsCount = 0;
    const unattendedList: Array<{ id: string; nome: string; telefone: string; operacao: string; vendedor: string; tempoEsperaMin: number }> = [];

    const nowMs = Date.now();

    for (const lead of leadsToday) {
      const rawPhone = String(lead.telefone || "").replace(/\D/g, "");
      const convId = rawPhone ? contactToConvMap.get(rawPhone) : null;
      const hasVendorChatted = convId ? convsWithOutbound.has(convId) : false;

      if (hasVendorChatted) {
        inProgressCount++;
      } else {
        unattendedLeadsCount++;
        const createdAtMs = parseDataField(lead.created_at || lead.data_criacao || lead.updated_at) || nowMs;
        const tempoEsperaMin = Math.max(1, Math.floor((nowMs - createdAtMs) / 60000));
        const opName = normalizeOpName(lead.expert || lead.vendedor || lead.operacao_id, lead.utm_source);

        unattendedList.push({
          id: String(lead.id || Math.random()),
          nome: lead.nome || "Lead Sem Nome",
          telefone: lead.telefone || "(WhatsApp)",
          operacao: opName,
          vendedor: lead.vendedor || "Pendente",
          tempoEsperaMin: isNaN(tempoEsperaMin) ? 1 : tempoEsperaMin,
        });
      }
    }

    // Sort unattended leads by longest wait time
    unattendedList.sort((a, b) => b.tempoEsperaMin - a.tempoEsperaMin);

    // Real X1 Events from today's DB records
    const x1Events: Array<{ id: string; timestamp: string; tipo: string; titulo: string; descricao: string; operacao?: string; valor?: number; vendedor?: string }> = [];

    for (const v of vendasToday.slice(0, 10)) {
      const d = v.Data ? new Date(v.Data) : new Date();
      const isValidDate = !isNaN(d.getTime());
      const timeStr = isValidDate
        ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
        : "00:00";
      const val = parseTicket(v.Ticket);
      const opName = v.nome_expert || classifyOpByUtm(v.UTM) || "X1";
      x1Events.push({
        id: `venda-${v["ID de Referência"] || Math.random()}`,
        timestamp: timeStr,
        tipo: "venda_aprovada",
        titulo: `💰 Venda Aprovada R$ ${val.toLocaleString("pt-BR")}`,
        descricao: `Venda efetuada na Operação ${opName} (${v.Produto || "Produto X1"})`,
        operacao: opName,
        valor: val,
      });
    }

    for (const l of leadsToday.slice(0, 10)) {
      const d = l.created_at || l.data_criacao ? new Date(l.created_at || l.data_criacao) : new Date();
      const isValidDate = !isNaN(d.getTime());
      const timeStr = isValidDate
        ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
        : "00:00";
      const opName = normalizeOpName(l.expert || l.vendedor || l.operacao_id, l.utm_source);
      x1Events.push({
        id: `lead-${l.id || Math.random()}`,
        timestamp: timeStr,
        tipo: "lead_chegou",
        titulo: "📥 Novo Lead no Funil X1",
        descricao: `Lead ${l.nome || "Novo Lead"} (${l.telefone || "WhatsApp"}) entrou na Operação ${opName}`,
        operacao: opName,
      });
    }

    // Sort X1 events by timestamp descending safely
    x1Events.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));

    // ── 2. Filtra Operação High Ticket de HOJE ──
    const htVendasToday = htVendasAll.filter((v) => isRecordFromToday(v.data, todayStr));
    const vendasHtCount = htVendasToday.length;
    const htRevenueToday = htVendasToday.reduce((a, v) => a + (parseFloat(v.valor_total) || 0), 0);

    // Leads Qualificados do Quiz que ENTRARAM HOJE (combina todas as fontes do Quiz + SDR manual)
    const allQuizCombined: any[] = [];
    const seenQuizIds = new Set<string>();
    const addQuizList = (list: any[]) => {
      for (const item of list || []) {
        if (!item) continue;
        const idStr = String(item.id || item.user_id || "").trim();
        const dateStr = item.created_at || item.data_criacao || item.received_at;
        if (idStr && !seenQuizIds.has(idStr)) {
          seenQuizIds.add(idStr);
          allQuizCombined.push({ ...item, created_at: dateStr });
        }
      }
    };
    addQuizList(quizAll);
    addQuizList(htQuizAll);
    addQuizList(htLeadsAll);
    addQuizList(extQuizLeadsAll);

    // Helper para verificar qualificação real do High Ticket (Kanban SDR + Caixa D/E/F/G + Faturamento)
    const kanbanLeadIdsSet = new Set<string>();
    for (const kb of htKanbanAll) {
      if (kb.lead_id) kanbanLeadIdsSet.add(String(kb.lead_id).trim().toLowerCase());
    }

    function isHtQuizQualified(q: any): boolean {
      if (!q) return false;

      // 1. Se o lead está no Kanban do SDR, ele É QUALIFICADO!
      const rawId = String(q.id || q.user_id || "").trim().toLowerCase();
      const phone = String(q.whatsapp || q.telefone || "").replace(/\D/g, "");
      const email = String(q.email || "").trim().toLowerCase();

      if (rawId && (kanbanLeadIdsSet.has(rawId) || kanbanLeadIdsSet.has(`htq:${rawId}`) || kanbanLeadIdsSet.has(rawId.replace(/^htq:/i, "")))) {
        return true;
      }
      if (phone && kanbanLeadIdsSet.has(phone)) return true;
      if (email && kanbanLeadIdsSet.has(email)) return true;

      // 2. Checa a regra de Caixa (Tier D, E, F, G)
      const caixaLetra = String(q.caixa_letra || q.respostas?.caixa_letra || q.respostas?.caixa_letra_calculada || "").trim().toUpperCase();
      if (["D", "E", "F", "G"].includes(caixaLetra)) {
        return true;
      }

      // 3. Checa a regra de Faturamento (>= R$ 10k / mês)
      const fat = String(q.faturamento_mensal || q.faturamento || q.respostas?.faturamento || "").toLowerCase();
      if (fat) {
        if (/10k|25k|30k|50k|100k|200k|500k|1m|milhões|milhoes/i.test(fat)) return true;
        if (/10\.000|25\.000|30\.000|50\.000|100\.000/i.test(fat)) return true;
        if (fat.includes("acima de") || fat.includes("mais de 10") || fat.includes("50 mil") || fat.includes("100 mil")) return true;
      }

      // 4. Checa o valor de Investir / Caixa Label
      const investir = String(q.investir || q.respostas?.investir || q.caixa_label || "").toLowerCase();
      if (/5k|10k|25k|50k|100k|10\.000|25\.000|50\.000|100\.000/i.test(investir)) {
        if (!investir.includes("menos de 1.000") && !investir.includes("1.000 a 5.000") && !investir.includes("1k–5k") && !investir.includes("até r$ 1k")) {
          return true;
        }
      }

      return false;
    }

    // Leads Qualificados High Ticket de HOJE (Quiz + HT Leads + SDR Kanban)
    const seenHtLeadIds = new Set<string>();
    let qualifiedLeadsCount = 0;

    const quizToday = allQuizCombined.filter((q) => isRecordFromToday(q.created_at || q.received_at, todayStr));

    for (const q of quizToday) {
      const idStr = String(q.id || q.user_id || q.whatsapp || q.email || "").trim().toLowerCase();
      if (!idStr || seenHtLeadIds.has(idStr)) continue;

      if (isHtQuizQualified(q)) {
        seenHtLeadIds.add(idStr);
        qualifiedLeadsCount++;
      }
    }

    for (const kb of htKanbanAll) {
      if (isRecordFromToday(kb.updated_at, todayStr) && kb.lead_id) {
        const idStr = String(kb.lead_id).trim().toLowerCase();
        if (idStr && !seenHtLeadIds.has(idStr)) {
          seenHtLeadIds.add(idStr);
          qualifiedLeadsCount++;
        }
      }
    }

    // Estágios Kanban do SDR movimentados/arrastados HOJE
    let contact1Count = 0;
    let contact2Count = 0;
    let contact3Count = 0;
    let scheduledCount = 0;

    for (const kb of htKanbanAll) {
      const isUpdatedToday = isRecordFromToday(kb.updated_at, todayStr);
      const isScheduledToday = isRecordFromToday(kb.scheduled_at, todayStr);

      // Agendamentos: Reunião agendada HOJE pelo SDR
      if ((isUpdatedToday || isScheduledToday) && kb.scheduled_at) {
        scheduledCount++;
      }

      // Estágios arrastados pelo SDR HOJE
      if (isUpdatedToday) {
        if (kb.sdr_stage === "contato_1" || kb.sdr_stage === "abordagem") {
          contact1Count++;
        } else if (kb.sdr_stage === "contato_2" || kb.sdr_stage === "followup_1") {
          contact2Count++;
        } else if (kb.sdr_stage === "contato_3" || kb.sdr_stage === "followup_2") {
          contact3Count++;
        }
      }
    }

    const qualifiedLeadsToday = Math.max(qualifiedLeadsCount, scheduledCount);

    // Real HT Events & Sales Origin (Paid vs Organic)
    let paidSalesCount = 0;
    let organicSalesCount = 0;
    let paidSalesRevenue = 0;
    let organicSalesRevenue = 0;

    const htEvents: Array<{ id: string; timestamp: string; tipo: string; titulo: string; descricao: string; sdr?: string; closer?: string; valor?: number; horario?: string; origem?: string }> = [];

    for (const v of htVendasToday.slice(0, 15)) {
      const d = v.data ? new Date(v.data) : new Date();
      const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      const val = parseFloat(v.valor_total) || 0;
      const rawUtm = String(v.utm_source || v.origem || v.utm || "").toLowerCase();
      const isPaid = rawUtm.includes("fb") || rawUtm.includes("meta") || rawUtm.includes("ig") || rawUtm.includes("google") || rawUtm.includes("cpc") || rawUtm.includes("ads") || rawUtm.includes("pago");

      if (isPaid) {
        paidSalesCount++;
        paidSalesRevenue += val;
      } else {
        organicSalesCount++;
        organicSalesRevenue += val;
      }

      const origemText = isPaid ? "Tráfego Pago" : "Orgânico";

      htEvents.push({
        id: `ht-venda-${v.id || Math.random()}`,
        timestamp: timeStr,
        tipo: "venda_ht",
        titulo: `🎉 Venda High Ticket (${origemText})`,
        descricao: `Closer ${v.closer || "Gabriel"} fechou contrato de R$ ${val.toLocaleString("pt-BR")} com cliente ${v.cliente || "Qualificado"} · [${origemText}]`,
        closer: v.closer || "Gabriel",
        valor: val,
        origem: origemText,
      });
    }

    for (const q of quizToday.filter((q) => isHtQuizQualified(q)).slice(0, 10)) {
      const d = q.created_at ? new Date(q.created_at) : new Date();
      const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      htEvents.push({
        id: `quiz-${q.id || Math.random()}`,
        timestamp: timeStr,
        tipo: "lead_qualificado",
        titulo: "📋 Formulário HT Preenchido (Qualificado)",
        descricao: `Lead ${q.nome || "Qualificado"} (Fat: ${q.faturamento_mensal || q.faturamento || q.respostas?.faturamento || "R$ 10k+"}) preencheu formulário e foi qualificado`,
      });
    }

    const quizMapById = new Map<string, any>();
    const registerLead = (q: any) => {
      if (!q) return;
      const rawId = String(q.id || q.user_id || "").trim();
      if (rawId) {
        quizMapById.set(rawId, q);
        quizMapById.set(`htq:${rawId}`, q);
        quizMapById.set(rawId.replace(/^htq:/i, ""), q);
        if (rawId.length >= 8) {
          quizMapById.set(rawId.slice(0, 8), q);
          quizMapById.set(rawId.replace(/^htq:/i, "").slice(0, 8), q);
        }
      }
      if (q.whatsapp) {
        const digits = String(q.whatsapp).replace(/\D/g, "");
        if (digits) quizMapById.set(digits, q);
      }
    };

    for (const q of quizAll) registerLead(q);
    for (const q of htQuizAll) registerLead(q);
    for (const q of htLeadsAll) registerLead(q);
    for (const q of extQuizLeadsAll) registerLead(q);

    // ── 3. Agregado de Calls por Closer, Show-ups e No-shows de HOJE ──
    const closersMap = new Map<string, { callsToday: number; pendingToday: number; showUpsToday: number; noShowsToday: number; followupToday: number; remarcadaToday: number; descartadoToday: number }>();
    const scheduledCallsToday: Array<{
      id: string;
      horario: string;
      leadName: string;
      closerName: string;
      status: "show_up" | "no_show" | "pendente" | "followup" | "remarcada" | "descartado";
      stageRaw?: string;
      leadData?: any;
    }> = [];

    let showUpsCountToday = 0;
    let noShowsCountToday = 0;

    // Tenta buscar eventos do Google Calendar oficial de HOJE
    let gcalEventsToday: any[] = [];
    try {
      const { gcal } = await import("@/lib/google-calendar.functions");
      const res = await gcal("/events?singleEvents=true&orderBy=startTime&maxResults=250");
      if (res?.items && Array.isArray(res.items)) {
        gcalEventsToday = res.items.filter((ev: any) => {
          const d = ev.start?.dateTime || ev.start?.date;
          return d && toSpDateString(d) === todayStr;
        });
      }
    } catch (err) {
      console.warn("[LiveMonitoring] Google Calendar fetch skipped:", err);
    }

    if (gcalEventsToday.length > 0) {
      // Usa os eventos reais do Google Calendar como fonte primária da agenda de HOJE
      for (const ev of gcalEventsToday) {
        const d = new Date(ev.start.dateTime || ev.start.date);
        const horaStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

        let guestEmail = "";
        let guestName = "";
        if (ev.attendees && Array.isArray(ev.attendees)) {
          for (const att of ev.attendees) {
            if (!att.email) continue;
            if (att.organizer || att.self || att.email.includes("calendar.google") || att.email.endsWith(".gserviceaccount.com")) continue;
            guestEmail = att.email.trim();
            if (att.displayName) guestName = att.displayName.trim();
            break;
          }
        }

        let closerName = "Nicolas";
        const titleLower = (ev.summary || "").toLowerCase();
        if (titleLower.includes("pavanello")) closerName = "Pavanello";
        else if (titleLower.includes("nicolas")) closerName = "Nicolas";
        else if (titleLower.includes("gabriel")) closerName = "Gabriel";
        else if (titleLower.includes("vitor") || titleLower.includes("victor")) closerName = "Vitor";
        else if (ev.attendees) {
          for (const att of ev.attendees) {
            const em = (att.email || "").toLowerCase();
            if (em.includes("nicolas")) closerName = "Nicolas";
            else if (em.includes("pavanello")) closerName = "Pavanello";
            else if (em.includes("gabriel")) closerName = "Gabriel";
          }
        }

        const quizLead = guestEmail ? quizMapById.get(guestEmail) : null;
        const realLeadName = guestName || quizLead?.nome || quizLead?.display_name || ev.summary || "Lead Agendado";

        let callStatus: "show_up" | "no_show" | "pendente" | "followup" | "remarcada" | "descartado" = "pendente";
        let matchingKb: any = null;
        if (quizLead?.id) {
          matchingKb = htKanbanAll.find((k: any) => String(k.lead_id) === String(quizLead.id) || String(k.lead_id) === `htq:${quizLead.id}`);
        }
        if (matchingKb) {
          const st = String(matchingKb.closer_stage || matchingKb.sdr_stage || "").toLowerCase();
          if (st.includes("show") || st.includes("compareceu") || st.includes("realizada") || st.includes("venda") || st.includes("fechado") || st.includes("ganho")) callStatus = "show_up";
          else if (st.includes("no_show") || st.includes("falta")) callStatus = "no_show";
          else if (st.includes("follow")) callStatus = "followup";
          else if (st.includes("remarc")) callStatus = "remarcada";
          else if (st.includes("descart") || st.includes("fake")) callStatus = "descartado";
        }

        const capitalizedCloser = closerName.charAt(0).toUpperCase() + closerName.slice(1);
        if (!closersMap.has(capitalizedCloser)) {
          closersMap.set(capitalizedCloser, { callsToday: 0, pendingToday: 0, showUpsToday: 0, noShowsToday: 0, followupToday: 0, remarcadaToday: 0, descartadoToday: 0 });
        }
        const closerStats = closersMap.get(capitalizedCloser)!;
        closerStats.callsToday++;
        if (callStatus === "show_up") { closerStats.showUpsToday++; showUpsCountToday++; }
        else if (callStatus === "no_show") { closerStats.noShowsToday++; noShowsCountToday++; }
        else if (callStatus === "followup") closerStats.followupToday++;
        else if (callStatus === "remarcada") closerStats.remarcadaToday++;
        else if (callStatus === "descartado") closerStats.descartadoToday++;
        else closerStats.pendingToday++;

        const leadData = {
          id: quizLead?.id || ev.id,
          nome: realLeadName,
          email: guestEmail || quizLead?.email || null,
          whatsapp: quizLead?.whatsapp || null,
          instagram: quizLead?.instagram || null,
          caixa_letra: quizLead?.caixa_letra || null,
          caixa_label: quizLead?.caixa_label || null,
          faturamento: quizLead?.faturamento_mensal || null,
          momento: quizLead?.momento || null,
          objetivo: quizLead?.objetivo || null,
          investir: quizLead?.investir || null,
          respostas: quizLead?.respostas || null,
          crm_status: matchingKb?.closer_stage || "agendado",
          crm_data_agendamento: ev.start.dateTime || ev.start.date,
        };

        scheduledCallsToday.push({
          id: ev.id,
          horario: horaStr,
          leadName: realLeadName,
          closerName: capitalizedCloser,
          status: callStatus,
          stageRaw: matchingKb?.closer_stage || "agendado",
          leadData,
        });
      }
    } else {
      // Fallback: filtra rigorosamente htKanbanAll apenas para leads com agendamento ativo e válido de hoje
      for (const kb of htKanbanAll) {
        const isSchedToday = kb.scheduled_at ? toSpDateString(kb.scheduled_at) === todayStr : false;
        const isUpdToday = toSpDateString(kb.updated_at) === todayStr;

        if (!isSchedToday && !isUpdToday) continue;
        if (!kb.closer_email && !isSchedToday) continue;
        if (kb.is_fake) continue;

        const stageLower = String(kb.closer_stage || kb.sdr_stage || "").toLowerCase();

        // Se estiver em estágio inicial (novos, c1) sem ter sido agendado, pula
        if (stageLower === "novos" || stageLower === "c1") continue;

        const rawCloser = String(kb.closer_email || kb.closer_name || "Gabriel").trim();
        const closerName = rawCloser.includes("@") ? rawCloser.split("@")[0] : rawCloser;
        const capitalizedCloser = closerName.charAt(0).toUpperCase() + closerName.slice(1);

        if (!closersMap.has(capitalizedCloser)) {
          closersMap.set(capitalizedCloser, { callsToday: 0, pendingToday: 0, showUpsToday: 0, noShowsToday: 0, followupToday: 0, remarcadaToday: 0, descartadoToday: 0 });
        }
        const closerStats = closersMap.get(capitalizedCloser)!;
        if (isSchedToday) closerStats.callsToday++;

        let callStatus: "show_up" | "no_show" | "pendente" | "followup" | "remarcada" | "descartado" = "pendente";
        const rawLeadId = String(kb.lead_id || "").trim();
        const quizLead = quizMapById.get(rawLeadId) || quizMapById.get(rawLeadId.replace(/^htq:/i, "")) || quizMapById.get(rawLeadId.slice(0, 8));
        const realLeadName = quizLead?.nome || quizLead?.display_name || quizLead?.respostas?.nome || `Lead ${rawLeadId.slice(0, 8) || "Qualificado"}`;

        if (stageLower.includes("show") || stageLower.includes("compareceu") || stageLower.includes("realizada") || stageLower.includes("venda") || stageLower.includes("fechado") || stageLower.includes("ganho")) {
          callStatus = "show_up";
          if (isSchedToday || isUpdToday) {
            closerStats.showUpsToday++;
            showUpsCountToday++;
          }
        } else if (stageLower.includes("no_show") || stageLower.includes("falta") || stageLower.includes("nao_compareceu")) {
          callStatus = "no_show";
          if (isSchedToday || isUpdToday) {
            closerStats.noShowsToday++;
            noShowsCountToday++;
          }
        } else if (stageLower.includes("follow") || stageLower.includes("c2")) {
          callStatus = "followup";
          if (isSchedToday) closerStats.followupToday++;
        } else if (stageLower.includes("remarcad") || stageLower.includes("reagend")) {
          callStatus = "remarcada";
          if (isSchedToday) closerStats.remarcadaToday++;
        } else if (stageLower.includes("descartad") || stageLower.includes("fake") || stageLower.includes("lost")) {
          callStatus = "descartado";
          if (isSchedToday) closerStats.descartadoToday++;
        } else {
          callStatus = "pendente";
          if (isSchedToday) closerStats.pendingToday++;
        }

        if (isSchedToday) {
          const schedDate = kb.scheduled_at ? new Date(kb.scheduled_at) : new Date();
          const horaStr = schedDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

          const leadData = {
            id: rawLeadId,
            nome: realLeadName,
            email: quizLead?.email || quizLead?.respostas?.email || null,
            whatsapp: quizLead?.whatsapp || quizLead?.respostas?.whatsapp || null,
            instagram: quizLead?.instagram || quizLead?.respostas?.instagram || null,
            caixa_letra: quizLead?.caixa_letra || quizLead?.respostas?.caixa_letra || null,
            caixa_label: quizLead?.caixa_label || quizLead?.respostas?.caixa_label || null,
            faturamento: quizLead?.faturamento_mensal || quizLead?.faturamento || quizLead?.respostas?.faturamento || null,
            momento: quizLead?.momento || quizLead?.respostas?.momento || null,
            objetivo: quizLead?.objetivo || quizLead?.respostas?.objetivo || null,
            investir: quizLead?.investir || quizLead?.respostas?.investir || null,
            minicurso: quizLead?.minicurso || quizLead?.respostas?.minicurso || null,
            socio: quizLead?.socio || quizLead?.respostas?.socio || null,
            comprometimento: quizLead?.comprometimento || quizLead?.respostas?.comprometimento || null,
            utm_source: quizLead?.utm_source || quizLead?.respostas?.utm_source || null,
            utm_medium: quizLead?.utm_medium || quizLead?.respostas?.utm_medium || null,
            utm_campaign: quizLead?.utm_campaign || quizLead?.respostas?.utm_campaign || null,
            data_criacao: quizLead?.created_at || quizLead?.data_criacao || quizLead?.received_at || kb.scheduled_at || kb.updated_at,
            crm_status: kb.closer_stage || kb.sdr_stage || null,
            crm_data_agendamento: kb.scheduled_at || null,
            respostas: quizLead?.respostas || quizLead?.respostas_json || quizLead || null,
          };

          scheduledCallsToday.push({
            id: String(kb.lead_id || Math.random()),
            horario: horaStr !== "Invalid Date" ? horaStr : "14:00",
            leadName: realLeadName,
            closerName: capitalizedCloser,
            status: callStatus,
            stageRaw: kb.closer_stage || kb.sdr_stage || "agendado",
            leadData,
          });
        }
      }
    }

    // Sort calls by time
    scheduledCallsToday.sort((a, b) => a.horario.localeCompare(b.horario));
    scheduledCount = scheduledCallsToday.length;

    const closersSummary = Array.from(closersMap.entries()).map(([name, stats]) => ({
      name,
      ...stats,
    }));

    htEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Traffic Spend & Paid ROAS Calculation for TODAY strictly (Meta Ads API + Financeiro fallback)
    let metaAdsTodaySpend = 0;
    try {
      const token = process.env.META_ADS_SYSTEM_USER_TOKEN;
      const rawAcc = process.env.META_ADS_ACCOUNT_ID;
      if (token && rawAcc) {
        const accountId = rawAcc.startsWith("act_") ? rawAcc : `act_${rawAcc}`;
        const url = new URL(`https://graph.facebook.com/v21.0/${accountId}/insights`);
        url.searchParams.set("access_token", token);
        url.searchParams.set("date_preset", "today");
        url.searchParams.set("fields", "spend");
        const res = await fetch(url.toString());
        const json: any = await res.json();
        if (res.ok && Array.isArray(json?.data) && json.data.length > 0) {
          metaAdsTodaySpend = parseFloat(json.data[0].spend || 0);
        }
      }
    } catch (e) {
      console.warn("[getLiveMonitoringTodayStats] Erro ao buscar Meta Ads spend de hoje:", e);
    }

    const todayAdsGastos = (financeiroRes.data ?? [])
      .filter((f: any) => {
        if (toSpDateString(f.data_ref) !== todayStr) return false;
        const tipo = String(f.tipo ?? "").toLowerCase();
        return tipo.includes("ads") || tipo.includes("facebook") || tipo.includes("meta") || tipo.includes("trafego") || tipo.includes("gasto");
      })
      .reduce((a: number, f: any) => a + Number(f.valor || 0), 0);

    const gastoTotal = metaAdsTodaySpend > 0 ? metaAdsTodaySpend : todayAdsGastos;
    const cpl = qualifiedLeadsToday > 0 ? Number((gastoTotal / qualifiedLeadsToday).toFixed(2)) : 0;
    const costPerMeeting = scheduledCount > 0 ? Number((gastoTotal / scheduledCount).toFixed(2)) : 0;
    // ROAS is ONLY calculated from paid traffic sales revenue divided by paid ads spend
    const roas = (gastoTotal > 0 && paidSalesRevenue > 0)
      ? Number((paidSalesRevenue / gastoTotal).toFixed(1))
      : 0;

    return {
      todayStr,
      x1: {
        totalLeadsToday,
        leadsByOp,
        unattendedLeadsCount,
        inProgressCount,
        approvedSalesCount,
        totalRevenueToday,
        unattendedList,
        recentEvents: x1Events,
      },
      ht: {
        totalQuizSubmissionsToday: quizToday.length,
        pctQualifiedToday: quizToday.length > 0 ? Math.min(100, Math.round((qualifiedLeadsToday / quizToday.length) * 100)) : 0,
        qualifiedLeadsToday,
        contact1Count,
        contact2Count,
        contact3Count,
        scheduledCount,
        vendasHtCount,
        revenueToday: htRevenueToday,
        closersSummary,
        scheduledCallsToday,
        showUpsCountToday,
        noShowsCountToday,
        salesOriginBreakdown: {
          paidCount: paidSalesCount,
          organicCount: organicSalesCount,
          paidRevenue: paidSalesRevenue,
          organicRevenue: organicSalesRevenue,
        },
        trafficSpendToday: { gastoTotal, cpl, costPerMeeting, roas },
        recentEvents: htEvents,
      },
    };
  });

