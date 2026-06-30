import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/** Aceita "YYYY-MM-DD", "DD-MM-YYYY", "DD/MM/YYYY" → epoch ms (UTC) ou null. */
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
};

export type DateRange = { from?: string | null; to?: string | null; expert?: string | null };

const CAIO_UTMS = ["GC", "BP"];
const GUSTAVO_UTMS = ["LS", "LF"];

async function dbFor(context: any) {
  if (context?.vendor && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
  }
  return context.supabase as any;
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

    const [expertsRes, vendedoresRes, produtosMapRes, vendasAll, reembolsosAll, financeiroAll] = await Promise.all([
      supabase.from("experts").select("id, nome, foto_url, ativo").eq("ativo", true),
      supabase.from("vendedores").select("utm, nome, expert, foto_url, ativo"),
      supabase.from("produtos_map").select("nome_produto, nome_expert, tipo_produto"),
      fetchAll<any>((from, to) =>
        supabase
          .from("vendas")
          .select('"Ticket", nome_expert, tipo_produto, "Data", "ID de Referência", "UTM", "Produto", "Evento"')
          .or('Evento.eq.purchase_approved,Evento.ilike.*aprov*')
          .range(from, to),
      ),
      fetchAll<any>((from, to) =>
        supabase.from("reembolsos").select('"ID da Venda", "Data do Reembolso", "Data da Venda", "Produto", "Nome do Cliente", "Valor Base do Produto", "Tipo da Venda", utm_source').range(from, to),
      ),
      fetchAll<any>((from, to) =>
        supabase.from("financeiro").select("valor, tipo, data_ref").range(from, to),
      ),
    ]);

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

    const gastosMes = financeiroAll
      .filter((f: any) => {
        const tipo = String(f.tipo ?? "").toLowerCase();
        return (tipo === "gasto" || tipo === "saida" || tipo === "despesa") && inRange(parseDataField(f.data_ref));
      })
      .reduce((acc, f: any) => acc + Number(f.valor ?? 0), 0);

    const totalFaturamento = vendasScoped.reduce((acc, v: any) => acc + parseTicket(v.Ticket), 0);
    const totalVendas = vendasScoped.length;

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
      const totalFatPeriodo = vendasPeriodo.reduce((a, v: any) => a + parseTicket(v.Ticket), 0);
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
    };
  });

