import { useMemo, useRef, useState } from "react";
import { TrendingUp, Activity } from "lucide-react";
import type { SerieDiaria } from "@/lib/operacoes.functions";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const BRLk = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
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
  const wrapRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const total = serie.reduce((a, s) => a + s.total, 0);
    const vendas = serie.reduce((a, s) => a + s.vendas, 0);
    const max = serie.reduce((m, s) => Math.max(m, s.total), 0);
    const peakIdx = max > 0 ? serie.findIndex((s) => s.total === max) : -1;
    const avg = serie.length ? total / serie.length : 0;
    return { total, vendas, max, peakIdx, avg };
  }, [serie]);

  // Eixo Y — 5 ticks "bonitos"
  const ticks = useMemo(() => {
    if (!stats.max) return [0];
    const step = niceStep(stats.max / 4);
    const top = Math.ceil(stats.max / step) * step;
    const out: number[] = [];
    for (let v = top; v >= 0; v -= step) out.push(v);
    return out;
  }, [stats.max]);
  const top = ticks[0] || 1;

  const W = 800;
  const H = 260;
  const PAD = { l: 40, r: 16, t: 16, b: 28 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const points = useMemo(() => {
    if (serie.length === 0) return [] as { x: number; y: number; s: SerieDiaria }[];
    if (serie.length === 1) {
      return [
        {
          x: PAD.l + innerW / 2,
          y: PAD.t + innerH - (serie[0].total / top) * innerH,
          s: serie[0],
        },
      ];
    }
    return serie.map((s, i) => ({
      x: PAD.l + (i / (serie.length - 1)) * innerW,
      y: PAD.t + innerH - (s.total / top) * innerH,
      s,
    }));
  }, [serie, top, innerW, innerH]);

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    const baseY = PAD.t + innerH;
    const first = points[0];
    const last = points[points.length - 1];
    return [
      `M ${first.x.toFixed(2)} ${baseY}`,
      ...points.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
      `L ${last.x.toFixed(2)} ${baseY}`,
      "Z",
    ].join(" ");
  }, [points, innerH]);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const xPx = xRatio * W;
    let closest = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - xPx);
      if (d < best) { best = d; closest = i; }
    }
    setHover(closest);
  }

  const hoverPoint = hover != null ? points[hover] : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card/60 to-card/20 backdrop-blur">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
            <Activity className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-foreground">
            Faturamento Diário
          </h2>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <Badge label="Total" value={BRL(stats.total)} accent="text-emerald-400" />
          <Badge label="Vendas" value={String(stats.vendas)} />
          <Badge label="Média/dia" value={BRL(stats.avg)} accent="text-sky-400" />
          {stats.peakIdx >= 0 && (
            <Badge
              label="Pico"
              value={BRL(stats.max)}
              hint={fmtDM(serie[stats.peakIdx].data)}
              accent="text-amber-400"
              icon={<TrendingUp className="h-3 w-3" />}
            />
          )}
        </div>
      </div>

      <div ref={wrapRef} className="relative p-5">
        {loading ? (
          <div className="h-64 animate-pulse rounded-md bg-secondary/30" />
        ) : serie.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">
            Sem dados no período.
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-64 w-full"
              preserveAspectRatio="xMidYMid meet"
              onMouseMove={handleMove}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id="dd-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* grade horizontal */}
              {ticks.map((t, i) => {
                const y = PAD.t + innerH - (t / top) * innerH;
                return (
                  <g key={i}>
                    <line
                      x1={PAD.l}
                      x2={W - PAD.r}
                      y1={y}
                      y2={y}
                      stroke="hsl(var(--border) / 0.35)"
                      strokeDasharray={i === ticks.length - 1 ? "0" : "2 4"}
                    />
                    <text
                      x={PAD.l - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-muted-foreground text-[10px] tabular-nums"
                    >
                      {BRLk(t)}
                    </text>
                  </g>
                );
              })}

              {/* área */}
              <path d={areaPath} fill="url(#dd-area)" />
              {/* linha média */}
              {stats.avg > 0 && (
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={PAD.t + innerH - (stats.avg / top) * innerH}
                  y2={PAD.t + innerH - (stats.avg / top) * innerH}
                  stroke="#38bdf8"
                  strokeDasharray="3 5"
                  strokeWidth={1}
                  opacity={0.6}
                />
              )}
              {/* linha principal */}
              <path
                d={linePath}
                fill="none"
                stroke="#10b981"
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* pontos */}
              {points.map((p, i) => {
                const active = hover === i;
                const isPeak = i === stats.peakIdx;
                return (
                  <g key={i}>
                    {isPeak && (
                      <circle cx={p.x} cy={p.y} r={6} fill="#f59e0b" opacity={0.25} />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={active ? 4.5 : isPeak ? 3.5 : 0}
                      fill={isPeak ? "#f59e0b" : "#10b981"}
                      stroke="hsl(var(--background))"
                      strokeWidth={1.5}
                    />
                  </g>
                );
              })}

              {/* crosshair + hover */}
              {hoverPoint && (
                <>
                  <line
                    x1={hoverPoint.x}
                    x2={hoverPoint.x}
                    y1={PAD.t}
                    y2={PAD.t + innerH}
                    stroke="hsl(var(--foreground) / 0.2)"
                    strokeDasharray="2 3"
                  />
                  <circle
                    cx={hoverPoint.x}
                    cy={hoverPoint.y}
                    r={5}
                    fill="#10b981"
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  />
                </>
              )}

              {/* eixo X — labels esparsos */}
              {serie.map((s, i) => {
                const showEvery = Math.max(1, Math.ceil(serie.length / 8));
                if (i % showEvery !== 0 && i !== serie.length - 1) return null;
                const x =
                  serie.length === 1
                    ? PAD.l + innerW / 2
                    : PAD.l + (i / (serie.length - 1)) * innerW;
                return (
                  <text
                    key={s.data}
                    x={x}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px] tabular-nums"
                  >
                    {fmtDM(s.data)}
                  </text>
                );
              })}
            </svg>

            {/* Tooltip HTML — segue o ponto */}
            {hoverPoint && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
                style={{
                  left: `${(hoverPoint.x / W) * 100}%`,
                  top: `${((hoverPoint.y / H) * 100) * 0.88}%`,
                  marginTop: -8,
                }}
              >
                <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {fmtDM(hoverPoint.s.data)}
                </div>
                <div className="mt-0.5 font-display text-sm font-semibold tabular-nums text-emerald-400">
                  {BRL(hoverPoint.s.total)}
                </div>
                <div className="text-[0.65rem] tabular-nums text-muted-foreground">
                  {hoverPoint.s.vendas} venda{hoverPoint.s.vendas !== 1 ? "s" : ""}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Badge({
  label,
  value,
  accent,
  hint,
  icon,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-md border border-border/60 bg-background/40 px-2.5 py-1">
      <div className="flex items-center gap-1 text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`text-xs font-semibold tabular-nums ${accent ?? "text-foreground"}`}>
        {value}
        {hint && <span className="ml-1 text-[0.6rem] text-muted-foreground">({hint})</span>}
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
