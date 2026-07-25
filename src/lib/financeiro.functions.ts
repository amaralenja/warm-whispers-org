import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Lancamento = {
  id: number;
  tipo: "gasto" | "receita";
  categoria: string;
  descricao: string;
  valor: number;
  data_ref: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  recorrente: boolean;
  status: "pendente" | "pago" | "atrasado";
  responsavel: string | null;
  obs: string | null;
};

export const listLancamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (opts): Promise<Lancamento[]> => {
    const context = opts?.context;
    if (!context?.supabase) throw new Error("Sessão Supabase indisponível");
    const { data, error } = await context.supabase
      .from("financeiro")
      .select("*")
      .order("data_ref", { ascending: false })
      .limit(2000);
    if (error) throw error;
    return (data ?? []) as Lancamento[];
  });

const lancamentoInput = z.object({
  tipo: z.enum(["gasto", "receita"]),
  categoria: z.string().min(1).max(50),
  descricao: z.string().trim().min(1).max(200),
  valor: z.number().nonnegative(),
  data_ref: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  data_pagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  recorrente: z.boolean().default(false),
  status: z.enum(["pendente", "pago", "atrasado"]).default("pendente"),
  responsavel: z.string().max(100).nullable().optional(),
  obs: z.string().max(500).nullable().optional(),
});

export const upsertLancamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.number().int().positive().optional(), data: lancamentoInput }).parse(input),
  )
  .handler(async (opts) => {
    const context = opts?.context;
    const data = opts?.data;
    if (!context?.supabase || !data) throw new Error("Sessão Supabase indisponível");
    if (data.id) {
      const { error } = await context.supabase
        .from("financeiro")
        .update(data.data)
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("financeiro")
      .insert(data.data)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as number };
  });

export const deleteLancamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.number().int().positive() }).parse(input))
  .handler(async (opts) => {
    const context = opts?.context;
    const data = opts?.data;
    if (!context?.supabase || !data) throw new Error("Sessão Supabase indisponível");
    const { error } = await context.supabase.from("financeiro").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============================================================
// RELATÓRIOS & DRE
// ============================================================

function parseTicket(raw: unknown): number {
  if (raw == null) return 0;
  let s = String(raw).replace(/R\$\s?/g, "").replace(/\s/g, "").trim();
  const hasDot = s.includes("."), hasComma = s.includes(",");
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

function normalizeIsoDate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export type MesPonto = { mes: string; receita: number; gasto: number; saldo: number };
export type CategoriaBreakdown = { categoria: string; total: number; count: number; pct: number };
export type FixoItem = { id: number; descricao: string; categoria: string; valor: number };

export type RelatorioPayload = {
  trend: MesPonto[];
  breakdown: CategoriaBreakdown[];
  fixos: FixoItem[];
  totalFixos: number;
};

export function getRowsForMonth(all: Lancamento[], mesStr: string): Lancamento[] {
  const directRows = all.filter((r) => (r.data_ref || "").slice(0, 7) === mesStr);
  const directKeys = new Set(directRows.map((r) => `${r.tipo}|${r.categoria}|${(r.descricao || "").toLowerCase().trim()}`));

  const recurringRows: Lancamento[] = [];
  const handledRecurringKeys = new Set<string>();

  all.forEach((r) => {
    if (!r.recorrente) return;
    const refMes = (r.data_ref || "").slice(0, 7);
    if (refMes < mesStr) {
      const key = `${r.tipo}|${r.categoria}|${(r.descricao || "").toLowerCase().trim()}`;
      if (!directKeys.has(key) && !handledRecurringKeys.has(key)) {
        handledRecurringKeys.add(key);
        recurringRows.push({
          ...r,
          data_ref: `${mesStr}-01`,
        });
      }
    }
  });

  return [...directRows, ...recurringRows];
}

export const getFinanceiroRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mes?: string } | undefined) => input ?? {})
  .handler(async (opts): Promise<RelatorioPayload> => {
    const context = opts?.context;
    const data = opts?.data ?? {};
    if (!context?.supabase) throw new Error("Sessão Supabase indisponível");
    const refMes = data.mes ?? new Date().toISOString().slice(0, 7);
    const [{ data: rows, error }, { data: vendasRows }, { data: htRows }] = await Promise.all([
      context.supabase
        .from("financeiro")
        .select("*")
        .order("data_ref", { ascending: false })
        .limit(5000),
      context.supabase
        .from("vendas")
        .select('Ticket, Data, Evento')
        .or("Evento.eq.purchase_approved,Evento.ilike.*aprov*"),
      context.supabase
        .from("ht_vendas")
        .select("valor_total, data, status")
        .neq("status", "reembolso"),
    ]);
    if (error) throw error;
    const all = (rows ?? []) as Lancamento[];

    const salesByMonth = new Map<string, number>();
    ((vendasRows ?? []) as any[]).forEach((v) => {
      const iso = normalizeIsoDate(v.Data);
      if (!iso) return;
      const m = iso.slice(0, 7);
      salesByMonth.set(m, (salesByMonth.get(m) || 0) + parseTicket(v.Ticket));
    });
    ((htRows ?? []) as any[]).forEach((v) => {
      const iso = normalizeIsoDate(v.data);
      if (!iso) return;
      const m = iso.slice(0, 7);
      salesByMonth.set(m, (salesByMonth.get(m) || 0) + (parseFloat(v.valor_total) || 0));
    });

    // Trend últimos 6 meses (com receita das vendas + lançamentos manuais e gastos com recorrência)
    const trend: MesPonto[] = [];
    const ref = new Date(refMes + "-01T00:00:00");
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const mRows = getRowsForMonth(all, mes);
      const manualReceita = mRows.filter((r) => r.tipo === "receita").reduce((s, x) => s + (+x.valor || 0), 0);
      const salesReceita = salesByMonth.get(mes) || 0;
      const receita = manualReceita + salesReceita;
      const gasto = mRows.filter((r) => r.tipo === "gasto").reduce((s, x) => s + (+x.valor || 0), 0);
      trend.push({ mes, receita, gasto, saldo: receita - gasto });
    }

    // Breakdown categoria do mês (com recorrência acumulada)
    const mesRows = getRowsForMonth(all, refMes).filter((r) => r.tipo === "gasto");
    const totalMes = mesRows.reduce((s, x) => s + (+x.valor || 0), 0);
    const catMap = new Map<string, { total: number; count: number }>();
    mesRows.forEach((r) => {
      const k = r.categoria || "outros";
      const e = catMap.get(k) ?? { total: 0, count: 0 };
      e.total += +r.valor || 0;
      e.count += 1;
      catMap.set(k, e);
    });
    const breakdown: CategoriaBreakdown[] = Array.from(catMap.entries())
      .map(([categoria, v]) => ({
        categoria, total: v.total, count: v.count,
        pct: totalMes > 0 ? (v.total / totalMes) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Fixos recorrentes (gastos)
    const fixosRows = all.filter((r) => r.recorrente && r.tipo === "gasto");
    const uniq = new Map<string, FixoItem>();
    fixosRows.forEach((r) => {
      const key = `${r.descricao}|${r.categoria}`;
      if (!uniq.has(key)) {
        uniq.set(key, {
          id: r.id, descricao: r.descricao, categoria: r.categoria, valor: +r.valor || 0,
        });
      }
    });
    const fixos = Array.from(uniq.values()).sort((a, b) => b.valor - a.valor);
    const totalFixos = fixos.reduce((s, x) => s + x.valor, 0);

    return { trend, breakdown, fixos, totalFixos };
  });

// ============================================================
// DRE
// ============================================================

export type DreCustoItem = { id: number | string; descricao: string; valor: number; date?: string };
export type DrePayload = {
  fatCaio: number;
  fatGustavo: number;
  fatHt: number;
  fatTotal: number;
  custos: {
    trafegoPago: { total: number; itens: DreCustoItem[] };
    devSaas: { total: number; itens: DreCustoItem[] };
    folha: { total: number; itens: DreCustoItem[] };
    comissaoX1: { total: number; itens: DreCustoItem[] };
    comissaoHt: { total: number; itens: DreCustoItem[] };
    imposto: { total: number; itens: DreCustoItem[] };
    outros: { total: number; itens: DreCustoItem[] };
  };
  totalCustos: number;
  lucroLiquido: number;
  margemLiquida: number;
};

async function fetchMetaAdsSpendDaily(from: string, to: string, context: any): Promise<{ total: number; itens: DreCustoItem[] }> {
  const result: { total: number; itens: DreCustoItem[] } = { total: 0, itens: [] };
  try {
    const supabase = context.supabase;
    // Try pv24h_config
    const { data: pvCfg } = await supabase
      .from("pv24h_config" as any)
      .select("access_token, ad_account_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    // Try meta_ads_config
    const { data: metaCfg } = await supabase
      .from("meta_ads_config" as any)
      .select("access_token, pixel_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const token = pvCfg?.access_token || metaCfg?.access_token || process.env.META_ADS_TOKEN || process.env.FACEBOOK_ADS_ACCESS_TOKEN;
    const rawAcc = pvCfg?.ad_account_id || process.env.META_ADS_ACCOUNT_ID || process.env.FACEBOOK_ADS_ACCOUNT_ID;

    if (!token || !rawAcc) return result;

    const acc = String(rawAcc).startsWith("act_") ? rawAcc : `act_${rawAcc}`;
    const url = new URL(`https://graph.facebook.com/v21.0/${acc}/insights`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("time_range", JSON.stringify({ since: from, until: to }));
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("fields", "spend,date_start,date_stop");

    const res = await fetch(url.toString());
    const json: any = await res.json();
    if (res.ok && Array.isArray(json?.data)) {
      for (const row of json.data) {
        const spend = parseFloat(row.spend || 0);
        if (spend > 0) {
          result.total += spend;
          const dia = String(row.date_start || from);
          result.itens.push({
            id: `meta_${dia}`,
            descricao: `Tráfego Pago Meta Ads (${dia.split("-").reverse().join("/")})`,
            valor: spend,
            date: dia,
          });
        }
      }
    }
  } catch (err) {
    console.warn("Falha ao buscar custo de Meta Ads na API para DRE", err);
  }
  return result;
}

export const getDRE = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string } | undefined) => {
    const i = input ?? { from: "", to: "" };
    return {
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.from),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.to),
    };
  })
  .handler(async (opts): Promise<DrePayload> => {
    const context = opts?.context;
    const data = opts?.data;
    if (!context?.supabase || !data) throw new Error("Sessão Supabase indisponível");
    const { from, to } = data;
    const { supabase } = context;

    // produtos_map + vendedores p/ classificar expert
    const [{ data: pmap }, { data: vmap }] = await Promise.all([
      supabase.from("produtos_map").select("nome_produto,nome_expert"),
      supabase.from("vendedores").select("utm,expert"),
    ]);
    const pDict = new Map<string, string>();
    (pmap ?? []).forEach((p: any) => {
      const k = String(p.nome_produto ?? "").trim().toLowerCase();
      if (k) pDict.set(k, String(p.nome_expert ?? "").toLowerCase());
    });
    const uDict = new Map<string, string>();
    (vmap ?? []).forEach((v: any) => {
      const u = String(v.utm ?? "").trim().toUpperCase();
      if (u) uDict.set(u, String(v.expert ?? "").toLowerCase());
    });

    // vendas
    let fatCaio = 0, fatGu = 0;
    const PAGE = 1000;
    for (let i = 0; ; i++) {
      const { data: rows } = await supabase
        .from("vendas")
        .select('Ticket,Produto,Data,Evento,UTM')
        .gte("Data", from).lte("Data", to)
        .or("Evento.eq.purchase_approved,Evento.ilike.*aprov*")
        .range(i * PAGE, i * PAGE + PAGE - 1);
      const list = (rows ?? []) as any[];
      for (const s of list) {
        const iso = normalizeIsoDate(s.Data);
        if (!iso) continue;
        const utm = String(s.UTM ?? "").trim().toUpperCase();
        const exp = uDict.get(utm) || pDict.get(String(s.Produto ?? "").trim().toLowerCase()) || "";
        const val = parseTicket(s.Ticket);
        if (exp === "caio") fatCaio += val;
        else if (exp === "gustavo") fatGu += val;
      }
      if (list.length < PAGE) break;
    }

    // ht_vendas
    let fatHt = 0;
    for (let i = 0; ; i++) {
      const { data: rows } = await supabase
        .from("ht_vendas")
        .select("valor_total,data,status")
        .gte("data", from).lte("data", to)
        .neq("status", "reembolso")
        .range(i * PAGE, i * PAGE + PAGE - 1);
      const list = (rows ?? []) as any[];
      for (const s of list) fatHt += parseFloat(s.valor_total) || 0;
      if (list.length < PAGE) break;
    }

    // Busca tráfego pago automático da API do Meta Ads
    const metaAdsSpend = await fetchMetaAdsSpendDaily(from, to, context);

    // custos do financeiro no período
    const { data: fin } = await supabase
      .from("financeiro").select("id,descricao,categoria,valor")
      .gte("data_ref", from).lte("data_ref", to)
      .eq("tipo", "gasto");

    const bucket = () => ({ total: 0, itens: [] as DreCustoItem[] });
    const devSaas = bucket(), folha = bucket(), comX1 = bucket(), comHt = bucket(), imposto = bucket(), outros = bucket();
    const trafegoPago = { total: metaAdsSpend.total, itens: [...metaAdsSpend.itens] };

    (fin ?? []).forEach((r: any) => {
      const val = parseFloat(r.valor) || 0;
      const item: DreCustoItem = { id: r.id, descricao: r.descricao, valor: val };
      const cat = String(r.categoria || "").toLowerCase().trim();

      if (cat === "marketing" || cat.includes("trafego") || cat.includes("ad")) {
        trafegoPago.total += val;
        trafegoPago.itens.push(item);
      } else if (cat === "dev_saas") {
        devSaas.total += val; devSaas.itens.push(item);
      } else if (cat === "salario" || cat === "folha") {
        folha.total += val; folha.itens.push(item);
      } else if (cat === "comissao_x1" || cat === "comissao") {
        comX1.total += val; comX1.itens.push(item);
      } else if (cat === "comissao_ht") {
        comHt.total += val; comHt.itens.push(item);
      } else if (cat === "imposto") {
        imposto.total += val; imposto.itens.push(item);
      } else {
        outros.total += val; outros.itens.push(item);
      }
    });

    const fatTotal = fatCaio + fatGu * 0.5 + fatHt;
    const totalCustos = trafegoPago.total + devSaas.total + folha.total + comX1.total + comHt.total + imposto.total + outros.total;
    const lucroLiquido = fatTotal - totalCustos;
    const margemLiquida = fatTotal > 0 ? (lucroLiquido / fatTotal) * 100 : 0;

    return {
      fatCaio, fatGustavo: fatGu, fatHt,
      fatTotal,
      custos: { trafegoPago, devSaas, folha, comissaoX1: comX1, comissaoHt: comHt, imposto, outros },
      totalCustos,
      lucroLiquido,
      margemLiquida,
    };
  });
