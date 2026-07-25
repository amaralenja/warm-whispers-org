import { useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  TrendingUp, ShoppingBag, Receipt, AlertTriangle, Coins,
  Users, Settings, Activity,
  BarChart3, UserCheck, Percent, Wallet, Trophy, Sparkles, Crown, Medal,
  LineChart,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { getDashboardStats, type DashboardOpStats } from "@/lib/operacoes.functions";
import { getRankingStats, type RankingItem } from "@/lib/ranking.functions";
import { getRelatoriosStats } from "@/lib/relatorios.functions";
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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard-stats", range.from, range.to, expertFilter, config.includeHighTicket],
    queryFn: () => fetchStats({ data: { from: range.from, to: range.to, expert: expertFilter, includeHighTicket: config.includeHighTicket } }),
    staleTime: 30_000,
    retry: 1,
  });

  const errMsg = isError
    ? String((error as any)?.message || (error as any)?.toString() || "Erro desconhecido ao carregar dados")
    : null;

  const hasNoData = !isLoading && !isError && data && data.totalLeads === 0 && data.totalFat === 0 && data.totalVendas === 0 && (data.ops?.length ?? 0) === 0;

  const ops = data?.ops ?? [];
  const visibleOps = workspace.id === "all"
    ? ops
    : ops.filter((o) => o.nome.toLowerCase().replace(/[\s-_]+/g, "").includes(workspace.id.toLowerCase().replace(/[\s-_]+/g, "")) || workspace.id.toLowerCase().includes(o.nome.toLowerCase()));
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

        {/* ── Error Banner ── */}
        {errMsg && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-red-400">❌ Erro ao carregar dados do servidor</p>
                <p className="mt-1 font-mono text-xs text-red-300/80 break-all">{errMsg}</p>
              </div>
              <button
                onClick={() => refetch()}
                className="shrink-0 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 transition-colors"
              >
                🔄 Tentar novamente
              </button>
            </div>
          </div>
        )}

        {/* ── Empty Data Warning ── */}
        {hasNoData && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-amber-400">⚠️ Dados carregados mas todos zerados</p>
                <p className="mt-1 text-xs text-amber-300/80">
                  O servidor respondeu mas não retornou nenhum dado para o período selecionado.
                  Isso pode indicar problema com a chave de acesso ao banco (SUPABASE_SERVICE_ROLE_KEY) ou ausência de dados no banco.
                </p>
                <p className="mt-1 font-mono text-[10px] text-amber-300/60">
                  Período: {range.from} → {range.to} | Workspace: {workspace.id}
                </p>
              </div>
              <button
                onClick={() => refetch()}
                className="shrink-0 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors"
              >
                🔄 Recarregar
              </button>
            </div>
          </div>
        )}

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

        <Tabs defaultValue="operacoes" className="mt-8">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="operacoes" className="gap-2">
              <BarChart3 className="h-3.5 w-3.5" />
              Operações
            </TabsTrigger>
            <TabsTrigger value="ranking" className="gap-2">
              <Trophy className="h-3.5 w-3.5" />
              Ranking
            </TabsTrigger>
            <TabsTrigger value="relatorios" className="gap-2">
              <LineChart className="h-3.5 w-3.5" />
              Relatórios
            </TabsTrigger>
            <TabsTrigger value="vendedores" className="gap-2">
              <Users className="h-3.5 w-3.5" />
              Vendedores
            </TabsTrigger>
          </TabsList>

          {/* ════════ ABA OPERAÇÕES ════════ */}
          <TabsContent value="operacoes" className="mt-6 space-y-6">

            {/* ── KPIs Globais ── */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} label="Faturamento" value={isLoading ? "—" : BRL(totalFat)} accent="text-emerald-400" bgGlow="bg-gradient-to-br from-emerald-500/5 to-transparent" />
              <Kpi icon={<ShoppingBag className="h-4 w-4 text-amber-400" />} label="Vendas" value={isLoading ? "—" : totalVendas.toLocaleString("pt-BR")} accent="text-amber-400" bgGlow="bg-gradient-to-br from-amber-500/5 to-transparent" />
              <Kpi icon={<UserCheck className="h-4 w-4 text-sky-400" />} label="Leads Únicos" value={isLoading ? "—" : totalLeads.toLocaleString("pt-BR")} accent="text-sky-400" bgGlow="bg-gradient-to-br from-sky-500/5 to-transparent" />
              <Kpi icon={<Percent className="h-4 w-4 text-violet-400" />} label="Conversão" value={isLoading ? "—" : `${conversaoGeral.toFixed(1)}%`} accent="text-violet-400" bgGlow="bg-gradient-to-br from-violet-500/5 to-transparent" />
              <Kpi icon={<Receipt className="h-4 w-4 text-indigo-400" />} label="Ticket Médio" value={isLoading ? "—" : BRL(tmGeral)} accent="text-indigo-400" bgGlow="bg-gradient-to-br from-indigo-500/5 to-transparent" />
              <Kpi icon={<AlertTriangle className="h-4 w-4 text-rose-400" />} label="Reembolsos" value={isLoading ? "—" : String(totalReemb)} accent={totalReemb > 0 ? "text-rose-400" : "text-foreground"} bgGlow={totalReemb > 0 ? "bg-gradient-to-br from-rose-500/5 to-transparent" : ""} />
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

                          {/* Lead Breakdown (Typebot Org/Pago, Orgânico Direto) */}
                          {(op.nome === "Caio" || isExpanded) && op.leadBreakdown.length > 0 && (
                            <div className="border-t border-border/50 bg-secondary/15 px-5 py-3.5 space-y-2">
                              <div className="flex items-center justify-between text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                                <span>📊 Detalhamento de Origem dos Leads — {op.nome}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {op.leadBreakdown.map((lb) => (
                                  <div key={lb.tipo} className="rounded-xl border border-border/60 bg-card/80 p-3.5 flex flex-col justify-between shadow-sm">
                                    <div className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">{lb.tipo}</div>
                                    <div className={`mt-2 font-mono text-2xl font-black tabular-nums ${ac.text}`}>{lb.leads.toLocaleString("pt-BR")}</div>
                                    <div className="mt-1 text-[0.65rem] text-muted-foreground font-medium">
                                      {lb.vendas} {lb.vendas === 1 ? "venda" : "vendas"} · {lb.conversao}% conversão
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

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

                          {isExpanded && op.fontes.length === 0 && op.leadBreakdown.length === 0 && (
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
            {/* ── KPIs resumo ── */}
            {!isLoading && (data?.vendedores ?? []).length > 0 && (
              <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
                <Kpi icon={<Users className="h-4 w-4" />} label="Vendedores Ativos" value={String((data?.vendedores ?? []).filter((v) => v.vendas > 0).length)} accent="text-sky-400" />
                <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Top Vendedor" value={data?.vendedores?.[0]?.nome ?? "—"} accent="text-amber-400" />
                <Kpi icon={<Receipt className="h-4 w-4" />} label="Ticket Médio Top" value={data?.vendedores?.[0] ? BRL(data.vendedores[0].faturamento / Math.max(1, data.vendedores[0].vendas)) : "—"} accent="text-emerald-400" />
                <Kpi icon={<Percent className="h-4 w-4" />} label="Concentração Top 3" value={(() => { const v = data?.vendedores ?? []; const top3Fat = v.slice(0, 3).reduce((a, x) => a + x.faturamento, 0); return totalFat > 0 ? `${((top3Fat / totalFat) * 100).toFixed(0)}%` : "—"; })()} accent="text-violet-400" />
              </section>
            )}

            {/* ── Grid de cards ── */}
            <section className="overflow-hidden rounded-2xl border border-border bg-card/40">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">Performance por Vendedor</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Faturamento, vendas, ticket médio e participação</p>
                </div>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </div>

              {isLoading ? (
                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-40 animate-pulse rounded-xl bg-secondary/20" />
                  ))}
                </div>
              ) : (data?.vendedores ?? []).length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">Sem dados no período selecionado.</div>
              ) : (
                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {(data?.vendedores ?? []).map((v, idx) => {
                    const pct = totalFat > 0 ? (v.faturamento / totalFat) * 100 : 0;
                    const tm = v.vendas > 0 ? v.faturamento / v.vendas : 0;
                    const isTop3 = idx < 3;
                    const medalCls = idx === 0 ? "bg-amber-300/15 text-amber-300 border-amber-300/30"
                      : idx === 1 ? "bg-slate-300/10 text-slate-200 border-slate-300/30"
                      : idx === 2 ? "bg-orange-400/10 text-orange-300 border-orange-400/30"
                      : "";
                    const barColor = idx === 0 ? "bg-amber-400" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-orange-400" : "bg-accent";
                    return (
                      <div key={v.utm} className={`group relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg hover:shadow-accent/5 ${
                        isTop3 ? `border-border/60 bg-gradient-to-br from-secondary/30 to-card/60 hover:border-border` : "border-border/40 bg-card/60 hover:border-border/80"
                      }`}>
                        {/* Rank badge */}
                        {isTop3 && (
                          <div className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border text-[0.6rem] font-bold ${medalCls}`}>
                            {idx + 1}
                          </div>
                        )}

                        <div className="p-4">
                          {/* Avatar + nome */}
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary/40 text-sm font-bold text-muted-foreground">
                                {v.fotoUrl ? (
                                  <img src={v.fotoUrl} alt={v.nome} className="h-full w-full object-cover" />
                                ) : (
                                  v.nome.split(/\s+/).slice(0, 2).map((s: string) => s[0]?.toUpperCase() ?? "").join("")
                                )}
                              </div>
                              {isTop3 && (
                                <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${barColor}`} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">{v.nome}</div>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span className="truncate text-[0.7rem] text-muted-foreground">{v.utm}</span>
                                {v.expert && (
                                  <>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="truncate text-[0.7rem] text-accent">{v.expert}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Métricas */}
                          <div className="mt-4 grid grid-cols-3 gap-3">
                            <div>
                              <div className="text-[0.55rem] uppercase tracking-[0.15em] text-muted-foreground">Faturamento</div>
                              <div className={`mt-0.5 text-base font-bold tabular-nums ${NUM} ${isTop3 ? "text-foreground" : "text-foreground/80"}`}>{BRL(v.faturamento)}</div>
                            </div>
                            <div>
                              <div className="text-[0.55rem] uppercase tracking-[0.15em] text-muted-foreground">Vendas</div>
                              <div className={`mt-0.5 text-base font-bold tabular-nums ${NUM}`}>{v.vendas}</div>
                            </div>
                            <div>
                              <div className="text-[0.55rem] uppercase tracking-[0.15em] text-muted-foreground">Ticket Médio</div>
                              <div className={`mt-0.5 text-base font-bold tabular-nums ${NUM} text-sky-400`}>{BRL(tm)}</div>
                            </div>
                          </div>

                          {/* Barra participação */}
                          <div className="mt-4">
                            <div className="flex items-center justify-between text-[0.6rem]">
                              <span className="text-muted-foreground">Participação</span>
                              <span className={`font-semibold tabular-nums ${isTop3 ? "text-foreground" : "text-muted-foreground"}`}>{pct.toFixed(1)}%</span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary/40">
                              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <ParticipacaoVendedores vendedores={data?.vendedores ?? []} loading={isLoading} />
          </TabsContent>

          {/* ════════ ABA RANKING ════════ */}
          <TabsContent value="ranking" className="mt-6">
            <RankingTab range={range} />
          </TabsContent>

          {/* ════════ ABA RELATÓRIOS ════════ */}
          <TabsContent value="relatorios" className="mt-6">
            <RelatoriosTab range={range} />
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

function Kpi({ icon, label, value, accent, bgGlow }: { icon: React.ReactNode; label: string; value: string; accent?: string; bgGlow?: string }) {
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-border/60 bg-card/60 p-4 transition-all duration-200 hover:border-border hover:bg-card/90 hover:shadow-lg hover:shadow-emerald-500/5 ${bgGlow ?? ""}`}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] opacity-80 group-hover:opacity-100 transition-opacity">{label}</span>
        <div className={`p-1.5 rounded-lg bg-secondary/50 text-foreground group-hover:scale-110 transition-transform ${accent ?? ""}`}>
          {icon}
        </div>
      </div>
      <div className={`mt-3 text-2xl md:text-3xl font-extrabold tracking-tight ${NUM} ${accent ?? "text-foreground"}`}>{value}</div>
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

/* ── ABA RANKING ── */
function RankingTab({ range }: { range: DateRangeValue }) {
  const { workspace, workspaces } = useWorkspace();
  const fetchRanking = useServerFn(getRankingStats);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-ranking", range.from, range.to, workspace.id],
    queryFn: () => fetchRanking({ data: { from: range.from, to: range.to, expert: workspace.id === "all" ? null : workspace.id } }),
  });

  const ranking = data?.ranking ?? [];
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);
  const maxFat = top3[0]?.faturamento ?? 1;

  const PLACE_META = [
    { icon: <Crown className="h-5 w-5" />, color: "text-amber-300", glow: "shadow-[0_0_60px_-10px_rgba(251,191,36,0.5)]", border: "border-amber-300/40", grad: "from-amber-300/20 via-card/60 to-card/40", label: "1º Lugar", bar: "from-amber-400 to-amber-200" },
    { icon: <Trophy className="h-5 w-5" />, color: "text-slate-300", glow: "", border: "border-slate-300/30", grad: "from-slate-300/10 via-card/60 to-card/40", label: "2º Lugar", bar: "from-slate-400 to-slate-200" },
    { icon: <Medal className="h-5 w-5" />, color: "text-orange-300", glow: "", border: "border-orange-300/30", grad: "from-orange-400/10 via-card/60 to-card/40", label: "3º Lugar", bar: "from-orange-500 to-orange-300" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">Ranking de Vendas</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Quem tá puxando o time no período selecionado</p>
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-60 animate-pulse rounded-2xl bg-card/40" />)}
        </div>
      )}

      {!isLoading && top3.length === 0 && (
        <div className="rounded-2xl border border-border bg-card/40 p-12 text-center">
          <div className="text-sm text-muted-foreground">Nenhuma venda no período.</div>
        </div>
      )}

      {top3.length > 0 && (
        <div className="grid items-end gap-4 md:grid-cols-3">
          {top3.map((item, idx) => {
            const place = (idx + 1) as 1 | 2 | 3;
            const meta = PLACE_META[idx];
            const fillPct = maxFat > 0 ? (item.faturamento / maxFat) * 100 : 0;
            const heightCls = place === 1 ? "md:-mt-2" : place === 2 ? "md:mt-10" : "md:mt-16";
            return (
              <div key={item.utm} className={heightCls}>
                <div className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 transition ${meta.border} ${meta.grad} ${place === 1 ? `${meta.glow} ring-1 ring-accent/20` : ""}`}>
                  <div className={`absolute right-4 top-4 ${meta.color}`}>{meta.icon}</div>
                  <div className={`text-[0.65rem] uppercase tracking-[0.22em] ${meta.color}`}>{meta.label}</div>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary/40 text-sm font-semibold text-muted-foreground">
                      {item.fotoUrl ? (
                        <img src={item.fotoUrl} alt={item.nome} className="h-full w-full object-cover" />
                      ) : (
                        item.nome.split(/\s+/).slice(0, 2).map((s: string) => s[0]?.toUpperCase() ?? "").join("")
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-display text-xl">{item.nome}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.expert ?? "—"} · {item.utm}</div>
                    </div>
                  </div>
                  <div className="mt-6">
                    <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Faturamento</div>
                    <div className={`mt-1 font-display ${place === 1 ? "text-4xl" : "text-3xl"} ${NUM}`}>{BRL(item.faturamento)}</div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-xs">
                    <div>
                      <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Vendas</div>
                      <div className={`${NUM} text-base`}>{item.vendas}</div>
                    </div>
                    <div>
                      <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Ticket médio</div>
                      <div className={`${NUM} text-base`}>{BRL(item.ticketMedio)}</div>
                    </div>
                  </div>
                  <div className="mt-5 h-1 overflow-hidden rounded-full bg-secondary/40">
                    <div className={`h-full rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${fillPct}%` }} />
                  </div>
                  <div className="mt-1 text-right text-[0.65rem] text-muted-foreground">{item.pctTotal.toFixed(1)}% do total</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ranking.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/20 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  <th className="w-14 px-5 py-3 text-center">Pos</th>
                  <th className="px-3 py-3">Vendedor</th>
                  <th className="px-3 py-3">Expert</th>
                  <th className="px-3 py-3 text-center">Vendas</th>
                  <th className="px-3 py-3 text-right">Faturamento</th>
                  <th className="px-5 py-3 text-right">% do total</th>
                </tr>
              </thead>
              <tbody>
                {[...top3, ...rest].map((item, i) => {
                  const pos = i + 1;
                  return (
                    <tr key={item.utm} className="border-b border-border/60 transition hover:bg-secondary/20">
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                          pos === 1 ? "bg-amber-300/15 text-amber-300 border-amber-300/30"
                          : pos === 2 ? "bg-slate-300/10 text-slate-200 border-slate-300/30"
                          : pos === 3 ? "bg-orange-400/10 text-orange-300 border-orange-400/30"
                          : "bg-secondary/40 text-muted-foreground border-border"
                        }`}>{pos}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary/40 text-xs font-semibold text-muted-foreground">
                            {item.fotoUrl ? (
                              <img src={item.fotoUrl} alt={item.nome} className="h-full w-full object-cover" />
                            ) : (
                              item.nome.split(/\s+/).slice(0, 2).map((s: string) => s[0]?.toUpperCase() ?? "").join("")
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-foreground">{item.nome}</div>
                            <div className="truncate text-[0.7rem] text-muted-foreground">{item.utm}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{item.expert ?? "—"}</td>
                      <td className={`px-3 py-3 text-center ${NUM}`}>{item.vendas}</td>
                      <td className={`px-3 py-3 text-right ${NUM}`}>{BRL(item.faturamento)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-secondary/40 md:block">
                            <div className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent" style={{ width: `${Math.min(100, item.pctTotal)}%` }} />
                          </div>
                          <span className={`${NUM} text-foreground`}>{item.pctTotal.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && data.semUtm.vendas > 0 && (
        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Sem vendedor</div>
              <h4 className="mt-1 font-display text-base">Vendas diretas / orgânicas</h4>
              <p className="text-xs text-muted-foreground">UTM não cadastrada ou vendedor inativo</p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Vendas</div>
                <div className={`${NUM} text-lg`}>{data.semUtm.vendas}</div>
              </div>
              <div>
                <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Faturamento</div>
                <div className={`${NUM} text-lg`}>{BRL(data.semUtm.faturamento)}</div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ── ABA RELATÓRIOS ── */
function RelatoriosTab({ range }: { range: DateRangeValue }) {
  const { workspace } = useWorkspace();
  const fetchRelatorios = useServerFn(getRelatoriosStats);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-relatorios", range.from, range.to, workspace.id],
    queryFn: () => fetchRelatorios({ data: { from: range.from, to: range.to, expert: workspace.id === "all" ? null : workspace.id } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">Relatórios</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Análise de performance e insights do período</p>
        </div>
      </div>

      {/* Insights */}
      {data && data.insights.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.insights.map((ins, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${
              ins.tone === "positivo" ? "border-emerald-500/30 bg-emerald-500/5"
              : ins.tone === "alerta" ? "border-rose-500/30 bg-rose-500/5"
              : ins.tone === "destaque" ? "border-amber-500/30 bg-amber-500/5"
              : "border-border bg-card/40"
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{ins.icon}</span>
                <span className="text-sm font-semibold">{ins.title}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{ins.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      {data && (
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Faturamento" value={BRL(data.sumPeriod)} accent="text-emerald-400" />
          <Kpi icon={<ShoppingBag className="h-4 w-4" />} label="Vendas" value={String(data.vendasPeriod)} />
          <Kpi icon={<Receipt className="h-4 w-4" />} label="Ticket Médio" value={BRL(data.ticketMedioPeriod)} accent="text-amber-400" />
          <Kpi icon={<Activity className="h-4 w-4" />} label="Variação" value={`${data.periodDiffPct >= 0 ? "+" : ""}${data.periodDiffPct.toFixed(1)}%`} accent={data.periodDiffPct >= 0 ? "text-emerald-400" : "text-rose-400"} />
        </section>
      )}

      {/* Série diária (área) */}
      {data && data.serieDaily.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card/40 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <LineChart className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em]">Faturamento — Últimos 30 dias</span>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.serieDaily}>
                <defs>
                  <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4a03a" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#d4a03a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="data" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => [BRL(v), "Faturamento"]}
                  labelFormatter={(l: string) => l}
                />
                <Area type="monotone" dataKey="total" stroke="#d4a03a" fill="url(#gradFat)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Top vendedores (pie) */}
      {data && data.topVendedores.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card/40 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em]">Top Vendedores</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-8">
            <div className="h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.topVendedores.slice(0, 6)} dataKey="total" nameKey="utm" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                    {data.topVendedores.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={["#d4a03a", "#8b5cf6", "#06b6d4", "#f43f5e", "#22c55e", "#f97316"][i % 6]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => BRL(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {data.topVendedores.slice(0, 6).map((v, i) => (
                <div key={v.utm} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ["#d4a03a", "#8b5cf6", "#06b6d4", "#f43f5e", "#22c55e", "#f97316"][i % 6] }} />
                  <span className="flex-1 text-sm">{v.utm}</span>
                  <span className={`${NUM} text-sm`}>{BRL(v.total)}</span>
                  <span className="text-xs text-muted-foreground">{v.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Expert breakdown (barras) */}
      {data && data.expertBreakdown.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card/40 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em]">Performance por Expert</span>
          </div>
          <div className="mt-4 space-y-3">
            {data.expertBreakdown.map((e) => (
              <div key={e.nome}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{e.nome}</span>
                  <div className="flex items-center gap-3">
                    <span className={`${NUM}`}>{BRL(e.total)}</span>
                    <span className="w-12 text-right text-xs text-muted-foreground">{e.pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary/40">
                  <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.min(100, e.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-card/40" />
          ))}
        </div>
      )}
    </div>
  );
}
