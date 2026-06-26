import { useMemo } from "react";
import { TrendingUp, Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import type { SerieDiaria } from "@/lib/operacoes.functions";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const BRLk = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
};
const fmtDM = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export function DesempenhoDiario({
  serie,
  loading,
}: {
  serie: SerieDiaria[];
  loading?: boolean;
}) {
  const stats = useMemo(() => {
    const total = serie.reduce((a, s) => a + s.total, 0);
    const vendas = serie.reduce((a, s) => a + s.vendas, 0);
    const max = serie.reduce((m, s) => Math.max(m, s.total), 0);
    const peakIdx = max > 0 ? serie.findIndex((s) => s.total === max) : -1;
    const avg = serie.length ? total / serie.length : 0;

    // Tendência: compara primeira metade com segunda metade
    const half = Math.floor(serie.length / 2);
    const firstHalf = serie.slice(0, half).reduce((a, s) => a + s.total, 0);
    const secondHalf = serie.slice(half).reduce((a, s) => a + s.total, 0);
    const trendPct = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

    return { total, vendas, max, peakIdx, avg, trendPct };
  }, [serie]);

  const chartData = useMemo(
    () =>
      serie.map((s, i) => ({
        ...s,
        label: fmtDM(s.data),
        isPeak: i === stats.peakIdx && s.total > 0,
      })),
    [serie, stats.peakIdx],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Faturamento Diário</h2>
            <p className="text-[0.7rem] text-muted-foreground">
              Evolução no período selecionado
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Stat label="Total" value={BRL(stats.total)} accent="emerald" />
          <Stat label="Média/dia" value={BRL(stats.avg)} accent="sky" />
          {stats.peakIdx >= 0 && (
            <Stat
              label="Pico"
              value={BRL(stats.max)}
              hint={fmtDM(serie[stats.peakIdx].data)}
              accent="amber"
            />
          )}
          {serie.length > 1 && (
            <div
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold tabular-nums ${
                stats.trendPct >= 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-400"
              }`}
            >
              {stats.trendPct >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {Math.abs(stats.trendPct).toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pb-2 pt-4">
        {loading ? (
          <div className="h-72 animate-pulse rounded-xl bg-secondary/30" />
        ) : serie.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Sem dados no período.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="bar-emerald" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160 84% 55%)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="bar-amber" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(38 92% 55%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(38 92% 45%)" stopOpacity={0.5} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.35}
                  strokeDasharray="3 6"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.5 }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => BRLk(Number(v))}
                  width={50}
                />

                <Tooltip
                  cursor={{ fill: "hsl(var(--foreground) / 0.04)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof chartData)[number];
                    return (
                      <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                        <div className="border-b border-border/60 px-3 py-2 text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
                          {p.label}
                          {p.isPeak && (
                            <span className="ml-2 rounded-sm bg-amber-500/15 px-1.5 py-px text-[0.55rem] font-semibold text-amber-400">
                              PICO
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 px-3 py-2">
                          <div className="flex items-baseline justify-between gap-6">
                            <span className="text-[0.65rem] text-muted-foreground">Faturamento</span>
                            <span className="font-display text-base font-semibold tabular-nums text-emerald-400">
                              {BRL(p.total)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between gap-6">
                            <span className="text-[0.65rem] text-muted-foreground">Vendas</span>
                            <span className="text-xs font-semibold tabular-nums text-foreground">
                              {p.vendas}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />

                {stats.avg > 0 && (
                  <ReferenceLine
                    y={stats.avg}
                    stroke="hsl(199 89% 60%)"
                    strokeDasharray="4 6"
                    strokeOpacity={0.7}
                    label={{
                      value: `Média ${BRLk(stats.avg)}`,
                      position: "insideTopRight",
                      fill: "hsl(199 89% 70%)",
                      fontSize: 10,
                    }}
                  />
                )}

                <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={42}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.isPeak ? "url(#bar-amber)" : "url(#bar-emerald)"} />
                  ))}
                </Bar>

                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(160 84% 70%)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "hsl(160 84% 55%)",
                    stroke: "hsl(var(--background))",
                    strokeWidth: 2,
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Footer compacto */}
      {!loading && serie.length > 0 && (
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-400" /> Faturamento
          </span>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-emerald-400" />
            {stats.vendas} vendas no período
          </span>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: "emerald" | "sky" | "amber";
}) {
  const color = {
    emerald: "text-emerald-400",
    sky: "text-sky-400",
    amber: "text-amber-400",
  }[accent];
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-1.5">
      <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`text-xs font-semibold tabular-nums ${color}`}>
        {value}
        {hint && <span className="ml-1 text-[0.6rem] text-muted-foreground">({hint})</span>}
      </div>
    </div>
  );
}
