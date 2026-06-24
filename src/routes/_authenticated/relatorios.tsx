import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles, TrendingUp, TrendingDown, Target, Calendar, Users, Award, Activity,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { getRelatoriosStats } from "@/lib/relatorios.functions";
import { useWorkspace } from "@/lib/workspace-context";
import { DateRangeFilter, computeRange, type DateRangeValue } from "@/components/date-range-filter";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — MULTIUM" },
      { name: "description", content: "Inteligência estratégica da operação: tendências, projeções e diagnóstico." },
    ],
  }),
  component: Relatorios,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const NUM = "font-sans tabular-nums tracking-tight font-semibold";

const PALETTE = ["#e94560", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#94a3b8"];

function Relatorios() {
  const { workspace } = useWorkspace();
  const fetchStats = useServerFn(getRelatoriosStats);
  const [range, setRange] = useState<DateRangeValue>(() => computeRange("ano"));
  const expertFilter = workspace.id === "all" ? null : workspace.id;

  const { data, isLoading } = useQuery({
    queryKey: ["relatorios", range.from, range.to, expertFilter],
    queryFn: () => fetchStats({ data: { from: range.from, to: range.to, expert: expertFilter } }),
  });

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto max-w-7xl px-8 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className={`text-[0.65rem] uppercase tracking-[0.28em] ${workspace.accent.text}`}>
              — Inteligência estratégica
            </p>
            <h1 className="mt-2 font-display text-3xl leading-tight md:text-4xl">
              <em className="text-accent">Relatórios</em> & Diagnóstico
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Tendências, projeções e leitura clínica do que tá rodando.
            </p>
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>

        {/* AI Insights */}
        <section className="mt-8">
          <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 via-card/60 to-background p-7">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-5 w-5 text-accent" />
                <h2 className="font-display text-xl">Alinhamento <em className="text-accent">estratégico</em></h2>
              </div>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Leitura automática do período
              </p>
              {isLoading || !data ? (
                <div className="mt-5 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-secondary/30" />
                  ))}
                </div>
              ) : (
                <ul className="mt-5 grid gap-3 md:grid-cols-2">
                  {data.insights.map((ins, i) => {
                    const toneCls =
                      ins.tone === "positivo" ? "border-emerald-400/30 bg-emerald-400/5"
                      : ins.tone === "alerta" ? "border-rose-400/30 bg-rose-400/5"
                      : ins.tone === "destaque" ? "border-amber-400/30 bg-amber-400/5"
                      : "border-border bg-card/40";
                    return (
                      <li key={i} className={`group rounded-xl border ${toneCls} p-4 transition hover:translate-y-[-1px]`}>
                        <div className="flex items-start gap-3">
                          <span className="text-2xl leading-none">{ins.icon}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">{ins.title}</div>
                            <div className="mt-1 text-[0.82rem] text-muted-foreground">{ins.text}</div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* KPIs */}
        <section className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Faturamento no período"
            value={data ? BRL(data.sumPeriod) : "—"}
            sub={data
              ? <DeltaPill pct={data.periodDiffPct} compareLabel={`vs ${BRL(data.sumPrevPeriod)} ant.`} />
              : "Calculando…"}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <KpiCard
            label="Últimos 7 dias"
            value={data ? BRL(data.sumWow) : "—"}
            sub={data
              ? <DeltaPill pct={data.wowDiffPct} compareLabel={`vs ${BRL(data.sumPrevWow)} sem. ant.`} />
              : "Calculando…"}
            icon={<Activity className="h-4 w-4" />}
          />
          <KpiCard
            label="Projeção do mês"
            value={data ? BRL(data.projectedMonth) : "—"}
            sub={data ? `Média diária × ${data.daysInMonth} dias` : "—"}
            icon={<Target className="h-4 w-4" />}
            accent
          />
          <KpiCard
            label="Ticket médio"
            value={data ? BRL(data.ticketMedioPeriod) : "—"}
            sub={data ? `${data.vendasPeriod} vendas no período` : "—"}
            icon={<Award className="h-4 w-4" />}
          />
        </section>

        {/* Charts */}
        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Faturamento diário */}
          <div className="rounded-2xl border border-border bg-card/40 p-6 lg:col-span-2">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> Faturamento diário · 30d
                </div>
                <h3 className="mt-1 font-display text-lg">Ritmo da operação</h3>
              </div>
              {data && (
                <div className="text-right">
                  <div className={`text-xs ${NUM} text-muted-foreground`}>Total 30d</div>
                  <div className={`font-display text-xl ${NUM}`}>
                    {BRL(data.serieDaily.reduce((a, d) => a + d.total, 0))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 h-[280px]">
              {data && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.serieDaily}>
                    <defs>
                      <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e94560" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#e94560" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="data"
                      tickFormatter={(v: string) => v.slice(8) + "/" + v.slice(5, 7)}
                      stroke="rgba(255,255,255,0.3)"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                      stroke="rgba(255,255,255,0.3)"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={42}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.16 0.006 270)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(v: string) => v.split("-").reverse().join("/")}
                      formatter={(v: number) => [BRL(v), "Faturamento"]}
                    />
                    <Area type="monotone" dataKey="total" stroke="#e94560" strokeWidth={2} fill="url(#gFat)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top Vendedores */}
          <div className="rounded-2xl border border-border bg-card/40 p-6">
            <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Top vendedores
            </div>
            <h3 className="mt-1 font-display text-lg">Por UTM</h3>
            <div className="mt-5 h-[220px]">
              {data && data.topVendedores.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.topVendedores}
                      dataKey="total"
                      nameKey="utm"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {data.topVendedores.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.16 0.006 270)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number, n: string) => [BRL(v), n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {data?.topVendedores.slice(0, 5).map((v, i) => (
                <li key={v.utm} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="truncate text-foreground">{v.utm}</span>
                  </div>
                  <span className={`${NUM} text-muted-foreground`}>{v.pct.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Breakdown por expert */}
        <section className="mt-6 rounded-2xl border border-border bg-card/40 p-6">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
                Distribuição por operação
              </div>
              <h3 className="mt-1 font-display text-lg">Quem puxou o período</h3>
            </div>
            {data && (
              <div className={`text-xs text-muted-foreground ${NUM}`}>
                {data.expertBreakdown.length} operações · {BRL(data.sumPeriod)} total
              </div>
            )}
          </div>
          <div className="mt-5 h-[260px]">
            {data && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.expertBreakdown} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="nome" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    stroke="rgba(255,255,255,0.3)"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.16 0.006 270)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    formatter={(v: number) => [BRL(v), "Faturamento"]}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {data.expertBreakdown.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function KpiCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={[
      "relative overflow-hidden rounded-2xl border p-5 transition",
      accent ? "border-accent/40 bg-gradient-to-br from-accent/10 to-card/40" : "border-border bg-card/40 hover:border-accent/30",
    ].join(" ")}>
      <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
        <span>{label}</span>
        {icon && <span className="text-accent/70">{icon}</span>}
      </div>
      <div className={`mt-3 font-display text-3xl ${NUM}`}>{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function DeltaPill({ pct, compareLabel }: { pct: number; compareLabel: string }) {
  const positive = pct >= 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-medium",
        positive ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300",
      ].join(" ")}>
        {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {Math.abs(pct).toFixed(1)}%
      </span>
      <span className="text-muted-foreground">{compareLabel}</span>
    </span>
  );
}
