import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const [vendas, leads, financeiro, htVendas] = await Promise.all([
      supabase.from("vendas").select("valor_total, valor_liquido, comissao_valor, data, status, closer, produto").order("data", { ascending: false }).limit(500),
      supabase.from("agenda_leads").select("id, status, created_at").limit(1000),
      supabase.from("financeiro").select("valor, tipo, status, data_ref").limit(500),
      supabase.from("ht_vendas").select("valor, status, created_at").limit(500),
    ]);

    const v = vendas.data ?? [];
    const faturamento = v.reduce((acc, r: any) => acc + Number(r.valor_total ?? 0), 0);
    const liquido = v.reduce((acc, r: any) => acc + Number(r.valor_liquido ?? 0), 0);
    const comissoes = v.reduce((acc, r: any) => acc + Number(r.comissao_valor ?? 0), 0);
    const totalVendas = v.length;
    const ticketMedio = totalVendas ? faturamento / totalVendas : 0;

    const ultimasVendas = v.slice(0, 6).map((r: any) => ({
      data: r.data,
      produto: r.produto,
      closer: r.closer,
      valor: Number(r.valor_total ?? 0),
      status: r.status,
    }));

    const f = financeiro.data ?? [];
    const entradas = f.filter((r: any) => r.tipo === "entrada" || r.tipo === "receita")
      .reduce((acc, r: any) => acc + Number(r.valor ?? 0), 0);
    const saidas = f.filter((r: any) => r.tipo === "saida" || r.tipo === "despesa")
      .reduce((acc, r: any) => acc + Number(r.valor ?? 0), 0);

    return {
      faturamento,
      liquido,
      comissoes,
      totalVendas,
      ticketMedio,
      totalLeads: leads.data?.length ?? 0,
      htVendasCount: htVendas.data?.length ?? 0,
      entradas,
      saidas,
      saldo: entradas - saidas,
      ultimasVendas,
    };
  });
