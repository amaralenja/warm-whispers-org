import { useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  TrendingUp, ShoppingBag, Receipt, AlertTriangle, Coins,
  Users, Settings, Activity, Target, ArrowUpRight, ArrowDownRight,
  BarChart3, UserCheck, Percent, Wallet,
} from "lucide-react";
import { getDashboardStats, type DashboardOpStats } from "@/lib/operacoes.functions";
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

const OP_ACCENT: Record<string, { bg: string; ring: string; text: string; bar: string }> = {
  Caio:    { bg: "bg-violet-500/10", ring: "ring-violet-500/20", text: "text-violet-400", bar: "bg-violet-400" },
  Gustavo: { bg: "bg-orange-500/10", ring: "ring-orange-500/20", text: "text-orange-400", bar: "bg-orange-400" },
  Jessica: { bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", text: "text-emerald-400", bar: "bg-emerald-400" },
};
const DEFAULT_ACCENT = { bg: "bg-indigo-500/10", ring: "ring-indigo-500/20", text: "text-indigo-400", bar: "bg-indigo-400" };
const accentFor = (name: string) => OP_ACCENT[name] ?? DEFAULT_ACCENT;

function Dashboard() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { workspace } = useWorkspace();
  const { config, getShare } = useDashboardConfig();
  const fetchStats = useServerFn(getDashboardStats);

  const [range, setRange] = useState<DateRangeValue>(() => computeRange("hoje"));
  const [configOpen, setConfigOpen] = useState(false);
  const [expandedOp, setExpandedOp] = useState<string | null>(null);

  const expertFilter = workspace.id === "all" ? null : workspace.id;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats", range.from, range.to, expertFilter, config.includeHighTicket],
    queryFn: () => fetchStats({ data: { from: range.from, to: range.to, expert: expertFilter, includeHighTicket: config.includeHighTicket } }),
    staleTime: 30_000,
  });

  const ops = data?.ops ?? [];
  const visibleOps = workspace.id === "all" ? ops : ops.filter((o) => o.nome === workspace.id);
  const totalFat = data?.totalFat ?? 0;
  const totalVendas = data?.totalVendas ?? 0;
  const totalLeads = data?.totalLeads ?? 0;
  const totalReemb = data?.totalReembolsos ?? 0;
  const tmGeral = data?.ticketMedioGeral ?? 0;
  const conversaoGeral = totalLeads > 0 ? ((totalVendas / totalLeads) * 100) : 0;
  const gastosMes = data?.gastosMes ?? 0;
  const saldoEstimado = totalFat - gastosMes;
  const nossaParte = visibleOps.reduce((a, o) => a + o.faturamento * (getShare(o.nome) / 100), 0);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto max-w-7xl px-8 py-10">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className={`text-[0.65rem] uppercase tracking-[0.28em] ${workspace.accent.text}`}>
              — {workspace.id === "all" ? "Visão Geral" : `Operação · ${workspace.nome}`}
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
            >
              <Settings className="h-3.5 w-3.5" />
              Config
            </button>
          </div>
        </div>

        <Tabs defaultValue="geral" className="mt-8">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="geral" className="gap-2">
              <BarChart3 className="h-3.5 w-3.5" />
              Operações
            </TabsTrigger>
            <TabsTrigger value="vendedores" className="gap-2">
              <Users className="h-3.5 w-3.5" />
              Vendedores
            </TabsTrigger>
          </TabsList>

          {/* ════════ ABA GERAL ════════ */}
          <TabsContent value="geral" className="mt-6 space-y-6">

            {/* ── KPIs Globais ── */}
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-6">
              <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Faturamento" value={isLoading ? "—" : BRL(totalFat)} accent="text-emerald-400" />
              <Kpi icon={<ShoppingBag className="h-4 w-4" />} label="Vendas" value={isLoading ? "—" : totalVendas.toLocaleString("pt-BR")} />
              <Kpi icon={<UserCheck className="h-4 w-4" />} label="Leads" value={isLoading ? "—" : totalLeads.toLocaleString("pt-BR")} accent="text-sky-400" />
              <Kpi icon={<Percent className="h-4 w-4" />} label="Conversão" value={isLoading ? "—" : `${conversaoGeral.toFixed(1)}%`} accent="text-violet-400" />
              <Kpi icon={<Receipt className="h-4 w-4" />} label="Ticket Médio" value={isLoading ? "—" : BRL(tmGeral)} accent="text-amber-400" />
              <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Reembolsos" value={isLoading ? "—" : String(totalReemb)} accent={totalReemb > 0 ? "text-rose-400" : "text-foreground"} />
            </section>

            {/* ── Nossa Parte ── */}
            {workspace.id === "all" && (
              <section className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-5">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Coins className="h-4 w-4" />
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em]">Nossa Parte (Share)</span>
                </div>
                <div className={`mt-2 text-4xl ${NUM} text-emerald-400`}>
                  {isLoading ? "—" : BRL(nossaParte)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {visibleOps.length === 0
                    ? "Sem operações no período"
                    : visibleOps.map((o) => `${o.nome} ${getShare(o.nome)}%`).join(" · ")}
                </p>
              </section>
            )}

            {/* ── Tabela de Operações ── */}
            {workspace.id === "all" && (
              <section className="overflow-hidden rounded-2xl border border-border bg-card/40">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">Performance por Operação</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ops.length} {ops.length === 1 ? "operação ativa" : "operações ativas"} · Leads, vendas, conversão e fontes de tráfego
                    </p>
                  </div>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>

                {isLoading ? (
                  <div className="space-y-px">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-20 animate-pulse bg-secondary/20" />
                    ))}
                  </div>
                ) : visibleOps.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-muted-foreground">Sem dados no período.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_80px_90px_80px_80px_100px_100px] gap-2 px-5 py-2.5 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                      <div>Operação</div>
                      <div className="text-right">Vendas</div>
                      <div className="text-right">Faturamento</div>
                      <div className="text-right">Leads</div>
                      <div className="text-right">Conversão</div>
                      <div className="text-right">Ticket Médio</div>
                      <div className="text-right">Reembolsos</div>
                    </div>

                    {visibleOps.map((op) => {
                      const ac = accentFor(op.nome);
                      const isExpanded = expandedOp === op.nome;
                      return (
                        <div key={op.id}>
                          <button
                            type="button"
                            onClick={() => setExpandedOp(isExpanded ? null : op.nome)}
                            className="w-full text-left transition-colors hover:bg-secondary/30"
                          >
                            <div className="grid grid-cols-[1fr_80px_90px_80px_80px_100px_100px] items-center gap-2 px-5 py-4">
                              <div className="flex items-center gap-3">
                                <span className={`h-2.5 w-2.5 rounded-full ${ac.bar}`} />
                                <div>
                                  <div className="text-sm font-semibold">{op.nome}</div>
                                  <div className="mt-0.5 flex items-center gap-2">
                                    <div className="h-1 w-20 overflow-hidden rounded-full bg-secondary/60">
                                      <div className={`h-full ${ac.bar} transition-all`} style={{ width: `${Math.min(100, Math.max(2, op.pctTotal * 100))}%` }} />
                                    </div>
                                    <span className="text-[0.6rem] tabular-nums text-muted-foreground">{(op.pctTotal * 100).toFixed(1)}%</span>
                                  </div>
                                </div>
                              </div>
                              <div className={`text-right text-sm ${NUM}`}>{op.vendas}</div>
                              <div className={`text-right text-sm ${NUM} text-foreground`}>{BRL(op.faturamento)}</div>
                              <div className={`text-right text-sm ${NUM} text-sky-400`}>{op.leads.toLocaleString("pt-BR")}</div>
                              <div className="text-right">
                                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                                  op.conversao >= 5 ? "bg-emerald-500/15 text-emerald-400"
                                  : op.conversao >= 2 ? "bg-amber-500/15 text-amber-400"
                                  : "bg-rose-500/15 text-rose-400"
                                }`}>
                                  {op.conversao.toFixed(1)}%
                                </span>
                              </div>
                              <div className={`text-right text-sm ${NUM} text-sky-400`}>{BRL(op.ticketMedio)}</div>
                              <div className={`text-right text-sm ${NUM} ${op.reembolsos > 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                                {op.reembolsos}
                              </div>
                            </div>
                          </button>

                          {/* Fontes de tráfego (expandível) */}
                          {isExpanded && op.fontes.length > 0 && (
                            <div className="border-t border-border/50 bg-secondary/10 px-5 py-3">
                              <div className="mb-2 text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                Fontes de Tráfego
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {op.fontes.map((f) => (
                                  <div key={f.fonte} className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/60 px-3 py-2">
                                    <span className="text-xs font-medium text-foreground">{f.fonte}</span>
                                    <span className={`text-xs font-semibold tabular-nums ${ac.text}`}>{f.vendas} vendas</span>
                                    <span className="text-xs tabular-nums text-muted-foreground">{BRL(f.faturamento)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {isExpanded && op.fontes.length === 0 && (
                            <div className="border-t border-border/50 bg-secondary/10 px-5 py-3">
                              <span className="text-xs text-muted-foreground">Sem fontes de tráfego registradas.</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Total row */}
                    {visibleOps.length > 1 && (
                      <div className="grid grid-cols-[1fr_80px_90px_80px_80px_100px_100px] items-center gap-2 bg-emerald-500/5 px-5 py-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                          <TrendingUp className="h-3.5 w-3.5" />
                          Total
                        </div>
                        <div className={`text-right text-sm font-bold ${NUM}`}>{totalVendas}</div>
                        <div className={`text-right text-sm font-bold ${NUM} text-emerald-400`}>{BRL(totalFat)}</div>
                        <div className={`text-right text-sm font-bold ${NUM} text-sky-400`}>{totalLeads.toLocaleString("pt-BR")}</div>
                        <div className="text-right">
                          <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-xs font-bold tabular-nums text-emerald-400">
                            {conversaoGeral.toFixed(1)}%
                          </span>
                        </div>
                        <div className={`text-right text-sm font-bold ${NUM} text-sky-400`}>{BRL(tmGeral)}</div>
                        <div className={`text-right text-sm font-bold ${NUM} ${totalReemb > 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                          {totalReemb}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ── Operação única (quando workspace filtrado) ── */}
            {workspace.id !== "all" && visibleOps.length > 0 && (
              <section className="space-y-4">
                {visibleOps.map((op) => {
                  const ac = accentFor(op.nome);
                  return (
                    <div key={op.id} className={`rounded-2xl border p-5 ${ac.ring} bg-gradient-to-br ${ac.bg} to-transparent`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-3 w-3 rounded-full ${ac.bar}`} />
                          <span className="text-lg font-semibold">{op.nome}</span>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums ${ac.text}`}>{BRL(op.faturamento)}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-5 gap-4 border-t border-border/30 pt-4">
                        <StatBlock label="Vendas" value={String(op.vendas)} />
                        <StatBlock label="Leads" value={op.leads.toLocaleString("pt-BR")} accent="text-sky-400" />
                        <StatBlock label="Conversão" value={`${op.conversao.toFixed(1)}%`} accent={op.conversao >= 5 ? "text-emerald-400" : "text-amber-400"} />
                        <StatBlock label="Ticket Médio" value={BRL(op.ticketMedio)} accent="text-sky-400" />
                        <StatBlock label="Reembolsos" value={String(op.reembolsos)} accent={op.reembolsos > 0 ? "text-rose-400" : undefined} />
                      </div>
                      {op.fontes.length > 0 && (
                        <div className="mt-4 border-t border-border/30 pt-4">
                          <div className="mb-2 text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Fontes de Tráfego</div>
                          <div className="flex flex-wrap gap-2">
                            {op.fontes.map((f) => (
                              <div key={f.fonte} className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/40 px-3 py-2">
                                <span className="text-xs font-medium">{f.fonte}</span>
                                <span className={`text-xs font-semibold tabular-nums ${ac.text}`}>{f.vendas} vendas</span>
                                <span className="text-xs tabular-nums text-muted-foreground">{BRL(f.faturamento)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* ── Comparativo de Operações ── */}
            {workspace.id === "all" && (
              <ComparativoOps ops={visibleOps} totalFat={totalFat} loading={isLoading} />
            )}

            {/* ── Desempenho Diário ── */}
            <DesempenhoDiario serie={data?.serieDiaria ?? []} loading={isLoading} />

            {/* ── Financeiro ── */}
            {config.showFinanceiro && workspace.id === "all" && (
              <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
                <MiniCard icon={<Wallet className="h-4 w-4" />} label="Saldo Estimado" value={isLoading ? "—" : BRL(saldoEstimado)} hint="Faturamento − gastos do mês" accent={saldoEstimado >= 0 ? "text-emerald-400" : "text-rose-400"} />
                {config.showGastosCard && (
                  <MiniCard icon={<AlertTriangle className="h-4 w-4" />} label="Gastos do Mês" value={isLoading ? "—" : BRL(gastosMes)} hint="Financeiro · mês atual" accent="text-rose-400" />
                )}
                <MiniCard icon={<Coins className="h-4 w-4" />} label="Reembolsos" value={isLoading ? "—" : String(totalReemb)} hint="Total contabilizado no período" accent="text-sky-400" />
              </section>
            )}

            {/* ── Reembolsos ── */}
            <ReembolsosList reembolsos={data?.reembolsos ?? []} totalValor={data?.reembolsos?.reduce((a: number, r: any) => a + r.valor, 0) ?? 0} loading={isLoading} />
          </TabsContent>

          {/* ════════ ABA VENDEDORES ════════ */}
          <TabsContent value="vendedores" className="mt-6 space-y-6">
            <section className="overflow-hidden rounded-2xl border border-border bg-card/40">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">Performance por Vendedor</h2>
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
              ) : (data?.vendedores ?? []).length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">Sem dados no período selecionado.</div>
              ) : (
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-[1fr_100px_100px_140px] gap-4 px-5 py-3 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                    <div>Vendedor</div>
                    <div className="text-right">Vendas</div>
                    <div className="text-right">Faturamento</div>
                    <div className="text-right">Participação</div>
                  </div>
                  {(data?.vendedores ?? []).map((v) => (
                    <div key={v.utm} className="grid grid-cols-[1fr_100px_100px_140px] items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/30">
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full bg-accent" />
                        <div>
                          <div className="text-sm font-medium">{v.nome}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1 w-24 overflow-hidden rounded-full bg-secondary/60">
                              <div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.max(2, v.pctTotal * 100))}%` }} />
                            </div>
                            <span className="text-[0.65rem] tabular-nums text-muted-foreground">{(v.pctTotal * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                      <div className={`text-right text-sm ${NUM}`}>{v.vendas}</div>
                      <div className={`text-right text-base ${NUM} text-foreground`}>{BRL(v.faturamento)}</div>
                      <div className="text-right">
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                          {totalFat > 0 ? `${((v.faturamento / totalFat) * 100).toFixed(1)}%` : "0%"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <ParticipacaoVendedores vendedores={data?.vendedores ?? []} loading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>

      <DashboardConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        experts={ops.map((o) => ({ id: o.id, nome: o.nome }))}
        scoped={workspace.id !== "all"}
        scopedName={workspace.id !== "all" ? workspace.nome : undefined}
      />
    </main>
  );
}

/* ── Componentes auxiliares ── */

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
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

function StatBlock({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg ${NUM} ${accent ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function MiniCard({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: string; hint: string; accent?: string }) {
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

function ComparativoOps({ ops, totalFat, loading }: { ops: DashboardOpStats[]; totalFat: number; loading: boolean }) {
  const visible = ops.filter((o) => o.faturamento > 0 || o.vendas > 0);
  if (!loading && visible.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card/40 p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Activity className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em]">Comparativo de Operações</span>
      </div>

      {loading ? (
        <div className="mt-4 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-secondary/20" />
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {[...visible].sort((a, b) => b.faturamento - a.faturamento).map((o) => {
            const pct = totalFat > 0 ? (o.faturamento / totalFat) * 100 : 0;
            const ac = accentFor(o.nome);
            return (
              <div key={o.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{o.nome}</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">{o.vendas} vendas</span>
                    <span className="text-muted-foreground">{o.leads} leads</span>
                    <span className={`${NUM} text-foreground`}>{BRL(o.faturamento)}</span>
                    <span className="w-12 text-right text-muted-foreground">{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary/40">
                  <div className={`h-full rounded-full ${ac.bar} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
