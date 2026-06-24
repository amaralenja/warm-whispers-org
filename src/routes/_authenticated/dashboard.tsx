import { useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, ShoppingBag, Receipt, Wallet, AlertTriangle, Coins, ArrowUpRight, Users, Settings, Sparkles } from "lucide-react";
import { getOperacoesStats, type ExpertStats } from "@/lib/operacoes.functions";
import { useWorkspace } from "@/lib/workspace-context";
import { useDashboardConfig } from "@/lib/dashboard-config";
import { DashboardConfigDialog } from "@/components/dashboard-config-dialog";
import { DateRangeFilter, computeRange, type DateRangeValue } from "@/components/date-range-filter";
import { ParticipacaoVendedores } from "@/components/participacao-vendedores";
import { DesempenhoDiario } from "@/components/desempenho-diario";
import { ReembolsosList } from "@/components/reembolsos-list";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MULTIUM" }] }),
  component: Dashboard,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const NUM = "font-sans tabular-nums tracking-tight font-semibold";

const EXPERT_ACCENT: Record<string, string> = {
  Caio: "bg-violet-400",
  Gustavo: "bg-orange-400",
  Jessica: "bg-emerald-400",
};

function Dashboard() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { workspace } = useWorkspace();
  const { config, getShare } = useDashboardConfig();
  const fetchOps = useServerFn(getOperacoesStats);

  const [range, setRange] = useState<DateRangeValue>(() => computeRange("mes"));
  const [configOpen, setConfigOpen] = useState(false);

  const expertFilter = workspace.id === "all" ? null : workspace.id;

  const { data, isLoading } = useQuery({
    queryKey: ["operacoes-stats", range.from, range.to, expertFilter],
    queryFn: () => fetchOps({ data: { from: range.from, to: range.to, expert: expertFilter } }),
  });

  const experts = data?.experts ?? [];
  const visibleExperts =
    workspace.id === "all" ? experts : experts.filter((e) => e.nome === workspace.id);

  const totalFat = workspace.id === "all"
    ? data?.totalFaturamento ?? 0
    : visibleExperts.reduce((a, e) => a + e.faturamento, 0);
  const totalVendas = workspace.id === "all"
    ? data?.totalVendas ?? 0
    : visibleExperts.reduce((a, e) => a + e.vendas, 0);
  const totalReemb = workspace.id === "all"
    ? data?.totalReembolsos ?? 0
    : visibleExperts.reduce((a, e) => a + e.reembolsos, 0);
  const tmGeral = data?.ticketMedioGeral ?? 0;
  const gastosMes = data?.gastosMes ?? 0;

  // Nossa parte = soma do faturamento × % de cada expert visível
  const nossaParte = visibleExperts.reduce(
    (acc, e) => acc + e.faturamento * (getShare(e.nome) / 100),
    0,
  );
  const saldoEstimado = nossaParte - gastosMes;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto max-w-7xl px-8 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className={`text-[0.65rem] uppercase tracking-[0.28em] ${workspace.accent.text}`}>
              — {workspace.id === "all" ? "Visão geral" : `Squad · ${workspace.nome}`}
            </p>
            <h1 className="mt-2 font-display text-3xl leading-tight md:text-4xl">
              Boa, <em className="text-accent">{user?.email?.split("@")[0]}</em>.
            </h1>
          </div>
          <div className="flex items-start gap-2">
            <DateRangeFilter value={range} onChange={setRange} />
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/40 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
              title={workspace.id === "all" ? "Configurar todas as operações" : `Configurar ${workspace.nome}`}
            >
              <Settings className="h-3.5 w-3.5" />
              Configurar
            </button>
          </div>
        </div>

        <Tabs defaultValue="geral" className="mt-8">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="geral" className="gap-2">
              <TrendingUp className="h-3.5 w-3.5" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="vendedores" className="gap-2">
              <Users className="h-3.5 w-3.5" />
              Vendedores
            </TabsTrigger>
          </TabsList>

          {/* ============ ABA GERAL ============ */}
          <TabsContent value="geral" className="mt-6 space-y-6">
            {/* KPIs */}
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
              <Kpi
                icon={<TrendingUp className="h-4 w-4" />}
                label="Faturamento"
                value={isLoading ? "—" : BRL(totalFat)}
                accent="text-emerald-400"
              />
              <Kpi
                icon={<ShoppingBag className="h-4 w-4" />}
                label="Vendas"
                value={isLoading ? "—" : totalVendas.toLocaleString("pt-BR")}
              />
              <Kpi
                icon={<Receipt className="h-4 w-4" />}
                label="Ticket Médio"
                value={isLoading ? "—" : BRL(tmGeral)}
                accent="text-sky-400"
              />
              <Kpi
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Reembolsos"
                value={isLoading ? "—" : String(totalReemb)}
                accent={totalReemb > 0 ? "text-rose-400" : "text-foreground"}
              />
            </section>

            {/* Nossa Parte — sempre que houver % configurado */}
            <section className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-5">
              <div className="flex items-center gap-2 text-emerald-400">
                <Sparkles className="h-4 w-4" />
                <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em]">Nossa Parte</span>
              </div>
              <div className={`mt-2 text-4xl ${NUM} text-emerald-400`}>
                {isLoading ? "—" : BRL(nossaParte)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {visibleExperts.length === 0
                  ? "Sem operações no período"
                  : visibleExperts.map((e) => `${e.nome} ${getShare(e.nome)}%`).join(" · ")}
              </p>
            </section>

            {/* Desempenho diário */}
            <DesempenhoDiario serie={data?.serieDiaria ?? []} loading={isLoading} />

            {/* Financeiro (toggle pela config) */}
            {config.showFinanceiro && workspace.id === "all" && (
              <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
                <MiniCard
                  icon={<Wallet className="h-4 w-4" />}
                  label="Saldo Estimado"
                  value={isLoading ? "—" : BRL(saldoEstimado)}
                  hint="Nossa parte − gastos do mês"
                  accent={saldoEstimado >= 0 ? "text-emerald-400" : "text-rose-400"}
                />
                {config.showGastosCard && (
                  <MiniCard
                    icon={<AlertTriangle className="h-4 w-4" />}
                    label="Gastos do Mês"
                    value={isLoading ? "—" : BRL(gastosMes)}
                    hint="Financeiro · mês atual"
                    accent="text-rose-400"
                  />
                )}
                <MiniCard
                  icon={<Coins className="h-4 w-4" />}
                  label="Reembolsos"
                  value={isLoading ? "—" : String(totalReemb)}
                  hint="Total contabilizado no período"
                  accent="text-sky-400"
                />
              </section>
            )}
          </TabsContent>

          {/* ============ ABA VENDEDORES ============ */}
          <TabsContent value="vendedores" className="mt-6 space-y-6">
            {/* Tabela de experts */}
            <section className="overflow-hidden rounded-2xl border border-border bg-card/40">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">Performance por Expert</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Faturamento, vendas e participação no período</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </div>

              {isLoading ? (
                <div className="space-y-px">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse bg-secondary/20" />
                  ))}
                </div>
              ) : visibleExperts.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Sem dados no período selecionado.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-[1fr_120px_120px_120px_140px] gap-4 px-5 py-3 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                    <div>Expert</div>
                    <div className="text-right">Vendas</div>
                    <div className="text-right">Ticket Médio</div>
                    <div className="text-right">Reembolsos</div>
                    <div className="text-right">Faturamento</div>
                  </div>
                  {visibleExperts.map((e) => (
                    <ExpertRow key={e.id} expert={e} />
                  ))}
                </div>
              )}
            </section>

            {/* Participação por vendedor */}
            <ParticipacaoVendedores vendedores={data?.vendedores ?? []} loading={isLoading} />

            {/* Vendas Reembolsadas */}
            <ReembolsosList
              reembolsos={data?.reembolsos ?? []}
              totalValor={data?.totalValorReembolsado ?? 0}
              loading={isLoading}
            />
          </TabsContent>
        </Tabs>
      </div>

      <DashboardConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        experts={experts.map((e) => ({ id: e.id, nome: e.nome }))}
        scoped={workspace.id !== "all"}
        scopedName={workspace.id !== "all" ? workspace.nome : undefined}
      />
    </main>
  );
}

/* ---------------- componentes ---------------- */

function Kpi({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em]">{label}</span>
      </div>
      <div className={`mt-3 text-3xl ${NUM} ${accent ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function ExpertRow({ expert }: { expert: ExpertStats }) {
  const dot = EXPERT_ACCENT[expert.nome] ?? "bg-accent";
  const pct = Math.round(expert.pctTotal * 100);
  return (
    <div className="grid grid-cols-[1fr_120px_120px_120px_140px] items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/30">
      <div className="flex items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <div>
          <div className="text-sm font-medium">{expert.nome}</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-secondary/60">
              <div className={`h-full ${dot}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
            </div>
            <span className="text-[0.65rem] tabular-nums text-muted-foreground">{pct}%</span>
          </div>
        </div>
      </div>
      <div className={`text-right text-sm ${NUM}`}>{expert.vendas}</div>
      <div className={`text-right text-sm ${NUM} text-sky-400`}>{BRL(expert.ticketMedio)}</div>
      <div className={`text-right text-sm ${NUM} ${expert.reembolsos > 0 ? "text-rose-400" : "text-muted-foreground"}`}>
        {expert.reembolsos}
      </div>
      <div className={`text-right text-base ${NUM} text-foreground`}>{BRL(expert.faturamento)}</div>
    </div>
  );
}

function MiniCard({
  icon, label, value, hint, accent,
}: { icon: React.ReactNode; label: string; value: string; hint: string; accent?: string }) {
  return (
    <div className="bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em]">{label}</span>
      </div>
      <div className={`mt-3 text-2xl ${NUM} ${accent ?? "text-foreground"}`}>{value}</div>
      <div className="mt-1 text-[0.7rem] text-muted-foreground">{hint}</div>
    </div>
  );
}
