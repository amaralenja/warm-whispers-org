import { createServerFn } from "@tanstack/react-start";

const TICKET_MIN = 97;

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

function isoToTs(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

export type PublicRankingItem = {
  utm: string;
  nome: string;
  expert: string | null;
  fotoUrl: string | null;
  faturamento: number;
  vendas: number;
  ticketMedio: number;
  pctTotal: number;
};

export type PublicRankingPayload = {
  ranking: PublicRankingItem[];
  totalFaturamento: number;
  totalVendas: number;
  ticketMedioGeral: number;
  vendedoresAtivos: number;
};

export type PublicRankingInput = { from?: string | null; to?: string | null };

export const getRankingStatsPublic = createServerFn({ method: "POST" })
  .inputValidator((input: PublicRankingInput | undefined) => input ?? {})
  .handler(async ({ data }): Promise<PublicRankingPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fromTs = data.from ? isoToTs(data.from) : null;
    const toTs = data.to ? isoToTs(data.to) : null;
    const inRange = (ts: number | null) => {
      if (ts == null) return false;
      if (fromTs != null && ts < fromTs) return false;
      if (toTs != null && ts > toTs) return false;
      return true;
    };

    const PAGE = 1000;
    const sales: any[] = [];
    for (let i = 0; ; i++) {
      const { data: rows, error } = await supabaseAdmin
        .from("vendas")
        .select('"Data","Ticket","UTM",nome_expert,"Produto","Evento"')
        .or("Evento.eq.purchase_approved,Evento.ilike.*aprov*")
        .range(i * PAGE, i * PAGE + PAGE - 1);
      if (error) throw error;
      const list = (rows ?? []) as any[];
      sales.push(...list);
      if (list.length < PAGE) break;
    }

    const [{ data: vendedoresRaw }, { data: prodMapRows }] = await Promise.all([
      supabaseAdmin.from("vendedores").select("utm,nome,expert,ativo,foto_url"),
      supabaseAdmin.from("produtos_map").select("nome_produto,nome_expert"),
    ]);

    const prodMap = new Map<string, string>();
    for (const p of (prodMapRows ?? []) as any[]) {
      const k = String(p.nome_produto ?? "").trim().toLowerCase();
      const e = String(p.nome_expert ?? "").trim();
      if (k && e) prodMap.set(k, e);
    }

    const vendMeta = new Map<string, { nome: string; expert: string | null; ativo: boolean; fotoUrl: string | null }>();
    for (const v of (vendedoresRaw ?? []) as any[]) {
      const utm = String(v.utm ?? "").trim().toUpperCase();
      if (!utm) continue;
      vendMeta.set(utm, {
        nome: v.nome ?? utm,
        expert: v.expert ?? null,
        ativo: v.ativo !== false,
        fotoUrl: v.foto_url || null,
      });
    }

    const enriched = sales
      .map((r) => {
        const iso = normalizeIsoDate(r.Data);
        if (!iso) return null;
        const ts = isoToTs(iso);
        if (!inRange(ts)) return null;
        const prodKey = String(r.Produto ?? "").trim().toLowerCase();
        const expertOfRow = prodMap.get(prodKey) ?? r.nome_expert ?? null;
        const utm = String(r.UTM ?? "").trim().toUpperCase();
        return { utm, ticket: parseTicket(r.Ticket), expert: expertOfRow };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const agg = new Map<string, { utm: string; faturamento: number; vendas: number; tmFat: number; tmCount: number }>();
    for (const v of enriched) {
      const meta = v.utm ? vendMeta.get(v.utm) : undefined;
      if (!meta || !meta.ativo) continue;
      let e = agg.get(v.utm);
      if (!e) {
        e = { utm: v.utm, faturamento: 0, vendas: 0, tmFat: 0, tmCount: 0 };
        agg.set(v.utm, e);
      }
      e.faturamento += v.ticket;
      e.vendas += 1;
      if (v.ticket >= TICKET_MIN) {
        e.tmFat += v.ticket;
        e.tmCount += 1;
      }
    }

    const totalFaturamento = enriched.reduce((a, v) => a + v.ticket, 0);
    const totalVendas = enriched.length;
    const tmSales = enriched.filter((v) => v.ticket >= TICKET_MIN);
    const ticketMedioGeral = tmSales.length ? tmSales.reduce((a, v) => a + v.ticket, 0) / tmSales.length : 0;
    const vendorsOnlyFat = Array.from(agg.values()).reduce((a, e) => a + e.faturamento, 0);

    const ranking: PublicRankingItem[] = Array.from(agg.values())
      .map((e) => {
        const meta = vendMeta.get(e.utm)!;
        return {
          utm: e.utm,
          nome: meta.nome,
          expert: meta.expert,
          fotoUrl: meta.fotoUrl,
          faturamento: e.faturamento,
          vendas: e.vendas,
          ticketMedio: e.tmCount > 0 ? e.tmFat / e.tmCount : 0,
          pctTotal: vendorsOnlyFat > 0 ? (e.faturamento / vendorsOnlyFat) * 100 : 0,
        };
      })
      .sort((a, b) => b.faturamento - a.faturamento);

    return {
      ranking,
      totalFaturamento,
      totalVendas,
      ticketMedioGeral,
      vendedoresAtivos: ranking.length,
    };
  });
