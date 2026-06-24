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
  .handler(async ({ context }): Promise<Lancamento[]> => {
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
  .handler(async ({ data, context }) => {
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
  .handler(async ({ data, context }) => {
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

export const getFinanceiroRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mes?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<RelatorioPayload> => {
    const refMes = data.mes ?? new Date().toISOString().slice(0, 7);
    const { data: rows, error } = await context.supabase
      .from("financeiro")
      .select("*")
      .order("data_ref", { ascending: false })
      .limit(5000);
    if (error) throw error;
    const all = (rows ?? []) as Lancamento[];

    // Trend últimos 6 meses
    const trend: MesPonto[] = [];
    const ref = new Date(refMes + "-01T00:00:00");
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const mRows = all.filter((r) => (r.data_ref || "").slice(0, 7) === mes);
      const receita = mRows.filter((r) => r.tipo === "receita").reduce((s, x) => s + (+x.valor || 0), 0);
      const gasto = mRows.filter((r) => r.tipo === "gasto").reduce((s, x) => s + (+x.valor || 0), 0);
      trend.push({ mes, receita, gasto, saldo: receita - gasto });
    }

    // Breakdown categoria do mês
    const mesRows = all.filter((r) => (r.data_ref || "").slice(0, 7) === refMes && r.tipo === "gasto");
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

export type DreCustoItem = { id: number; descricao: string; valor: number };
export type DrePayload = {
  fatCaio: number;     // 100%
  fatGustavo: number;  // bruto (UI mostra 50%)
  fatHt: number;       // 100%
  fatTotal: number;    // caio + (gustavo*0.5) + ht
  custos: {
    devSaas: { total: number; itens: DreCustoItem[] };
    folha: { total: number; itens: DreCustoItem[] };
    comissaoX1: { total: number; itens: DreCustoItem[] };
    comissaoHt: { total: number; itens: DreCustoItem[] };
    imposto: { total: number; itens: DreCustoItem[] };
  };
};

export const getDRE = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string } | undefined) => {
    const i = input ?? { from: "", to: "" };
    return {
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.from),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.to),
    };
  })
  .handler(async ({ data, context }): Promise<DrePayload> => {
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

    // custos do financeiro no período
    const { data: fin } = await supabase
      .from("financeiro").select("id,descricao,categoria,valor")
      .gte("data_ref", from).lte("data_ref", to)
      .eq("tipo", "gasto");

    const bucket = () => ({ total: 0, itens: [] as DreCustoItem[] });
    const devSaas = bucket(), folha = bucket(), comX1 = bucket(), comHt = bucket(), imposto = bucket();
    (fin ?? []).forEach((r: any) => {
      const val = parseFloat(r.valor) || 0;
      const item: DreCustoItem = { id: r.id, descricao: r.descricao, valor: val };
      switch (r.categoria) {
        case "dev_saas": devSaas.total += val; devSaas.itens.push(item); break;
        case "salario": folha.total += val; folha.itens.push(item); break;
        case "comissao_x1": comX1.total += val; comX1.itens.push(item); break;
        case "comissao_ht": comHt.total += val; comHt.itens.push(item); break;
        case "imposto": imposto.total += val; imposto.itens.push(item); break;
      }
    });

    return {
      fatCaio, fatGustavo: fatGu, fatHt,
      fatTotal: fatCaio + fatGu * 0.5 + fatHt,
      custos: { devSaas, folha, comissaoX1: comX1, comissaoHt: comHt, imposto },
    };
  });
