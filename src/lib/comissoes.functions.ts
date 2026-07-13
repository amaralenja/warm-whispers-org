import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DiaComissao = {
  data: string;
  vendas: number;
  faturamento: number;
  cumulativo: number;
  rate: number;
  milhares: number;
  comissao: number;
};

export type ComissaoRow = {
  id: number;
  utm: string;
  nome: string;
  expert: string | null;
  fotoUrl: string | null;
  pixChave: string | null;
  faturamento: number;
  vendas: number;
  comissao: number;
  tierAtual: number;
  dias: DiaComissao[];
};

export type ComissoesPayload = {
  rows: ComissaoRow[];
  totalFaturamento: number;
  totalComissao: number;
};

export type ComissoesRange = { from?: string | null; to?: string | null };

function assertAdmin(context: any) {
  if (context?.vendor) throw new Error("Acesso restrito a administradores");
}

export const getComissoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ComissoesRange | undefined) => input ?? {})
  .handler(async (opts): Promise<ComissoesPayload> => {
    const context = opts?.context;
    assertAdmin(context);
    const supabase = context.supabase as any;
    const data = opts?.data ?? {};
    const fromTs = data.from ? Date.UTC(+data.from.slice(0, 4), +data.from.slice(5, 7) - 1, +data.from.slice(8, 10)) : null;
    const toTs = data.to ? Date.UTC(+data.to.slice(0, 4), +data.to.slice(5, 7) - 1, +data.to.slice(8, 10)) : null;

    const inRange = (t: number | null) => {
      if (fromTs == null && toTs == null) return true;
      if (t == null) return false;
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t > toTs) return false;
      return true;
    };

    async function fetchAll<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
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

    const [vendedoresRes, vendasAll] = await Promise.all([
      supabase.from("vendedores").select("id, utm, nome, expert, foto_url, ativo, pix_chave"),
      fetchAll<any>((from, to) =>
        supabase
          .from("vendas")
          .select('"Ticket", "Data", "UTM", "Evento"')
          .or('Evento.eq.purchase_approved,Evento.ilike.*aprov*')
          .range(from, to),
      ),
    ]);

    const vendedores = (vendedoresRes.data ?? []) as any[];

    // Agrupa vendas por UTM + dia (ISO)
    const byUtm = new Map<string, Map<string, { faturamento: number; vendas: number }>>();
    for (const v of vendasAll) {
      const t = parseDataField(v.Data);
      if (!inRange(t)) continue;
      if (t == null) continue;
      const utm = String(v.UTM ?? "").toUpperCase().trim();
      if (!utm) continue;
      const d = new Date(t);
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      let daysMap = byUtm.get(utm);
      if (!daysMap) { daysMap = new Map(); byUtm.set(utm, daysMap); }
      const entry = daysMap.get(iso) ?? { faturamento: 0, vendas: 0 };
      entry.faturamento += parseTicket(v.Ticket);
      entry.vendas += 1;
      daysMap.set(iso, entry);
    }

    const rows: ComissaoRow[] = vendedores
      .filter((v) => v.utm)
      .map((v) => {
        const key = String(v.utm).toUpperCase();
        const daysMap = byUtm.get(key) ?? new Map();
        const dias: DiaComissao[] = [];
        let faturamento = 0;
        let vendas = 0;
        let comissao = 0;
        let cumulativo = 0;
        const isoDays = Array.from(daysMap.keys()).sort();
        for (const iso of isoDays) {
          const day = daysMap.get(iso)!;
          cumulativo += day.faturamento;
          const rate = tierRate(cumulativo);
          const milhares = Math.floor(day.faturamento / 1000);
          const valor = milhares * rate;
          dias.push({
            data: iso,
            vendas: day.vendas,
            faturamento: day.faturamento,
            cumulativo,
            rate,
            milhares,
            comissao: valor,
          });
          faturamento += day.faturamento;
          vendas += day.vendas;
          comissao += valor;
        }
        return {
          id: Number(v.id),
          utm: key,
          nome: v.nome ?? key,
          expert: v.expert ?? null,
          fotoUrl: v.foto_url ?? null,
          pixChave: v.pix_chave ?? null,
          faturamento,
          vendas,
          comissao,
          tierAtual: tierRate(faturamento),
          dias,
        };
      })
      .filter((r) => r.faturamento > 0 || r.dias.length > 0)
      .sort((a, b) => b.faturamento - a.faturamento);

    const totalFaturamento = rows.reduce((a, r) => a + r.faturamento, 0);
    const totalComissao = rows.reduce((a, r) => a + r.comissao, 0);

    return { rows, totalFaturamento, totalComissao };
  });

export const setPixChave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: number; pix: string }) => ({
    id: Number(input.id),
    pix: String(input.pix ?? "").trim().slice(0, 200),
  }))
  .handler(async (opts) => {
    const context = opts?.context;
    assertAdmin(context);
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("vendedores")
      .update({ pix_chave: opts.data.pix || null })
      .eq("id", opts.data.id);
    if (error) throw error;
    return { ok: true };
  });
