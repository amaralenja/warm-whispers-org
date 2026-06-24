import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function parseTicket(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
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

export type OperacoesPayload = {
  experts: ExpertStats[];
  totalFaturamento: number;
  totalVendas: number;
  totalReembolsos: number;
  ticketMedioGeral: number;
  gastosMes: number;
  saldoEstimado: number;
};

export type DateRange = { from?: string | null; to?: string | null };

export const getOperacoesStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DateRange | undefined) => input ?? {})
  .handler(async ({ context, data }): Promise<OperacoesPayload> => {
    const { supabase } = context;
    const fromTs = data.from ? Date.UTC(+data.from.slice(0, 4), +data.from.slice(5, 7) - 1, +data.from.slice(8, 10)) : null;
    const toTs = data.to ? Date.UTC(+data.to.slice(0, 4), +data.to.slice(5, 7) - 1, +data.to.slice(8, 10)) : null;

    // Supabase retorna no máximo 1000 linhas por query — pagina pra pegar tudo
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

    const [expertsRes, vendedoresRes, vendasAll, reembolsosAll, financeiroAll] = await Promise.all([
      supabase.from("experts").select("id, nome, foto_url, ativo").eq("ativo", true),
      supabase.from("vendedores").select("expert, ativo").eq("ativo", true),
      fetchAll<any>((from, to) =>
        supabase.from("vendas").select('"Ticket", nome_expert, "Data", "ID de Referência"').range(from, to),
      ),
      fetchAll<any>((from, to) =>
        supabase.from("reembolsos").select('"ID da Venda", "Data do Reembolso"').range(from, to),
      ),
      fetchAll<any>((from, to) =>
        supabase.from("financeiro").select("valor, tipo, data_ref").range(from, to),
      ),
    ]);

    const experts = expertsRes.data ?? [];
    const vendedores = vendedoresRes.data ?? [];

    const inRange = (t: number | null) => {
      if (fromTs == null && toTs == null) return true;
      if (t == null) return false;
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t > toTs) return false;
      return true;
    };

    const vendas = vendasAll.filter((v: any) => inRange(parseDataField(v.Data)));

    // mapa idVenda -> nome_expert (de todas as vendas, pra cruzar reembolsos)
    const vendaToExpert = new Map<string, string>();
    for (const v of vendasAll as any[]) {
      if (v["ID de Referência"] && v.nome_expert) {
        vendaToExpert.set(String(v["ID de Referência"]), v.nome_expert);
      }
    }

    const reembolsos = reembolsosAll.filter((r: any) => inRange(parseDataField(r["Data do Reembolso"])));

    // mes atual pra gastos
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const gastosMes = financeiroAll
      .filter((f: any) => (f.tipo === "saida" || f.tipo === "despesa") && String(f.data_ref ?? "").startsWith(ym))
      .reduce((acc, f: any) => acc + Number(f.valor ?? 0), 0);

    const totalFaturamento = vendas.reduce((acc, v: any) => acc + parseTicket(v.Ticket), 0);
    const totalVendas = vendas.length;

    const expertStats: ExpertStats[] = experts.map((e: any) => {
      const vds = vendas.filter((v: any) => v.nome_expert === e.nome);
      const faturamento = vds.reduce((acc, v: any) => acc + parseTicket(v.Ticket), 0);
      const vendasCount = vds.length;
      const vendedoresCount = vendedores.filter((v: any) => v.expert === e.nome).length;
      const reembolsosCount = reembolsos.filter(
        (r: any) => vendaToExpert.get(String(r["ID da Venda"])) === e.nome,
      ).length;
      return {
        id: e.id,
        nome: e.nome,
        foto_url: e.foto_url || null,
        ativo: e.ativo,
        vendedoresCount,
        faturamento,
        vendas: vendasCount,
        ticketMedio: vendasCount ? faturamento / vendasCount : 0,
        reembolsos: reembolsosCount,
        pctTotal: totalFaturamento > 0 ? faturamento / totalFaturamento : 0,
      };
    });

    const totalReembolsos = reembolsos.length;
    const ticketMedioGeral = totalVendas ? totalFaturamento / totalVendas : 0;
    const saldoEstimado = totalFaturamento - gastosMes;

    return {
      experts: expertStats,
      totalFaturamento,
      totalVendas,
      totalReembolsos,
      ticketMedioGeral,
      gastosMes,
      saldoEstimado,
    };
  });
