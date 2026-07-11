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

export type ComissaoRow = {
  id: number;
  utm: string;
  nome: string;
  expert: string | null;
  fotoUrl: string | null;
  faturamento: number;
  vendas: number;
  comissaoPct: number;
  comissaoValor: number;
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
      supabase.from("vendedores").select("id, utm, nome, expert, foto_url, ativo, comissao_pct"),
      fetchAll<any>((from, to) =>
        supabase
          .from("vendas")
          .select('"Ticket", "Data", "UTM", "Evento"')
          .or('Evento.eq.purchase_approved,Evento.ilike.*aprov*')
          .range(from, to),
      ),
    ]);

    const vendedores = (vendedoresRes.data ?? []) as any[];

    const vendaByUtm = new Map<string, { faturamento: number; vendas: number }>();
    for (const v of vendasAll) {
      if (!inRange(parseDataField(v.Data))) continue;
      const utm = String(v.UTM ?? "").toUpperCase().trim();
      if (!utm) continue;
      const entry = vendaByUtm.get(utm) ?? { faturamento: 0, vendas: 0 };
      entry.faturamento += parseTicket(v.Ticket);
      entry.vendas += 1;
      vendaByUtm.set(utm, entry);
    }

    const rows: ComissaoRow[] = vendedores
      .filter((v) => v.utm)
      .map((v) => {
        const key = String(v.utm).toUpperCase();
        const stats = vendaByUtm.get(key) ?? { faturamento: 0, vendas: 0 };
        const pct = Number(v.comissao_pct ?? 0);
        return {
          id: Number(v.id),
          utm: key,
          nome: v.nome ?? key,
          expert: v.expert ?? null,
          fotoUrl: v.foto_url ?? null,
          faturamento: stats.faturamento,
          vendas: stats.vendas,
          comissaoPct: pct,
          comissaoValor: stats.faturamento * (pct / 100),
        };
      })
      .sort((a, b) => b.faturamento - a.faturamento);

    const totalFaturamento = rows.reduce((a, r) => a + r.faturamento, 0);
    const totalComissao = rows.reduce((a, r) => a + r.comissaoValor, 0);

    return { rows, totalFaturamento, totalComissao };
  });

export const setComissaoPct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: number; pct: number }) => ({
    id: Number(input.id),
    pct: Math.max(0, Math.min(100, Number(input.pct) || 0)),
  }))
  .handler(async (opts) => {
    const context = opts?.context;
    assertAdmin(context);
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("vendedores")
      .update({ comissao_pct: opts.data.pct })
      .eq("id", opts.data.id);
    if (error) throw error;
    return { ok: true };
  });
