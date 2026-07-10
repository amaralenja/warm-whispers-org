import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users,
  MessageSquare,
  Send,
  DollarSign,
  TrendingUp,
  Timer,
  Target,
  Trophy,
  Flame,
  ArrowRight,
  FileDown,
} from "lucide-react";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getX1Analytics, type X1AnalyticsPayload } from "@/lib/x1-analytics.functions";
import { generateX1AnalyticsPdf } from "@/lib/x1-analytics-pdf";
import { toast } from "sonner";
import { DateRangeFilter, computeRange, type DateRangeValue } from "@/components/date-range-filter";

export const Route = createFileRoute("/_authenticated/x1-analytics")({
  component: X1AnalyticsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">
      Erro ao carregar Analytics X1: {(error as any)?.message ?? "desconhecido"}
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">Página não encontrada</div>,
});

function fmtBRL(n: number) {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
function fmtPct(n: number) {
  const v = Number(n);
  return `${((Number.isFinite(v) ? v : 0) * 100).toFixed(1)}%`;
}
function fmtInt(n: number) {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR");
}
function fmtDur(seconds: number) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h${m ? ` ${m}m` : ""}`;
}
function safeText(value: unknown, fallback = "—") {
  if (value == null) return fallback;
  if (typeof value === "string") return value || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}
function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function X1AnalyticsPage() {
  const fetchFn = useServerFn(getX1Analytics);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => computeRange("hoje"));
  const [operacao, setOperacao] = useState<string>("all");
  const [channelId, setChannelId] = useState<string>("all");
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [showJanelaLeads, setShowJanelaLeads] = useState(false);

  const range = { from: dateRange.from ?? "", to: dateRange.to ?? dateRange.from ?? "" };

  const { data, isLoading, isFetching, refetch, error, dataUpdatedAt } = useQuery({
    queryKey: ["x1-analytics", range.from, range.to, operacao, channelId, vendedorId],
    queryFn: () => fetchFn({ data: { from: range.from, to: range.to, operacao, channelId, vendedorId } }),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    enabled: Boolean(range.from && range.to),
  });

  const payload = (data ?? null) as X1AnalyticsPayload | null;
  const isHoje = dateRange.preset === "hoje" || range.from === range.to;

  const chartData = useMemo(() => {
    if (!payload) return [];
    return isHoje
      ? (payload.serieHoraria ?? []).map((r) => ({
          label: safeText(r.hora, ""),
          msgsIn: safeNumber(r.msgsIn),
          msgsOut: safeNumber(r.msgsOut),
          vendas: safeNumber(r.vendas),
        }))
      : (payload.serieDiaria ?? []).map((r) => ({
          label: safeText(r.data, "").slice(5),
          msgsIn: safeNumber(r.msgsIn),
          msgsOut: safeNumber(r.msgsOut),
          vendas: safeNumber(r.vendas),
        }));
  }, [payload, isHoje]);

  const porVendedor = useMemo(() => {
    const list = (payload?.porVendedor ?? []).map((r) => ({
      vendedorId: safeText(r.vendedorId, ""),
      nome: safeText(r.nome, safeText(r.utm, "Vendedor")),
      utm: safeText(r.utm),
      fotoUrl: safeText(r.fotoUrl, ""),
      leads: safeNumber(r.leadsAtribuidos),
      msgs: safeNumber(r.msgsEnviadas),
      vendas: safeNumber(r.vendas),
      faturamento: safeNumber(r.faturamento),
      ticketMedio: safeNumber(r.ticketMedio),
      conversao: safeNumber(r.conversao),
    }));
    return list.sort((a, b) => b.faturamento - a.faturamento);
  }, [payload]);

  const maxFat = porVendedor[0]?.faturamento ?? 0;
  const totalFat = porVendedor.reduce((s, v) => s + v.faturamento, 0);

  const porOperacao = useMemo(
    () =>
      (payload?.porOperacao ?? [])
        .map((r) => ({
          operacao: safeText(r.operacao),
          leads: safeNumber(r.leads),
          conversas: safeNumber(r.conversas),
          vendas: safeNumber(r.vendas),
          faturamento: safeNumber(r.faturamento),
          ticketMedio: safeNumber(r.ticketMedio),
          conversao: safeNumber(r.conversao),
        }))
        .sort((a, b) => b.faturamento - a.faturamento),
    [payload],
  );

  const k = payload?.kpis;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        {/* Header enxuto */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
              Operação X1
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">
              Analytics X1
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Como a operação está performando agora.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <DateRangeFilter
              value={dateRange}
              onChange={setDateRange}
              presets={["hoje", "ontem", "7d", "15d", "30d", "mes"]}
            />
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Operação
              </Label>
              <Select value={operacao} onValueChange={(v) => { setOperacao(v); setChannelId("all"); }}>
                <SelectTrigger className="h-9 w-40 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(payload?.operacoesDisponiveis ?? []).map((op, idx) => {
                    const t = safeText(op, "");
                    if (!t) return null;
                    return <SelectItem key={`${t}-${idx}`} value={t}>{t}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Canal
              </Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger className="h-9 w-52 bg-card">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os canais</SelectItem>
                  {(payload?.canaisDisponiveis ?? [])
                    .filter((c) => operacao === "all" || c.operacao === operacao)
                    .map((c) => {
                      const phone = safeText(c.displayPhone, "");
                      const label = phone
                        ? `${safeText(c.name, "Canal")} · ${phone}`
                        : safeText(c.name, "Canal");
                      return <SelectItem key={c.id} value={c.id}>{label}</SelectItem>;
                    })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Vendedor
              </Label>
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger className="h-9 w-48 bg-card">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os vendedores</SelectItem>
                  {(payload?.vendedoresDisponiveis ?? []).map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {safeText(v.nome, "Vendedor")}
                      {v.utm ? ` · ${v.utm}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => refetch()} disabled={isFetching} className="h-9">
              {isFetching ? "…" : "Atualizar"}
            </Button>
            <Button
              variant="outline"
              className="h-9 gap-2"
              onClick={() => {
                if (!payload) { toast.error("Aguarde os dados"); return; }
                try {
                  generateX1AnalyticsPdf({ payload, from: range.from, to: range.to, operacao });
                  toast.success("PDF gerado");
                } catch (e: any) {
                  toast.error(`Erro: ${e?.message ?? "desconhecido"}`);
                }
              }}
              disabled={!payload || isLoading}
            >
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        {dataUpdatedAt ? (
          <p className="text-[10px] text-muted-foreground">
            Atualizado às {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR")} · atualiza sozinho a cada 30s
          </p>
        ) : null}

        {error ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              {(error as any)?.message ?? "Erro ao carregar métricas"}
            </CardContent>
          </Card>
        ) : null}

        {/* HERO — 4 métricas que respondem "como estamos indo?" */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroMetric
            title="Faturamento"
            value={fmtBRL(safeNumber(k?.faturamento))}
            subtitle={`${fmtInt(safeNumber(k?.vendas))} vendas`}
            icon={<DollarSign className="h-5 w-5" />}
            tone="emerald"
            loading={isLoading}
          />
          <HeroMetric
            title="Conversão"
            value={fmtPct(safeNumber(k?.conversao))}
            subtitle="Leads → vendas"
            icon={<Target className="h-5 w-5" />}
            tone="amber"
            loading={isLoading}
          />
          <HeroMetric
            title="Ticket Médio"
            value={fmtBRL(safeNumber(k?.ticketMedio))}
            subtitle="Por venda fechada"
            icon={<TrendingUp className="h-5 w-5" />}
            tone="violet"
            loading={isLoading}
          />
          <HeroMetric
            title="Janela fechada s/ atendimento"
            value={fmtInt(safeNumber(k?.janelasFechadasSemAtendimento))}
            subtitle="Leads sem NENHUMA resposta do vendedor"
            icon={<Flame className="h-5 w-5" />}
            tone="rose"
            loading={isLoading}
            action={
              (payload?.janelasFechadasSemAtendimentoLeads?.length ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowJanelaLeads(true)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-300 hover:bg-rose-500/20"
                >
                  Ver leads →
                </button>
              ) : null
            }
          />
        </div>


        {/* FUNIL — leads → conversas → vendas */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Funil da operação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <FunnelStep
                label={isHoje ? "Leads que chamaram hoje" : "Novos leads no período"}
                value={fmtInt(safeNumber(k?.novosLeads))}
                sub={`${fmtInt(safeNumber(k?.contatosUnicos))} contatos únicos`}
                tone="blue"
              />
              <FunnelStep
                label={isHoje ? "Leads de outros dias" : "Leads antigos ativos"}
                value={fmtInt(safeNumber(k?.leadsAntigosAtivos))}
                sub="Conversas que já existiam"
                tone="indigo"
              />
              <FunnelStep
                label="Conversas ativas"
                value={fmtInt(safeNumber(k?.conversas))}
                sub={`${fmtInt(safeNumber(k?.msgsOut))} msgs enviadas`}
                tone="violet"
              />
              <FunnelStep
                label="Vendas fechadas"
                value={fmtInt(safeNumber(k?.vendas))}
                sub={fmtBRL(safeNumber(k?.faturamento))}
                tone="emerald"
                highlight
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                Total de leads no funil:{" "}
                <span className="font-semibold text-foreground">
                  {fmtInt(safeNumber(k?.novosLeads) + safeNumber(k?.leadsAntigosAtivos))}
                </span>
              </span>
              <span>
                Taxa novos → venda:{" "}
                <span className="font-semibold text-foreground">
                  {fmtPct(safeNumber(k?.conversao))}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Grid: gráfico + atividade */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border-border/60 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {isHoje ? "Movimento de hoje (por hora)" : "Movimento do período"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="grOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.25} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--muted-foreground)" width={40} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="msgsIn" name="Recebidas" stroke="#10b981" fill="url(#grIn)" strokeWidth={2} />
                    <Area type="monotone" dataKey="msgsOut" name="Enviadas" stroke="#8b5cf6" fill="url(#grOut)" strokeWidth={2} />
                    <Line type="monotone" dataKey="vendas" name="Vendas" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: "#f59e0b" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex justify-center gap-4 text-[11px] text-muted-foreground">
                <LegendDot color="#10b981" label="Msgs recebidas" />
                <LegendDot color="#8b5cf6" label="Msgs enviadas" />
                <LegendDot color="#f59e0b" label="Vendas" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Atividade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MiniStat
                icon={<MessageSquare className="h-4 w-4" />}
                label="Mensagens recebidas"
                value={fmtInt(safeNumber(k?.msgsIn))}
                tone="emerald"
              />
              <MiniStat
                icon={<Send className="h-4 w-4" />}
                label="Mensagens enviadas"
                value={fmtInt(safeNumber(k?.msgsOut))}
                tone="violet"
              />
              <MiniStat
                icon={<Users className="h-4 w-4" />}
                label="Contatos únicos"
                value={fmtInt(safeNumber(k?.contatosUnicos))}
                tone="sky"
              />
              <MiniStat
                icon={<MessageSquare className="h-4 w-4" />}
                label="Conversas"
                value={fmtInt(safeNumber(k?.conversas))}
                tone="indigo"
              />
              <MiniStat
                icon={<Timer className="h-4 w-4" />}
                label="Tempo de resposta médio"
                value={fmtDur(safeNumber(k?.tempoRespostaMedio))}
                tone="sky"
              />
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Ratio resposta
                </p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {safeNumber(k?.msgsIn) > 0
                    ? `${(safeNumber(k?.msgsOut) / safeNumber(k?.msgsIn)).toFixed(2)}x`
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Msgs enviadas por msg recebida
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ranking Vendedores */}
        <Card className="border-border/60">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Ranking de Vendedores
            </CardTitle>
            <span className="text-[10px] text-muted-foreground">
              {porVendedor.length} ativos · Total {fmtBRL(totalFat)}
            </span>
          </CardHeader>
          <CardContent>
            {porVendedor.length === 0 && !isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Sem vendas no período.
              </div>
            ) : (
              <div className="space-y-2">
                {porVendedor.map((v, idx) => {
                  const pct = maxFat > 0 ? (v.faturamento / maxFat) * 100 : 0;
                  const share = totalFat > 0 ? (v.faturamento / totalFat) * 100 : 0;
                  const isTop = idx === 0 && v.faturamento > 0;
                  return (
                    <div
                      key={`${v.vendedorId}-${v.utm}-${idx}`}
                      className={`group grid grid-cols-[2rem_2.5rem_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
                        isTop
                          ? "border-amber-500/40 bg-amber-500/5"
                          : "border-transparent hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center justify-center">
                        {isTop ? (
                          <Trophy className="h-4 w-4 text-amber-400" />
                        ) : (
                          <span className="text-xs font-bold text-muted-foreground">
                            #{idx + 1}
                          </span>
                        )}
                      </div>
                      {v.fotoUrl ? (
                        <img
                          src={v.fotoUrl}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover ring-2 ring-border"
                        />
                      ) : (
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-2 ring-border">
                          {v.nome.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{v.nome}</p>
                            <p className="truncate text-[10px] font-mono uppercase text-muted-foreground">
                              {v.utm || "sem UTM"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-baseline gap-3 text-xs text-muted-foreground">
                            <span>
                              <span className="font-semibold text-foreground">{fmtInt(v.vendas)}</span> vendas
                            </span>
                            <span>
                              <span className="font-semibold text-foreground">{fmtPct(v.conversao)}</span> conv.
                            </span>
                            <span>
                              TM <span className="font-semibold text-foreground">{fmtBRL(v.ticketMedio)}</span>
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold tabular-nums">
                          {fmtBRL(v.faturamento)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {share.toFixed(1)}% do total
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comparativo por Operação */}
        {porOperacao.length > 1 ? (
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Comparativo por Operação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {porOperacao.map((op, idx) => (
                  <div
                    key={`${op.operacao}-${idx}`}
                    className="rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">{op.operacao}</p>
                      <Flame className="h-4 w-4 text-orange-400 opacity-70" />
                    </div>
                    <p className="mt-2 font-mono text-2xl font-black">
                      {fmtBRL(op.faturamento)}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <MiniPill label="Leads" value={fmtInt(op.leads)} />
                      <MiniPill label="Vendas" value={fmtInt(op.vendas)} />
                      <MiniPill label="Conv." value={fmtPct(op.conversao)} />
                    </div>
                    <p className="mt-3 text-[10px] text-muted-foreground">
                      TM {fmtBRL(op.ticketMedio)} · {fmtInt(op.conversas)} conversas
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={showJanelaLeads} onOpenChange={setShowJanelaLeads}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Leads com janela fechada sem atendimento</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {(payload?.janelasFechadasSemAtendimentoLeads?.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum lead nesse período.</p>
            ) : (
              <div className="divide-y divide-border/50">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Vendedor</span>
                  <span>Telefone</span>
                  <span>Fechou em</span>
                </div>
                {(payload?.janelasFechadasSemAtendimentoLeads ?? []).map((lead) => {
                  const vendor = (payload?.vendedoresDisponiveis ?? []).find(
                    (v) => Number(v.id) === Number(lead.vendorId),
                  );
                  const vendorNome = vendor?.nome ?? (lead.vendorId ? `#${lead.vendorId}` : "— sem vendedor");
                  const closedAt = new Date(lead.closedAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={lead.conversationId}
                      className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 py-2 text-sm"
                    >
                      <span className="truncate">{vendorNome}</span>
                      <span className="font-mono">{lead.telefone || "—"}</span>
                      <span className="text-xs text-muted-foreground">{closedAt}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- helpers ---------------- */

const TONES: Record<string, { bg: string; text: string; ring: string }> = {
  emerald: { bg: "from-emerald-500/15 to-emerald-500/0", text: "text-emerald-400", ring: "ring-emerald-500/20" },
  amber: { bg: "from-amber-500/15 to-amber-500/0", text: "text-amber-400", ring: "ring-amber-500/20" },
  violet: { bg: "from-violet-500/15 to-violet-500/0", text: "text-violet-400", ring: "ring-violet-500/20" },
  sky: { bg: "from-sky-500/15 to-sky-500/0", text: "text-sky-400", ring: "ring-sky-500/20" },
  blue: { bg: "from-blue-500/15 to-blue-500/0", text: "text-blue-400", ring: "ring-blue-500/20" },
  indigo: { bg: "from-indigo-500/15 to-indigo-500/0", text: "text-indigo-400", ring: "ring-indigo-500/20" },
  rose: { bg: "from-rose-500/15 to-rose-500/0", text: "text-rose-400", ring: "ring-rose-500/20" },
};

function HeroMetric({
  title,
  value,
  subtitle,
  icon,
  tone,
  loading,
  action,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  loading?: boolean;
  action?: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${t.bg} p-5`}>
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </p>
        <div className={`grid h-8 w-8 place-items-center rounded-lg bg-background/60 ring-1 ${t.ring} ${t.text}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <p className="font-mono text-3xl font-black tracking-tight tabular-nums">{value}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        {action}
      </div>
    </div>
  );
}


function FunnelStep({
  label,
  value,
  sub,
  tone,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  tone: keyof typeof TONES;
  highlight?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div
      className={`rounded-xl border p-4 text-center ${
        highlight
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border/60 bg-muted/20"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-mono text-3xl font-black tabular-nums ${t.text}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function FunnelArrow({ pct }: { pct: number }) {
  const safe = Number.isFinite(pct) ? Math.max(0, pct) : 0;
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-2 md:py-0">
      <ArrowRight className="h-5 w-5 text-muted-foreground/60" />
      <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
        {safe.toFixed(1)}%
      </span>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={t.text}>{icon}</span>
        {label}
      </div>
      <span className="font-mono text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

function MiniPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/60 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-xs font-bold tabular-nums">{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
