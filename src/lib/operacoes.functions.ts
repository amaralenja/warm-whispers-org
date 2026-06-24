import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function parseTicket(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
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
};

export const getOperacoesStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExpertStats[]> => {
    const { supabase } = context;
    const [expertsRes, vendedoresRes, vendasRes] = await Promise.all([
      supabase.from("experts").select("id, nome, foto_url, ativo").eq("ativo", true),
      supabase.from("vendedores").select("expert, ativo").eq("ativo", true),
      supabase.from("vendas").select('"Ticket", nome_expert'),
    ]);

    const experts = expertsRes.data ?? [];
    const vendedores = vendedoresRes.data ?? [];
    const vendas = vendasRes.data ?? [];

    return experts.map((e: any) => {
      const vds = vendas.filter((v: any) => v.nome_expert === e.nome);
      const faturamento = vds.reduce((acc, v: any) => acc + parseTicket(v.Ticket), 0);
      const vendasCount = vds.length;
      const vendedoresCount = vendedores.filter((v: any) => v.expert === e.nome).length;
      return {
        id: e.id,
        nome: e.nome,
        foto_url: e.foto_url || null,
        ativo: e.ativo,
        vendedoresCount,
        faturamento,
        vendas: vendasCount,
        ticketMedio: vendasCount ? faturamento / vendasCount : 0,
      };
    });
  });
