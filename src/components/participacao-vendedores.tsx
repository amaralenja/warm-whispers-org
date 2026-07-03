import type { VendedorStat } from "@/lib/operacoes.functions";

const BRL = (n: number) =>
  (Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

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
  const str = asStr(s);
  const t = str.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  if (!t) return "?";
  const parts = t.split(/\s+/);
  if (parts.length === 1) return t.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function asStr(v: unknown) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asStr).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return asStr(obj.nome ?? obj.name ?? obj.utm ?? obj.label ?? obj.value ?? "");
  }
  return "";
}

function asNum(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/R\$\s?/g, "").replace(/\s/g, "").trim();
    const normalized = cleaned.includes(",")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return asNum(obj.value ?? obj.valor ?? obj.total ?? obj.amount ?? 0);
  }
  return 0;
}

type SafeVendor = { utm: string; faturamento: number; vendas: number; pctTotal: number };

function toSafeVendors(input: unknown): SafeVendor[] {
  if (!Array.isArray(input)) return [];
  const out: SafeVendor[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const utm = asStr(v.utm ?? v.nome ?? v.name ?? v.label) || "Vendedor";
    const faturamento = asNum(v.faturamento);
    const vendas = asNum(v.vendas);
    const pctTotal = asNum(v.pctTotal);
    out.push({
      utm,
      faturamento,
      vendas,
      pctTotal,
    });
  }
  return out;
}

export function ParticipacaoVendedores({
  vendedores: vendedoresProp,
  loading,
}: {
  vendedores?: VendedorStat[] | null;
  loading?: boolean;
}) {
  const vendedores = toSafeVendors(vendedoresProp);
  const total = vendedores.reduce((acc, v) => acc + v.faturamento, 0);

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
            <UsersIcon className="h-3.5 w-3.5" />
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
                const fat = v.faturamento;
                const vendas = v.vendas;
                const pct = v.pctTotal * 100;
                const isTop = i === 0;
                const utmStr = v.utm;
                return (
                  <div
                    key={utmStr || i}
                    className="group relative grid grid-cols-[1.5rem_2rem_1fr_auto_auto] items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-1.5 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  >
                    <span className="text-center text-[0.65rem] font-bold tabular-nums text-muted-foreground">
                      {isTop ? <TrophyIcon className="mx-auto h-3 w-3 text-amber-400" /> : `#${i + 1}`}
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

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978" />
      <path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978" />
      <path d="M18 9h1.5a1 1 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" />
      <path d="M6 9H4.5a1 1 0 0 1 0-5H6" />
    </svg>
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
