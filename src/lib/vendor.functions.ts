import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type VendorStats = {
  vendor: {
    id: number;
    nome: string | null;
    utm: string | null;
    expert: string | null;
    foto_url: string | null;
    meta: number;
    codigo: string | null;
    genero: string | null;
  } | null;
  faturamento: number;
  vendas: number;
  ticketMedio: number;
  maiorVenda: number;
  posicao: number | null;
  totalVendedores: number;
  meta: number;
  metaPct: number;
  faltaMeta: number;
  serieDiaria: { data: string; total: number; vendas: number }[];
  ultimasVendas: { data: string; produto: string | null; cliente: string | null; ticket: number }[];
  periodo: { from: string; to: string };
};

export const getVendorStats = createServerFn({ method: "POST" })
  .inputValidator((d: { utm: string; from?: string | null; to?: string | null }) => d)
  .handler(async ({ data }) => {
    const sb = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: result, error } = await sb.rpc("get_vendor_stats", {
      _utm: data.utm,
      _from: data.from ?? undefined,
      _to: data.to ?? undefined,
    });
    if (error) throw new Error(error.message);
    return result as unknown as VendorStats;
  });
