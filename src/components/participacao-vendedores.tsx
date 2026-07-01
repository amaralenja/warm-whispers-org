import { Trophy, Users } from "lucide-react";
import type { VendedorStat } from "@/lib/operacoes.functions";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Paleta refinada — verde como dominante, com acentos contrastantes
const PALETTE = [
  "#10b981", // emerald-500
  "#22c55e", // green-500
  "#f59e0b", // amber-500
  "#06b6d4", // cyan-500
  "#a3e635", // lime-400
  "#f97316", // orange-500
  "#14b8a6", // teal-500
  "#eab308", // yellow-500
  "#84cc16", // lime-500
  "#fb7185", // rose-400
];

function colorFor(i: number) {
  return PALETTE[i % PALETTE.length];
}

function initials(s: unknown) {
  const str = typeof s === "string" ? s : s == null ? "" : String(s);
  const t = str.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  if (!t) return "?";
  const parts = t.split(/\s+/);
  if (parts.length === 1) return t.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function asStr(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function ParticipacaoVendedores({
  vendedores: vendedoresProp,
  loading,
}: {
  vendedores?: VendedorStat[] | null;
  loading?: boolean;
}) {
  const vendedores: VendedorStat[] = Array.isArray(vendedoresProp) ? vendedoresProp : [];
  const total = vendedores.reduce((acc, v) => acc + (Number(v?.faturamento) || 0), 0);

  // Donut: top 6, agrupa o resto como "Outros"
  const top = vendedores.slice(0, 6);
  const rest = vendedores.slice(6);
  const donutSegments = top.map((v, i) => ({
    label: v.utm,
    value: v.faturamento,
    color: colorFor(i),
    pct: total > 0 ? v.faturamento / total : 0,
  }));
  if (rest.length > 0) {
    const restSum = rest.reduce((acc, v) => acc + v.faturamento, 0);
    donutSegments.push({
      label: `+${rest.length}`,
      value: restSum,
      color: "hsl(var(--muted-foreground) / 0.5)",
      pct: total > 0 ? restSum / total : 0,
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card/60 to-card/20 backdrop-blur">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
            <Users className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-foreground">
            Participação por Vendedor
          </h2>
        </div>
        <span className="rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
          {vendedores.length} ativos
        </span>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex flex-col gap-4">
            <div className="mx-auto h-44 w-44 animate-pulse rounded-full bg-secondary/30" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-secondary/30" />
              ))}
            </div>
          </div>
        ) : vendedores.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">
            Sem vendas no período.
          </div>
        ) : (
          <>
            {/* Donut central */}
            <div className="relative mx-auto mb-5 h-44 w-44">
              <Donut segments={donutSegments} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[0.55rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Total
                </span>
                <span className="mt-0.5 font-display text-lg font-semibold tabular-nums text-foreground">
                  {BRL(total)}
                </span>
              </div>
            </div>

            {/* Ranking */}
            <div className="space-y-1.5">
              {vendedores.slice(0, 10).map((v, i) => {
                const color = colorFor(i);
                const fat = Number((v as any)?.faturamento) || 0;
                const vendas = Number((v as any)?.vendas) || 0;
                const pctTotal = Number((v as any)?.pctTotal) || 0;
                const pct = pctTotal * 100;
                const isTop = i === 0;
                const utmStr = asStr((v as any)?.utm);
                return (
                  <div
                    key={utmStr || i}
                    className="group relative grid grid-cols-[1.5rem_2rem_1fr_auto_auto] items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-1.5 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  >
                    <span className="text-center text-[0.65rem] font-bold tabular-nums text-muted-foreground">
                      {isTop ? <Trophy className="mx-auto h-3 w-3 text-amber-400" /> : `#${i + 1}`}
                    </span>
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-md text-[0.65rem] font-bold"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${color}, ${color}88)`,
                        color: "#0a0a0a",
                        boxShadow: `0 0 0 1px ${color}55`,
                      }}
                    >
                      {initials(utmStr)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">
                        {utmStr}
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary/40">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(2, pct)}%`,
                            backgroundImage: `linear-gradient(90deg, ${color}, ${color}cc)`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[0.7rem] font-semibold tabular-nums text-foreground">
                        {BRL(fat)}
                      </div>
                      <div className="text-[0.55rem] tabular-nums text-muted-foreground">
                        {vendas} venda{vendas !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <span
                      className="min-w-[3rem] text-right font-display text-sm font-bold tabular-nums"
                      style={{ color }}
                    >
                      {pct >= 1 ? pct.toFixed(0) : pct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}

              {vendedores.length > 10 && (
                <div className="pt-1 text-center text-[0.65rem] text-muted-foreground">
                  +{vendedores.length - 10} vendedores
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Donut SVG ---------------- */

function Donut({
  segments,
}: {
  segments: { label: string; value: number; color: string; pct: number }[];
}) {
  const SIZE = 176;
  const C = SIZE / 2;
  const R = 68;
  const INNER = 50;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;

  let start = -Math.PI / 2; // começa no topo
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
      {/* fundo */}
      <circle cx={C} cy={C} r={R} fill="none" stroke="hsl(var(--border) / 0.4)" strokeWidth={R - INNER} />
      {segments.map((s, i) => {
        const angle = (s.value / total) * Math.PI * 2;
        const end = start + angle;
        const large = angle > Math.PI ? 1 : 0;
        const x1 = C + R * Math.cos(start);
        const y1 = C + R * Math.sin(start);
        const x2 = C + R * Math.cos(end);
        const y2 = C + R * Math.sin(end);
        const xi2 = C + INNER * Math.cos(end);
        const yi2 = C + INNER * Math.sin(end);
        const xi1 = C + INNER * Math.cos(start);
        const yi1 = C + INNER * Math.sin(start);
        const path = [
          `M ${x1} ${y1}`,
          `A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`,
          `L ${xi2} ${yi2}`,
          `A ${INNER} ${INNER} 0 ${large} 0 ${xi1} ${yi1}`,
          "Z",
        ].join(" ");
        start = end;
        return (
          <path
            key={i}
            d={path}
            fill={s.color}
            style={{ transition: "opacity 200ms" }}
          />
        );
      })}
    </svg>
  );
}
