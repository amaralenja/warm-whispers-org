import { useMemo, useState } from "react";
import type { SerieDiaria } from "@/lib/operacoes.functions";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const BRLk = (n: number) => {
  if (n >= 1000) return `R$ ${Math.round(n / 1000)}K`;
  return `R$ ${Math.round(n)}`;
};

function fmtDM(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function DesempenhoDiario({
  serie,
  loading,
}: {
  serie: SerieDiaria[];
  loading?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(() => serie.reduce((m, s) => Math.max(m, s.total), 0), [serie]);
  // Eixo Y — divide em 9 ticks (como na referência)
  const ticks = useMemo(() => {
    if (!max) return [0];
    const step = niceStep(max / 9);
    const top = Math.ceil(max / step) * step;
    const out: number[] = [];
    for (let v = top; v >= 0; v -= step) out.push(v);
    return out;
  }, [max]);
  const top = ticks[0] || 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">▰</span>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">
            Desempenho por Dia — Faturamento Total
          </h2>
        </div>
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
          {serie.length} dias
        </span>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="h-72 animate-pulse rounded-md bg-secondary/30" />
        ) : serie.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Sem dados no período.
          </div>
        ) : (
          <div className="flex gap-3">
            {/* Eixo Y */}
            <div className="flex h-72 flex-col justify-between text-right text-[0.65rem] tabular-nums text-muted-foreground">
              {ticks.map((t, i) => (
                <div key={i}>{BRLk(t)}</div>
              ))}
            </div>

            {/* Área do gráfico */}
            <div className="relative flex-1">
              {/* Linhas de grade */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {ticks.map((_, i) => (
                  <div key={i} className="h-px w-full bg-border/40" />
                ))}
              </div>

              {/* Barras */}
              <div className="relative flex h-72 items-end gap-1">
                {serie.map((s, i) => {
                  const h = top > 0 ? (s.total / top) * 100 : 0;
                  const active = hover === i;
                  return (
                    <div
                      key={s.data}
                      className="group relative flex h-full flex-1 items-end"
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <div
                        className="w-full rounded-t-sm transition-all"
                        style={{
                          height: `${Math.max(h, s.total > 0 ? 1.5 : 0)}%`,
                          backgroundImage: active
                            ? "linear-gradient(180deg, #4ade80, #22c55e)"
                            : "linear-gradient(180deg, #22c55e, #16a34a)",
                          boxShadow: active ? "0 0 12px rgba(34,197,94,0.6)" : undefined,
                        }}
                      />
                      {active && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
                          <div className="font-medium text-foreground">{fmtDM(s.data)}</div>
                          <div className="mt-0.5 text-emerald-400 tabular-nums">{BRL(s.total)}</div>
                          <div className="text-[0.65rem] text-muted-foreground tabular-nums">
                            {s.vendas} venda{s.vendas !== 1 ? "s" : ""}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Eixo X */}
              <div className="mt-2 flex gap-1">
                {serie.map((s, i) => (
                  <div
                    key={s.data}
                    className="flex-1 text-center text-[0.6rem] tabular-nums text-muted-foreground"
                    style={{
                      // Mostra label apenas a cada N dias se a série for grande
                      visibility:
                        serie.length <= 20 || i % Math.ceil(serie.length / 20) === 0
                          ? "visible"
                          : "hidden",
                    }}
                  >
                    {fmtDM(s.data)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  if (norm < 1.5) return pow;
  if (norm < 3) return 2 * pow;
  if (norm < 7) return 5 * pow;
  return 10 * pow;
}
