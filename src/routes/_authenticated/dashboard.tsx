import { useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet, AlertTriangle, Coins } from "lucide-react";
import { getOperacoesStats, type ExpertStats } from "@/lib/operacoes.functions";
import { useWorkspace } from "@/lib/workspace-context";
import { DateRangeFilter, computeRange, type DateRangeValue } from "@/components/date-range-filter";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MULTIUM" }] }),
  component: Dashboard,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const NUM = "font-sans tabular-nums tracking-tight font-semibold";

type ExpertTheme = {
  bar: string;     // gradient or solid bar (top border)
  glow: string;    // soft glow color
  text: string;    // value text color
  chip: string;    // chip bg
  ring: string;    // ring
  dot: string;     // dot bg
};

const THEMES: Record<string, ExpertTheme> = {
  Caio:    { bar: "from-indigo-400 to-violet-500", glow: "shadow-[0_0_60px_-15px_rgba(139,92,246,0.55)]", text: "text-foreground", chip: "bg-violet-500/10", ring: "ring-violet-500/40", dot: "bg-violet-400" },
  Gustavo: { bar: "from-amber-400 to-orange-500",  glow: "shadow-[0_0_60px_-15px_rgba(251,146,60,0.55)]", text: "text-foreground", chip: "bg-orange-500/10", ring: "ring-orange-500/40", dot: "bg-orange-400" },
  Jessica: { bar: "from-emerald-400 to-teal-500",  glow: "shadow-[0_0_60px_-15px_rgba(16,185,129,0.55)]", text: "text-foreground", chip: "bg-emerald-500/10", ring: "ring-emerald-500/40", dot: "bg-emerald-400" },
};
const FALLBACK: ExpertTheme = {
  bar: "from-accent to-accent", glow: "shadow-[0_0_60px_-15px_rgba(255,255,255,0.2)]",
  text: "text-foreground", chip: "bg-accent/10", ring: "ring-accent/40", dot: "bg-accent",
};
const TOTAL_THEME: ExpertTheme = {
  bar: "from-emerald-400 to-emerald-300",
  glow: "shadow-[0_0_70px_-12px_rgba(52,211,153,0.55)]",
  text: "text-emerald-400", chip: "bg-emerald-500/10", ring: "ring-emerald-500/40", dot: "bg-emerald-400",
};

function Dashboard() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { workspace } = useWorkspace();
  const fetchOps = useServerFn(getOperacoesStats);

  const [range, setRange] = useState<DateRangeValue>(() => computeRange("30d"));

  const { data, isLoading } = useQuery({
    queryKey: ["operacoes-stats", range.from, range.to],
    queryFn: () => fetchOps({ data: { from: range.from, to: range.to } }),
  });

  const experts = data?.experts ?? [];
  const visibleExperts =
    workspace.id === "all" ? experts : experts.filter((e) => e.nome === workspace.id);

  // Quando filtra workspace, totais refletem só aquele expert.
  const totalFat = workspace.id === "all"
    ? data?.totalFaturamento ?? 0
    : visibleExperts.reduce((a, e) => a + e.faturamento, 0);
  const totalVendas = workspace.id === "all"
    ? data?.totalVendas ?? 0
    : visibleExperts.reduce((a, e) => a + e.vendas, 0);
  const totalReemb = workspace.id === "all"
    ? data?.totalReembolsos ?? 0
    : visibleExperts.reduce((a, e) => a + e.reembolsos, 0);
  const tmGeral = totalVendas ? totalFat / totalVendas : 0;
  const gastosMes = data?.gastosMes ?? 0;
  const saldoEstimado = totalFat - gastosMes;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background bg-grain">
      <div className="mx-auto max-w-7xl px-8 py-12">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
          <div>
            <p className={`text-xs uppercase tracking-[0.25em] ${workspace.accent.text}`}>
              — {workspace.id === "all" ? "Visão geral" : `Operação · ${workspace.nome}`}
            </p>
            <h1 className="mt-3 font-display text-4xl leading-tight text-balance md:text-5xl">
              Boa, <em className="text-accent">{user?.email?.split("@")[0]}</em>.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {workspace.id === "all"
                ? "Resumo da operação · todos os squads."
                : `Filtrando dados do squad ${workspace.nome}.`}
            </p>
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>

        {/* Linha 1 — Total + por expert */}
        <section className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <TotalCard
            faturamento={totalFat}
            vendas={totalVendas}
            ticketMedio={tmGeral}
            loading={isLoading}
          />
          {isLoading && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[200px] animate-pulse rounded-2xl border border-border bg-card/40" />
          ))}
          {!isLoading && visibleExperts.map((e) => (
            <ExpertSummary key={e.id} expert={e} />
          ))}
        </section>

        {/* Linha 2 — Lucro por expert + Gastos do Mês */}
        <section className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {!isLoading && visibleExperts.map((e) => (
            <LucroCard key={`lucro-${e.id}`} expert={e} />
          ))}
          {workspace.id === "all" && (
            <GastosCard gastos={gastosMes} loading={isLoading} />
          )}
        </section>

        {/* Linha 3 — Saldo Estimado */}
        {workspace.id === "all" && (
          <section className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <SaldoCard saldo={saldoEstimado} loading={isLoading} />
            <div className="hidden xl:block" />
            <div className="hidden xl:block" />
            <ReembolsosCard total={totalReemb} loading={isLoading} />
          </section>
        )}
      </div>
    </main>
  );
}

/* ----------------------------------------------------------- */
/* Cards                                                       */
/* ----------------------------------------------------------- */

function CardShell({
  theme,
  children,
  className = "",
}: {
  theme: ExpertTheme;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-sm transition-all hover:bg-card hover:${theme.glow} ${className}`}
    >
      <div className={`h-[2px] w-full bg-gradient-to-r ${theme.bar}`} />
      <div className="p-5">{children}</div>
    </div>
  );
}

function CardHeader({ theme, label, accent }: { theme: ExpertTheme; label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
      <span className={`text-[0.65rem] font-semibold uppercase tracking-[0.22em] ${accent ? theme.text : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

function TotalCard({
  faturamento, vendas, ticketMedio, loading,
}: { faturamento: number; vendas: number; ticketMedio: number; loading?: boolean }) {
  return (
    <CardShell theme={TOTAL_THEME}>
      <CardHeader theme={TOTAL_THEME} label="Total Geral" accent />
      <div className={`mt-3 text-4xl ${NUM} text-emerald-400`}>
        {loading ? "—" : BRL(faturamento)}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Nosso lucro: <span className="text-emerald-400/80">{loading ? "—" : BRL(faturamento)}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <MicroStat label="Vendas" value={loading ? "—" : String(vendas)} />
        <MicroStat label="Ticket médio (≥97)" value={loading ? "—" : BRL(ticketMedio)} valueClass="text-sky-400" />
      </div>
    </CardShell>
  );
}

function ExpertSummary({ expert }: { expert: ExpertStats }) {
  const theme = THEMES[expert.nome] ?? FALLBACK;
  const pct = Math.round(expert.pctTotal * 100);
  return (
    <CardShell theme={theme}>
      <CardHeader theme={theme} label={expert.nome} accent />
      <div className={`mt-3 text-4xl ${NUM} text-foreground`}>{BRL(expert.faturamento)}</div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <MicroStat label="Vendas" value={String(expert.vendas)} />
        <MicroStat
          label="Reimb."
          value={String(expert.reembolsos)}
          valueClass={expert.reembolsos > 0 ? "text-rose-400" : "text-emerald-400"}
        />
        <MicroStat label="TM (≥97)" value={BRL(expert.ticketMedio)} valueClass="text-sky-400" />
      </div>

      <div className="mt-5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${theme.bar}`}
            style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
          />
        </div>
        <div className="mt-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
          {pct}% do total
        </div>
      </div>
    </CardShell>
  );
}

function LucroCard({ expert }: { expert: ExpertStats }) {
  const theme = THEMES[expert.nome] ?? FALLBACK;
  return (
    <CardShell theme={theme}>
      <div className="flex items-center gap-2">
        <Wallet className={`h-3.5 w-3.5 ${theme.text === "text-foreground" ? "text-muted-foreground" : theme.text}`} />
        <span className={`text-[0.65rem] font-semibold uppercase tracking-[0.22em] ${theme.text === "text-foreground" ? "text-muted-foreground" : theme.text}`}>
          Nosso Lucro — {expert.nome}
        </span>
      </div>
      <div className="mt-1 text-[0.7rem] text-muted-foreground">
        100% de <span className={NUM}>{BRL(expert.faturamento)}</span> bruto
      </div>
      <div className={`mt-4 text-4xl ${NUM} text-foreground`}>{BRL(expert.faturamento)}</div>
    </CardShell>
  );
}

function GastosCard({ gastos, loading }: { gastos: number; loading?: boolean }) {
  const theme: ExpertTheme = {
    bar: "from-rose-400 to-pink-500",
    glow: "shadow-[0_0_60px_-15px_rgba(244,63,94,0.55)]",
    text: "text-rose-400", chip: "bg-rose-500/10", ring: "ring-rose-500/40", dot: "bg-rose-400",
  };
  return (
    <CardShell theme={theme}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-rose-400">
          Gastos do Mês
        </span>
      </div>
      <div className="mt-1 text-[0.7rem] text-muted-foreground">Financeiro — mês atual</div>
      <div className={`mt-4 text-4xl ${NUM} text-rose-400`}>{loading ? "—" : BRL(gastos)}</div>
      <div className="mt-2 text-[0.7rem] text-muted-foreground">Ver detalhes →</div>
    </CardShell>
  );
}

function SaldoCard({ saldo, loading }: { saldo: number; loading?: boolean }) {
  const positive = saldo >= 0;
  const theme: ExpertTheme = {
    bar: positive ? "from-emerald-400 to-teal-500" : "from-rose-400 to-pink-500",
    glow: positive ? "shadow-[0_0_60px_-15px_rgba(16,185,129,0.55)]" : "shadow-[0_0_60px_-15px_rgba(244,63,94,0.55)]",
    text: positive ? "text-emerald-400" : "text-rose-400",
    chip: "", ring: "", dot: positive ? "bg-emerald-400" : "bg-rose-400",
  };
  return (
    <CardShell theme={theme}>
      <CardHeader theme={theme} label="Saldo Estimado" accent />
      <div className="mt-1 text-[0.7rem] text-muted-foreground">Lucro – gastos – reembolsos</div>
      <div className={`mt-4 text-4xl ${NUM} ${theme.text}`}>{loading ? "—" : BRL(saldo)}</div>
    </CardShell>
  );
}

function ReembolsosCard({ total, loading }: { total: number; loading?: boolean }) {
  const theme: ExpertTheme = {
    bar: "from-sky-400 to-blue-500",
    glow: "shadow-[0_0_60px_-15px_rgba(56,189,248,0.55)]",
    text: "text-sky-400", chip: "", ring: "", dot: "bg-sky-400",
  };
  return (
    <CardShell theme={theme}>
      <div className="flex items-center gap-2">
        <Coins className="h-3.5 w-3.5 text-sky-400" />
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-sky-400">
          Reembolsos no Período
        </span>
      </div>
      <div className="mt-1 text-[0.7rem] text-muted-foreground">Total contabilizado</div>
      <div className={`mt-4 text-4xl ${NUM} text-foreground`}>{loading ? "—" : total}</div>
    </CardShell>
  );
}

function MicroStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg ${NUM} ${valueClass ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}
