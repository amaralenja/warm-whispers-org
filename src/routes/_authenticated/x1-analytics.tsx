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
  Percent,
  ShoppingCart,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getX1Analytics, type X1AnalyticsPayload } from "@/lib/x1-analytics.functions";
import { generateX1AnalyticsPdf } from "@/lib/x1-analytics-pdf";
import { FileDown } from "lucide-react";
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
  const value = Number(n);
  return (Number.isFinite(value) ? value : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtPct(n: number) {
  const value = Number(n);
  return `${((Number.isFinite(value) ? value : 0) * 100).toFixed(1)}%`;
}
function fmtDur(seconds: number) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
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

function brDate(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function todayRange() {
  const now = new Date();
  return { from: brDate(now), to: brDate(now) };
}

type Preset = "hoje" | "7d" | "30d" | "mes";

function presetRange(p: Preset) {
  const to = new Date();
  const from = new Date();
  if (p === "hoje") return { from: brDate(to), to: brDate(to) };
  if (p === "7d") { from.setDate(from.getDate() - 6); return { from: brDate(from), to: brDate(to) }; }
  if (p === "30d") { from.setDate(from.getDate() - 29); return { from: brDate(from), to: brDate(to) }; }
  const first = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from: brDate(first), to: brDate(to) };
}


function X1AnalyticsPage() {
  const fetchFn = useServerFn(getX1Analytics);
  const [preset, setPreset] = useState<Preset>("hoje");
  const [range, setRange] = useState<{ from: string; to: string }>(() => todayRange());
  const [operacao, setOperacao] = useState<string>("all");

  const applyPreset = (p: Preset) => {
    setPreset(p);
    setRange(presetRange(p));
  };

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["x1-analytics", range.from, range.to, operacao],
    queryFn: () => fetchFn({ data: { from: range.from, to: range.to, operacao } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const payload = (data ?? null) as X1AnalyticsPayload | null;

  const isHoje = preset === "hoje" || range.from === range.to;
  const chartMsgs = useMemo(() => {
    if (!payload) return [];
    return isHoje
      ? (payload.serieHoraria ?? []).map((r) => ({
        data: safeText(r.hora, ""),
        msgsIn: safeNumber(r.msgsIn),
        msgsOut: safeNumber(r.msgsOut),
        vendas: safeNumber(r.vendas),
      }))
      : (payload.serieDiaria ?? []).map((r) => ({
        data: safeText(r.data, ""),
        msgsIn: safeNumber(r.msgsIn),
        msgsOut: safeNumber(r.msgsOut),
        vendas: safeNumber(r.vendas),
      }));
  }, [payload, isHoje]);

  const porOperacao = useMemo(() => (payload?.porOperacao ?? []).map((r) => ({
    operacao: safeText(r.operacao),
    leads: safeNumber(r.leads),
    conversas: safeNumber(r.conversas),
    msgsIn: safeNumber(r.msgsIn),
    msgsOut: safeNumber(r.msgsOut),
    vendas: safeNumber(r.vendas),
    faturamento: safeNumber(r.faturamento),
    ticketMedio: safeNumber(r.ticketMedio),
    conversao: safeNumber(r.conversao),
  })), [payload]);

  const porVendedor = useMemo(() => (payload?.porVendedor ?? []).map((r) => ({
    vendedorId: safeText(r.vendedorId, ""),
    nome: safeText(r.nome, safeText(r.utm, "Vendedor")),
    utm: safeText(r.utm),
    expert: safeText(r.expert),
    fotoUrl: safeText(r.fotoUrl, ""),
    leadsAtribuidos: safeNumber(r.leadsAtribuidos),
    msgsEnviadas: safeNumber(r.msgsEnviadas),
    vendas: safeNumber(r.vendas),
    faturamento: safeNumber(r.faturamento),
    ticketMedio: safeNumber(r.ticketMedio),
    conversao: safeNumber(r.conversao),
  })), [payload]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">
              Operação X1
            </p>
            <h1 className="mt-1 bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-4xl font-black tracking-tight text-transparent">
              Analytics X1
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Métricas completas de leads, mensagens, conversão e faturamento por operação e vendedor.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card p-1">
              {(["hoje", "7d", "30d", "mes"] as Preset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    preset === p
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Mês"}
                </button>
              ))}
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">De</Label>
              <Input
                type="date"
                value={range.from}
                onChange={(e) => { setPreset("hoje"); setRange((r) => ({ ...r, from: e.target.value })); }}
                className="h-9 w-40 bg-card"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Até</Label>
              <Input
                type="date"
                value={range.to}
                onChange={(e) => { setPreset("hoje"); setRange((r) => ({ ...r, to: e.target.value })); }}
                className="h-9 w-40 bg-card"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Operação</Label>
              <Select value={operacao} onValueChange={setOperacao}>
                <SelectTrigger className="h-9 w-44 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(payload?.operacoesDisponiveis ?? []).map((op, idx) => {
                    const opText = safeText(op, "");
                    if (!opText) return null;
                    return <SelectItem key={`${opText}-${idx}`} value={opText}>{opText}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => refetch()} disabled={isFetching} className="h-9">
              {isFetching ? "Atualizando…" : "Atualizar"}
            </Button>
            <Button
              onClick={() => {
                if (!payload) { toast.error("Aguarde os dados carregarem"); return; }
                try {
                  generateX1AnalyticsPdf({ payload, from: range.from, to: range.to, operacao });
                  toast.success("PDF gerado com sucesso");
                } catch (e: any) {
                  toast.error(`Erro ao gerar PDF: ${e?.message ?? "desconhecido"}`);
                }
              }}
              disabled={!payload || isLoading}
              variant="outline"
              className="h-9 gap-2"
            >
              <FileDown className="h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
        </div>


        {error ? (
          <Card><CardContent className="p-6 text-sm text-destructive">
            {(error as any)?.message ?? "Erro ao carregar métricas"}
          </CardContent></Card>
        ) : null}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          <KpiCard
            title="Novos Leads"
            value={String(safeNumber(payload?.kpis.novosLeads))}
            icon={<Users className="h-4 w-4" />}
            accent="from-blue-500/20 to-blue-500/5"
            loading={isLoading}
          />
          <KpiCard
            title="Contatos Únicos"
            value={String(safeNumber(payload?.kpis.contatosUnicos))}
            icon={<Users className="h-4 w-4" />}
            accent="from-cyan-500/20 to-cyan-500/5"
            loading={isLoading}
          />
          <KpiCard
            title="Mensagens Recebidas"
            value={String(safeNumber(payload?.kpis.msgsIn))}
            icon={<MessageSquare className="h-4 w-4" />}
            accent="from-emerald-500/20 to-emerald-500/5"
            loading={isLoading}
          />
          <KpiCard
            title="Mensagens Enviadas"
            value={String(safeNumber(payload?.kpis.msgsOut))}
            icon={<Send className="h-4 w-4" />}
            accent="from-violet-500/20 to-violet-500/5"
            loading={isLoading}
          />
          <KpiCard
            title="Vendas Fechadas"
            value={String(safeNumber(payload?.kpis.vendas))}
            icon={<ShoppingCart className="h-4 w-4" />}
            accent="from-amber-500/20 to-amber-500/5"
            loading={isLoading}
          />
          <KpiCard
            title="Faturamento"
            value={fmtBRL(safeNumber(payload?.kpis.faturamento))}
            icon={<DollarSign className="h-4 w-4" />}
            accent="from-green-500/20 to-green-500/5"
            loading={isLoading}
          />
          <KpiCard
            title="Ticket Médio"
            value={fmtBRL(safeNumber(payload?.kpis.ticketMedio))}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="from-teal-500/20 to-teal-500/5"
            loading={isLoading}
          />
          <KpiCard
            title="Conversão"
            value={fmtPct(safeNumber(payload?.kpis.conversao))}
            icon={<Percent className="h-4 w-4" />}
            accent="from-pink-500/20 to-pink-500/5"
            loading={isLoading}
          />
          <KpiCard
            title="Tempo Médio Resposta"
            value={fmtDur(safeNumber(payload?.kpis.tempoRespostaMedio))}
            icon={<Timer className="h-4 w-4" />}
            accent="from-orange-500/20 to-orange-500/5"
            loading={isLoading}
          />
          <KpiCard
            title="Conversas no Período"
            value={String(safeNumber(payload?.kpis.conversas))}
            icon={<MessageSquare className="h-4 w-4" />}
            accent="from-indigo-500/20 to-indigo-500/5"
            loading={isLoading}
          />
        </div>

        {/* Chart mensagens/vendas por dia */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">{isHoje ? "Mensagens e vendas por hora (hoje)" : "Mensagens e vendas por dia"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <LineChart data={chartMsgs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis dataKey="data" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                  <Line type="monotone" dataKey="msgsIn" name="Recebidas" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="msgsOut" name="Enviadas" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="vendas" name="Vendas" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Por Operação */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Desempenho por Operação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={porOperacao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis dataKey="operacao" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                  <Bar dataKey="leads" name="Leads" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="vendas" name="Vendas" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-4">Operação</th>
                    <th className="py-2 pr-4">Leads</th>
                    <th className="py-2 pr-4">Conversas</th>
                    <th className="py-2 pr-4">Msgs In</th>
                    <th className="py-2 pr-4">Msgs Out</th>
                    <th className="py-2 pr-4">Vendas</th>
                    <th className="py-2 pr-4">Faturamento</th>
                    <th className="py-2 pr-4">Ticket Médio</th>
                    <th className="py-2 pr-4">Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {porOperacao.map((r, idx) => (
                    <tr key={`${safeText(r.operacao, "op")}-${idx}`} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="py-2 pr-4 font-semibold">{safeText(r.operacao)}</td>
                      <td className="py-2 pr-4">{safeNumber(r.leads)}</td>
                      <td className="py-2 pr-4">{safeNumber(r.conversas)}</td>
                      <td className="py-2 pr-4">{safeNumber(r.msgsIn)}</td>
                      <td className="py-2 pr-4">{safeNumber(r.msgsOut)}</td>
                      <td className="py-2 pr-4">{safeNumber(r.vendas)}</td>
                      <td className="py-2 pr-4 font-medium">{fmtBRL(safeNumber(r.faturamento))}</td>
                      <td className="py-2 pr-4">{fmtBRL(safeNumber(r.ticketMedio))}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">{fmtPct(safeNumber(r.conversao))}</Badge>
                      </td>
                    </tr>
                  ))}
                  {porOperacao.length === 0 && !isLoading ? (
                    <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Sem dados no período</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Por Vendedor */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Desempenho por Vendedor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-4">Vendedor</th>
                    <th className="py-2 pr-4">UTM</th>
                    <th className="py-2 pr-4">Operação</th>
                    <th className="py-2 pr-4">Leads</th>
                    <th className="py-2 pr-4">Msgs Enviadas</th>
                    <th className="py-2 pr-4">Vendas</th>
                    <th className="py-2 pr-4">Faturamento</th>
                    <th className="py-2 pr-4">Ticket Médio</th>
                    <th className="py-2 pr-4">Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.map((r, idx) => {
                    const nome = safeText(r.nome, safeText(r.utm, "Vendedor"));
                    const fotoUrl = safeText(r.fotoUrl, "");
                    return (
                    <tr key={`${safeText(r.vendedorId, "v")}-${safeText(r.utm, "utm")}-${idx}`} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          {fotoUrl ? (
                            <img src={fotoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                          ) : (
                            <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                              {nome.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium">{nome}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{safeText(r.utm)}</td>
                      <td className="py-2 pr-4">{safeText(r.expert)}</td>
                      <td className="py-2 pr-4">{safeNumber(r.leadsAtribuidos)}</td>
                      <td className="py-2 pr-4">{safeNumber(r.msgsEnviadas)}</td>
                      <td className="py-2 pr-4">{safeNumber(r.vendas)}</td>
                      <td className="py-2 pr-4 font-medium">{fmtBRL(safeNumber(r.faturamento))}</td>
                      <td className="py-2 pr-4">{fmtBRL(safeNumber(r.ticketMedio))}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">{fmtPct(safeNumber(r.conversao))}</Badge>
                      </td>
                    </tr>
                    );
                  })}
                  {porVendedor.length === 0 && !isLoading ? (
                    <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Sem dados no período</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  accent,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  loading?: boolean;
}) {
  return (
    <Card className={`relative overflow-hidden border-border/60 bg-gradient-to-br ${accent}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="truncate">{title}</span>
          <span className="opacity-70">{icon}</span>
        </div>
        <div className="mt-2 text-2xl font-black tracking-tight">
          {loading ? <Skeleton className="h-7 w-20" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}
