import { RefreshCcw } from "lucide-react";
import type { ReembolsoItem } from "@/lib/operacoes.functions";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function fmtDate(s: string | null) {
  if (!s) return "—";
  // tenta extrair YYYY-MM-DD ou DD/MM/YYYY
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  const brMatch = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[1]}/${brMatch[2]}/${brMatch[3]}`;
  return s;
}

export function ReembolsosList({
  reembolsos,
  totalValor,
  loading,
}: {
  reembolsos: ReembolsoItem[];
  totalValor: number;
  loading?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card/60 to-card/20 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/15 text-rose-400">
            <RefreshCcw className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-foreground">
            Vendas Reembolsadas
          </h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex flex-col items-end">
            <span className="text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">Qtd</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">{reembolsos.length}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">Valor total</span>
            <span className="text-sm font-semibold tabular-nums text-rose-400">{BRL(totalValor)}</span>
          </div>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-secondary/30" />
            ))}
          </div>
        ) : reembolsos.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhum reembolso no período. 🎉
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card/95 backdrop-blur">
              <tr className="border-b border-border/40 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                <th className="px-5 py-2.5 text-left font-medium">Cliente</th>
                <th className="px-3 py-2.5 text-left font-medium">Produto</th>
                <th className="px-3 py-2.5 text-left font-medium">Expert</th>
                <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                <th className="px-3 py-2.5 text-right font-medium">Data venda</th>
                <th className="px-5 py-2.5 text-right font-medium">Reembolso</th>
              </tr>
            </thead>
            <tbody>
              {reembolsos.map((r, i) => (
                <tr
                  key={`${r.idVenda}-${i}`}
                  className="border-b border-border/30 transition hover:bg-secondary/20"
                >
                  <td className="px-5 py-3 text-foreground">{r.cliente ?? "—"}</td>
                  <td className="max-w-[240px] truncate px-3 py-3 text-muted-foreground" title={r.produto ?? ""}>
                    {r.produto ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{r.expert ?? "—"}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-rose-400">
                    {BRL(r.valor)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {fmtDate(r.dataVenda)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground">
                    {fmtDate(r.dataReembolso)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
