import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/dashboard.functions";
import { getOperacoesStats, type ExpertStats } from "@/lib/operacoes.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MULTIUM" }] }),
  component: Dashboard,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Cor por expert (combina com a referência)
const EXPERT_THEME: Record<string, { ring: string; bar: string; text: string; bg: string; border: string }> = {
  Caio: {
    ring: "ring-blue-500/60",
    bar: "bg-blue-500",
    text: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  Gustavo: {
    ring: "ring-orange-500/60",
    bar: "bg-orange-500",
    text: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
  Jessica: {
    ring: "ring-emerald-500/60",
    bar: "bg-emerald-500",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
};

const DEFAULT_THEME = {
  ring: "ring-accent/60",
  bar: "bg-accent",
  text: "text-accent",
  bg: "bg-accent/10",
  border: "border-accent/30",
};

function Dashboard() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const fetchStats = useServerFn(getDashboardStats);
  const fetchOps = useServerFn(getOperacoesStats);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
  });

  const { data: experts, isLoading: loadingExperts } = useQuery({
    queryKey: ["operacoes-stats"],
    queryFn: () => fetchOps(),
  });

  return (
    <main className="min-h-screen bg-background bg-grain">
      <div className="mx-auto max-w-7xl px-8 py-14">
        <div className="flex items-end justify-between border-b border-border pb-10">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-accent">— Visão geral</p>
            <h1 className="mt-4 font-display text-5xl leading-tight text-balance">
              Boa,{" "}
              <em className="text-accent">{user?.email?.split("@")[0]}</em>
              .
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Resumo da operação. Tudo atualizado em tempo real.
            </p>
          </div>
          <div className="hidden text-right text-xs uppercase tracking-[0.2em] text-muted-foreground md:block">
            {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* Operações — squads por expert */}
        <section className="mt-14">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">— Operações</p>
              <h2 className="mt-2 font-display text-3xl">Squads</h2>
            </div>
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {experts?.length ?? 0} experts
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {loadingExperts && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl border border-border bg-card/40" />
            ))}
            {experts?.map((e) => <ExpertCard key={e.id} expert={e} />)}
          </div>
        </section>

        {/* KPIs gerais */}
        <section className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Faturamento" value={isLoading ? "—" : BRL(data?.faturamento ?? 0)} hint="Bruto total" />
          <Kpi label="Líquido" value={isLoading ? "—" : BRL(data?.liquido ?? 0)} hint="Após plataforma" />
          <Kpi label="Ticket médio" value={isLoading ? "—" : BRL(data?.ticketMedio ?? 0)} hint={`${data?.totalVendas ?? 0} vendas`} />
          <Kpi label="Comissões" value={isLoading ? "—" : BRL(data?.comissoes ?? 0)} hint="Pagas aos closers" accent />
        </section>

        <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <MiniCard label="Leads" value={data?.totalLeads ?? 0} />
          <MiniCard label="Vendas HT" value={data?.htVendasCount ?? 0} />
          <MiniCard
            label="Saldo financeiro"
            value={data ? BRL(data.saldo) : "—"}
            tone={data && data.saldo >= 0 ? "positive" : "negative"}
          />
        </section>
      </div>
    </main>
  );
}

function ExpertCard({ expert }: { expert: ExpertStats }) {
  const theme = EXPERT_THEME[expert.nome] ?? DEFAULT_THEME;
  const initials = expert.nome
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/40 transition-all hover:bg-card/60">
      {/* Top bar */}
      <div className={`h-[3px] w-full ${theme.bar}`} />

      <div className="p-6">
        {/* Header: avatar + nome */}
        <div className="flex items-center gap-3">
          {expert.foto_url ? (
            <img
              src={expert.foto_url}
              alt={expert.nome}
              className={`h-12 w-12 rounded-full object-cover ring-2 ${theme.ring}`}
            />
          ) : (
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${theme.bg} ${theme.text} ring-2 ${theme.ring} font-display text-base`}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg text-foreground">{expert.nome}</div>
            <div className="text-xs text-muted-foreground">
              {expert.vendedoresCount} {expert.vendedoresCount === 1 ? "vendedor" : "vendedores"} no squad
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-y-5">
          <Stat label="Faturamento" value={BRL(expert.faturamento)} valueClass={theme.text} />
          <Stat label="Vendas" value={String(expert.vendas)} />
          <Stat label="Ticket médio" value={BRL(expert.ticketMedio)} />
          <Stat label="Vendedores" value={String(expert.vendedoresCount)} />
        </div>

        {/* Bottom action */}
        <div className={`mt-6 h-px w-full ${theme.bar} opacity-40`} />
        <button
          type="button"
          className={`mt-4 inline-flex w-full items-center justify-center rounded-lg border ${theme.border} ${theme.bg} px-4 py-2.5 text-sm font-medium ${theme.text} transition-all hover:brightness-125`}
        >
          Ver Painel Detalhado →
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-xl ${valueClass ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className="bg-background p-8 transition-colors hover:bg-card">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`mt-4 font-display text-4xl ${accent ? "text-accent" : "text-foreground"}`}>{value}</div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function MiniCard({ label, value, tone }: { label: string; value: string | number; tone?: "positive" | "negative" }) {
  const color = tone === "negative" ? "text-destructive" : tone === "positive" ? "text-[color:var(--success)]" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`mt-3 font-display text-3xl ${color}`}>{value}</div>
    </div>
  );
}
