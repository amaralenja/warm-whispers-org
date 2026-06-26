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

/** "YYYY-MM-DD" ou "DD/MM/YYYY" ou "DD-MM-YYYY" → "YYYY-MM-DD" */
function normalizeIsoDate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function isoToTs(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

function shiftIso(iso: string, days: number): string {
  const t = isoToTs(iso) + days * 86400_000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export type RelatoriosPayload = {
  from: string;
  to: string;
  daysElapsed: number;
  sumPeriod: number;
  sumPrevPeriod: number;
  periodDiffPct: number;
  vendasPeriod: number;
  ticketMedioPeriod: number;
  sumWow: number;
  sumPrevWow: number;
  wowDiffPct: number;
  projectedMonth: number;
  daysInMonth: number;
  serieDaily: { data: string; total: number }[]; // últimos 30 dias
  topVendedores: { utm: string; total: number; pct: number }[];
  expertBreakdown: { nome: string; total: number; pct: number }[];
  topVendedor: { utm: string; total: number; pct: number } | null;
  insights: { tone: "positivo" | "alerta" | "neutro" | "destaque"; icon: string; title: string; text: string }[];
};

export type RelatoriosInput = { from?: string | null; to?: string | null; expert?: string | null };

export const getRelatoriosStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RelatoriosInput | undefined) => input ?? {})
  .handler(async (opts): Promise<RelatoriosPayload> => {
    const context = opts?.context;
    if (!context?.supabase) throw new Error("Sessão Supabase indisponível");
    const { supabase } = context;
    const data = opts.data ?? {};

    // default: mês atual
    const today = new Date();
    const defFrom = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const defTo = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    const from = data.from ?? defFrom;
    const to = data.to ?? defTo;
    const expertFilter = data.expert && data.expert !== "all" ? data.expert : null;

    // pagina vendas aprovadas
    const PAGE = 1000;
    const sales: any[] = [];
    for (let i = 0; ; i++) {
      const { data: rows, error } = await supabase
        .from("vendas")
        .select('"Data","Ticket","UTM",nome_expert,"Produto","Evento"')
        .or("Evento.eq.purchase_approved,Evento.ilike.*aprov*")
        .range(i * PAGE, i * PAGE + PAGE - 1);
      if (error) throw error;
      const list = (rows ?? []) as any[];
      sales.push(...list);
      if (list.length < PAGE) break;
    }

    // map produto -> expert (sobrescreve nome_expert)
    const { data: prodMapRows } = await supabase
      .from("produtos_map")
      .select("nome_produto,nome_expert");
    const prodMap = new Map<string, string>();
    for (const p of (prodMapRows ?? []) as any[]) {
      const k = String(p.nome_produto ?? "").trim().toLowerCase();
      const e = String(p.nome_expert ?? "").trim();
      if (k && e) prodMap.set(k, e);
    }

    // enriquece e filtra por expert
    const enriched = sales
      .map((v) => {
        const iso = normalizeIsoDate(v.Data);
        if (!iso) return null;
        const prodKey = String(v.Produto ?? "").trim().toLowerCase();
        const expert = prodMap.get(prodKey) ?? v.nome_expert ?? null;
        return { iso, ts: isoToTs(iso), ticket: parseTicket(v.Ticket), utm: String(v.UTM ?? "").toUpperCase() || "SEM_UTM", expert };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .filter((v) => !expertFilter || v.expert === expertFilter);

    const fromTs = isoToTs(from);
    const toTs = isoToTs(to);
    const daysElapsed = Math.max(1, Math.round((toTs - fromTs) / 86400_000) + 1);

    const prevTo = shiftIso(from, -1);
    const prevFrom = shiftIso(prevTo, -(daysElapsed - 1));
    const prevFromTs = isoToTs(prevFrom);
    const prevToTs = isoToTs(prevTo);

    const inRange = (ts: number, a: number, b: number) => ts >= a && ts <= b;

    const periodSales = enriched.filter((v) => inRange(v.ts, fromTs, toTs));
    const prevSales = enriched.filter((v) => inRange(v.ts, prevFromTs, prevToTs));

    const sumPeriod = periodSales.reduce((a, v) => a + v.ticket, 0);
    const sumPrevPeriod = prevSales.reduce((a, v) => a + v.ticket, 0);
    const periodDiffPct = sumPrevPeriod > 0 ? ((sumPeriod - sumPrevPeriod) / sumPrevPeriod) * 100 : sumPeriod > 0 ? 100 : 0;
    const vendasPeriod = periodSales.length;
    const ticketMedioPeriod = vendasPeriod > 0 ? sumPeriod / vendasPeriod : 0;

    // WoW: últimos 7d dentro do período vs 7 dias anteriores
    const wowTo = to;
    const wowFrom = shiftIso(wowTo, -6);
    const wowToTs = isoToTs(wowTo);
    const wowFromTs = isoToTs(wowFrom);
    const prevWowTo = shiftIso(wowFrom, -1);
    const prevWowFrom = shiftIso(prevWowTo, -6);
    const wowSales = enriched.filter((v) => inRange(v.ts, wowFromTs, wowToTs));
    const prevWowSales = enriched.filter((v) => inRange(v.ts, isoToTs(prevWowFrom), isoToTs(prevWowTo)));
    const sumWow = wowSales.reduce((a, v) => a + v.ticket, 0);
    const sumPrevWow = prevWowSales.reduce((a, v) => a + v.ticket, 0);
    const wowDiffPct = sumPrevWow > 0 ? ((sumWow - sumPrevWow) / sumPrevWow) * 100 : sumWow > 0 ? 100 : 0;

    // Projeção do mês: média diária × dias do mês
    const toDate = new Date(toTs);
    const daysInMonth = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() + 1, 0)).getUTCDate();
    const dailyAvg = sumPeriod / daysElapsed;
    const projectedMonth = sumPeriod + dailyAvg * Math.max(0, daysInMonth - daysElapsed);

    // série diária (últimos 30 dias até `to`)
    const serieMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      serieMap.set(shiftIso(to, -i), 0);
    }
    for (const v of enriched) {
      if (serieMap.has(v.iso)) serieMap.set(v.iso, (serieMap.get(v.iso) ?? 0) + v.ticket);
    }
    const serieDaily = Array.from(serieMap, ([data, total]) => ({ data, total }));

    // top vendedores (do período)
    const vendMap = new Map<string, number>();
    for (const v of periodSales) vendMap.set(v.utm, (vendMap.get(v.utm) ?? 0) + v.ticket);
    const topVendedores = Array.from(vendMap, ([utm, total]) => ({ utm, total, pct: sumPeriod > 0 ? (total / sumPeriod) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    const topVendedor = topVendedores[0] ?? null;

    // breakdown por expert
    const expMap = new Map<string, number>();
    for (const v of periodSales) {
      const k = v.expert ?? "Sem expert";
      expMap.set(k, (expMap.get(k) ?? 0) + v.ticket);
    }
    const expertBreakdown = Array.from(expMap, ([nome, total]) => ({ nome, total, pct: sumPeriod > 0 ? (total / sumPeriod) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);

    // insights heurísticos
    const insights: RelatoriosPayload["insights"] = [];
    if (periodDiffPct >= 10) {
      insights.push({ tone: "positivo", icon: "🚀", title: "Operação acelerada", text: `Faturamento cresceu ${periodDiffPct.toFixed(1)}% vs os ${daysElapsed} dias anteriores. Mantém o ritmo.` });
    } else if (periodDiffPct <= -10) {
      insights.push({ tone: "alerta", icon: "⚠️", title: "Alerta de queda", text: `${Math.abs(periodDiffPct).toFixed(1)}% abaixo do período anterior (R$ ${sumPrevPeriod.toFixed(0)}).` });
    } else {
      insights.push({ tone: "neutro", icon: "⚖️", title: "Ritmo estável", text: `Variação de ${periodDiffPct.toFixed(1)}% vs o período anterior.` });
    }
    if (wowDiffPct >= 15) {
      insights.push({ tone: "positivo", icon: "🔥", title: "Destaque na semana", text: `Últimos 7 dias ${wowDiffPct.toFixed(1)}% acima da semana anterior.` });
    } else if (wowDiffPct <= -15) {
      insights.push({ tone: "alerta", icon: "📉", title: "Atenção na semana", text: `Últimos 7 dias caíram ${Math.abs(wowDiffPct).toFixed(1)}% vs a semana anterior.` });
    }
    if (topVendedor && topVendedor.total > 0) {
      insights.push({ tone: "destaque", icon: "🏆", title: "Melhor vendedor", text: `${topVendedor.utm} respondeu por ${topVendedor.pct.toFixed(1)}% do faturamento (R$ ${topVendedor.total.toFixed(0)}).` });
    }
    if (expertBreakdown.length > 1) {
      const lider = expertBreakdown[0];
      insights.push({ tone: "destaque", icon: "🎯", title: "Operação líder", text: `${lider.nome} concentra ${lider.pct.toFixed(1)}% do bruto do período.` });
    }

    return {
      from, to, daysElapsed,
      sumPeriod, sumPrevPeriod, periodDiffPct,
      vendasPeriod, ticketMedioPeriod,
      sumWow, sumPrevWow, wowDiffPct,
      projectedMonth, daysInMonth,
      serieDaily, topVendedores, expertBreakdown, topVendedor,
      insights,
    };
  });
