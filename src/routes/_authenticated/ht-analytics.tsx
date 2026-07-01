import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, DollarSign, TrendingUp, Target, ShoppingBag,
  Users, CheckCircle2, XCircle, Flame, Activity,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/ht-analytics")({
  component: HTAnalytics,
});

const QUIZ_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";
const quizSb = createClient(QUIZ_URL, QUIZ_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Period = "today" | "yesterday" | "7d" | "15d" | "30d" | "90d" | "mtd" | "all";

function periodRange(p: Period): { start: Date | null; end: Date | null } {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const tomorrow = new Date(t); tomorrow.setDate(tomorrow.getDate() + 1);
  if (p === "all") return { start: null, end: null };
  if (p === "today") return { start: t, end: tomorrow };
  if (p === "yesterday") {
    const y = new Date(t); y.setDate(y.getDate() - 1);
    return { start: y, end: t };
  }
  if (p === "mtd") return { start: new Date(t.getFullYear(), t.getMonth(), 1), end: tomorrow };
  const days = p === "7d" ? 7 : p === "15d" ? 15 : p === "30d" ? 30 : 90;
  const s = new Date(t); s.setDate(s.getDate() - days);
  return { start: s, end: tomorrow };
}

const fmtBRL = (n: number) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtInt = (n: number) => Math.round(n || 0).toLocaleString("pt-BR");
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

type QLead = {
  id: string; data_criacao: string; nome: string | null; email: string | null; whatsapp: string | null;
  caixa_letra: string | null; caixa_label: string | null;
  faturamento: string | null; momento: string | null; objetivo: string | null;
  investir: string | null; minicurso: string | null; socio: string | null;
  comprometimento: string | null; last_step: string | null; funil: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
};
const isFinalizado = (l: QLead) => !!(l.whatsapp && l.caixa_letra && (l.comprometimento || l.momento));
const isQuente = (l: QLead) => {
  const c = (l.caixa_letra ?? "").toUpperCase();
  return "DEFG".includes(c) && /(sim|compromet)/i.test(l.comprometimento ?? "");
};

const CAIXA_LETRAS: { letra: string; label: string }[] = [
  { letra: "A", label: "Menos de R$ 1.000" },
  { letra: "B", label: "R$ 1.000 – 5.000" },
  { letra: "C", label: "R$ 5.000 – 10.000" },
  { letra: "D", label: "R$ 10.000 – 25.000" },
  { letra: "E", label: "R$ 25.000 – 50.000" },
  { letra: "F", label: "R$ 50.000 – 100.000" },
  { letra: "G", label: "Caixa Ilimitado" },
];
const SCORE_GROUPS: { id: string; label: string; letras: string[] }[] = [
  { id: "call", label: "Call agendada (D+)", letras: ["D", "E", "F", "G"] },
  { id: "equipe", label: "Análise de equipe (B, C)", letras: ["B", "C"] },
  { id: "minicurso", label: "Minicurso (A)", letras: ["A"] },
];

function HTAnalytics() {
  const [period, setPeriod] = useState<Period>("30d");
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<QLead[]>([]);
  const [vendas, setVendas] = useState<any[]>([]);
  const [htLeads, setHtLeads] = useState<any[]>([]);
  const [reunioes, setReunioes] = useState<any[]>([]);

  // Filtros da lista de leads
  const [flStatus, setFlStatus] = useState<Set<"finalizado" | "abandono">>(new Set());
  const [flScore, setFlScore] = useState<Set<string>>(new Set());
  const [flCaixa, setFlCaixa] = useState<Set<string>>(new Set());
  const [flUtm, setFlUtm] = useState<Set<string>>(new Set());
  const [flSearch, setFlSearch] = useState("");
  const [listLimit, setListLimit] = useState(50);


  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { start, end } = periodRange(period);
      const startIso = start?.toISOString() ?? null;
      const endIso = end?.toISOString() ?? null;

      // Quiz leads (chunked)
      const all: QLead[] = [];
      const pageSize = 1000;
      for (let i = 0; i < 20; i++) {
        let q = quizSb.from("leads").select("*")
          .order("data_criacao", { ascending: false })
          .range(i * pageSize, i * pageSize + pageSize - 1);
        if (startIso) q = q.gte("data_criacao", startIso);
        if (endIso) q = q.lt("data_criacao", endIso);
        const { data, error } = await q;
        if (error || !data) break;
        all.push(...(data as QLead[]));
        if (data.length < pageSize) break;
      }

      // HT tables in parallel
      const [v, hl, r] = await Promise.all([
        (() => {
          let q = supabase.from("ht_vendas").select("*").limit(5000);
          if (startIso) q = q.gte("data", startIso);
          if (endIso) q = q.lt("data", endIso);
          return q;
        })(),
        (() => {
          let q = supabase.from("ht_leads").select("*").limit(5000);
          if (startIso) q = q.gte("created_at", startIso);
          if (endIso) q = q.lt("created_at", endIso);
          return q;
        })(),
        (() => {
          let q = supabase.from("ht_reunioes").select("*").limit(5000);
          if (startIso) q = q.gte("data", startIso);
          if (endIso) q = q.lt("data", endIso);
          return q;
        })(),
      ]);

      if (cancel) return;
      setLeads(all);
      setVendas(v.data ?? []);
      setHtLeads(hl.data ?? []);
      setReunioes(r.data ?? []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [period, nonce]);

  const kpis = useMemo(() => {
    const receita = vendas.reduce((s, x) => s + Number(x.valor_total || 0), 0);
    const liquido = vendas.reduce((s, x) => s + Number(x.valor_liquido || 0), 0);
    const ticket = vendas.length ? receita / vendas.length : 0;
    const iniciados = leads.length;
    const finalizados = leads.filter(isFinalizado).length;
    const abandonos = iniciados - finalizados;
    const quentes = leads.filter(isQuente).length;
    const conv = iniciados > 0 ? (finalizados / iniciados) * 100 : 0;
    return {
      receita, liquido, ticket, qtdVendas: vendas.length,
      iniciados, finalizados, abandonos, quentes, conv,
      qtdHtLeads: htLeads.length, qtdReunioes: reunioes.length,
    };
  }, [leads, vendas, htLeads, reunioes]);

  const fluxoDiario = useMemo(() => {
    const map = new Map<string, { date: string; acessos: number; finalizados: number }>();
    for (const l of leads) {
      const d = new Date(l.data_criacao);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const cur = map.get(key) ?? { date: key, acessos: 0, finalizados: 0 };
      cur.acessos += 1;
      if (isFinalizado(l)) cur.finalizados += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30).map((x) => ({ ...x, label: fmtDate(x.date) }));
  }, [leads]);

  const porHorario = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ h: `${String(h).padStart(2, "0")}h`, val: 0 }));
    for (const l of leads) if (isFinalizado(l)) arr[new Date(l.data_criacao).getHours()].val += 1;
    return arr;
  }, [leads]);

  const divisaoCaixa = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const k = (l.caixa_label ?? "").trim();
      if (k) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  const porCloser = useMemo(() => {
    const map = new Map<string, { closer: string; vendas: number; receita: number }>();
    for (const v of vendas) {
      const k = v.closer || "—";
      const cur = map.get(k) ?? { closer: k, vendas: 0, receita: 0 };
      cur.vendas += 1;
      cur.receita += Number(v.valor_total || 0);
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.receita - a.receita).slice(0, 8);
  }, [vendas]);

  const funilAbandono = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      if (isFinalizado(l)) continue;
      const k = (l.last_step ?? l.funil ?? "").trim() || "início";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value).slice(0, 12);
  }, [leads]);
  const maxFunil = Math.max(1, ...funilAbandono.map((x) => x.value));

  const perguntas: { key: keyof QLead; label: string }[] = [
    { key: "momento", label: "Momento Atual" },
    { key: "faturamento", label: "Lucro Mensal" },
    { key: "objetivo", label: "Meta de Ganho" },
    { key: "caixa_label", label: "Caixa Disponível" },
    { key: "investir", label: "Já tentou SaaS?" },
    { key: "minicurso", label: "Tem ideia de SaaS?" },
    { key: "socio", label: "Tem Sócio/Cônjuge?" },
    { key: "comprometimento", label: "Comprometimento" },
  ];
  const analiseRespostas = useMemo(() => perguntas.map(({ key, label }) => {
    const map = new Map<string, number>();
    let total = 0;
    for (const l of leads) {
      const v = l[key];
      const s = typeof v === "string" ? v.trim() : "";
      if (!s) continue;
      map.set(s, (map.get(s) ?? 0) + 1);
      total++;
    }
    return {
      key, label, total,
      items: Array.from(map.entries()).map(([k, v]) => ({ label: k, value: v }))
        .sort((a, b) => b.value - a.value),
    };
  }), [leads]);

  const ACCENT = "oklch(0.78 0.13 75)";
  const ACCENT_SOFT = "oklch(0.78 0.13 75 / 0.35)";
  const FG = "oklch(0.96 0.005 90)";
  const MUTED = "oklch(0.55 0.01 270)";
  const BORDER = "oklch(0.24 0.006 270)";
  const CAIXA_COLORS = [
    "oklch(0.78 0.13 75)", "oklch(0.72 0.14 55)", "oklch(0.68 0.14 35)",
    "oklch(0.62 0.13 15)", "oklch(0.55 0.12 355)", "oklch(0.48 0.11 335)",
    "oklch(0.42 0.09 315)",
  ];
  const tooltipStyle = {
    background: "oklch(0.14 0.005 270)",
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    color: FG,
    fontSize: 12,
  };

  return (
    <div className="min-h-full bg-background">
      {/* Header Editorial */}
      <div className="relative border-b border-border/50 overflow-hidden">
        <div className="absolute inset-0 opacity-40 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top right, oklch(0.78 0.13 75 / 0.15), transparent 60%)" }} />
        <div className="relative px-6 md:px-10 pt-8 pb-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">
                <span className="h-px w-8 bg-accent/60" />
                High Ticket · Analytics
              </div>
              <h1 className="font-black text-3xl md:text-5xl tracking-tight leading-none">
                Inteligência de <span className="text-accent italic font-serif">Receita</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-3 max-w-xl">
                {loading
                  ? "Sincronizando base…"
                  : `${fmtInt(kpis.iniciados)} leads · ${fmtInt(kpis.qtdVendas)} vendas · ${fmtBRL(kpis.receita)} de receita no período.`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="w-44 h-10 bg-card/60 backdrop-blur border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="yesterday">Ontem</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="15d">Últimos 15 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  <SelectItem value="mtd">Mês atual</SelectItem>
                  <SelectItem value="all">Todo período</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-10 w-10 border-border/60"
                onClick={() => setNonce((n) => n + 1)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 md:px-10 py-8 space-y-10">
        {/* KPIs — Receita */}
        <section>
          <SectionTitle overline="Bloco 01" title="Receita & Vendas" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi accent icon={<DollarSign className="h-4 w-4" />} label="Receita Bruta"
              value={fmtBRL(kpis.receita)} sub={`${fmtInt(kpis.qtdVendas)} vendas fechadas`} />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Receita Líquida"
              value={fmtBRL(kpis.liquido)} sub="Após taxas e impostos" />
            <Kpi icon={<Target className="h-4 w-4" />} label="Ticket Médio"
              value={fmtBRL(kpis.ticket)} sub={`Conversão ${fmtPct(kpis.conv)}`} />
            <Kpi icon={<ShoppingBag className="h-4 w-4" />} label="Reuniões"
              value={fmtInt(kpis.qtdReunioes)} sub={`${fmtInt(kpis.qtdHtLeads)} leads HT`} />
          </div>
        </section>

        {/* KPIs — Funil */}
        <section>
          <SectionTitle overline="Bloco 02" title="Funil do Quiz" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={<Users className="h-4 w-4" />} label="Iniciados"
              value={fmtInt(kpis.iniciados)} sub="Abriram o formulário" />
            <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Finalizados"
              value={fmtInt(kpis.finalizados)} sub={`Taxa ${fmtPct(kpis.conv)}`} />
            <Kpi icon={<XCircle className="h-4 w-4" />} label="Abandonos"
              value={fmtInt(kpis.abandonos)} sub="Não completaram" />
            <Kpi accent icon={<Flame className="h-4 w-4" />} label="Leads Quentes"
              value={fmtInt(kpis.quentes)} sub="Caixa D+ comprometidos" />
          </div>
        </section>

        {/* Fluxo Diário — hero chart */}
        <section>
          <SectionTitle overline="Bloco 03" title="Fluxo diário de leads" />
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardContent className="p-6 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fluxoDiario} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAcessos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gFinal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={FG} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={FG} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis dataKey="label" fontSize={11} stroke={MUTED} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} stroke={MUTED} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: ACCENT_SOFT, strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="acessos" stroke={ACCENT} strokeWidth={2} fill="url(#gAcessos)" name="Acessos" />
                  <Area type="monotone" dataKey="finalizados" stroke={FG} strokeWidth={2} fill="url(#gFinal)" name="Finalizados" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>

        {/* Distribuição row */}
        <section className="grid gap-6 lg:grid-cols-3">
          <ChartCard title="Formulários por horário" full>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={porHorario} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis dataKey="h" fontSize={10} stroke={MUTED} tickLine={false} axisLine={false} interval={2} />
                <YAxis fontSize={11} stroke={MUTED} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="val" stroke={ACCENT} strokeWidth={2}
                  dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }} name="Finalizados" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Divisão por caixa (bolso)" full>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={divisaoCaixa} dataKey="value" nameKey="name"
                  innerRadius={55} outerRadius={95} paddingAngle={2} stroke="none">
                  {divisaoCaixa.map((_, i) => <Cell key={i} fill={CAIXA_COLORS[i % CAIXA_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1 max-h-32 overflow-auto pr-2">
              {divisaoCaixa.slice(0, 7).map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CAIXA_COLORS[i % CAIXA_COLORS.length] }} />
                    <span className="truncate text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-mono tabular-nums">{fmtInt(d.value)}</span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Status geral" full>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[
                  { name: "Finalizados", value: kpis.finalizados },
                  { name: "Abandonos", value: kpis.abandonos },
                ]} dataKey="value" nameKey="name"
                  innerRadius={55} outerRadius={95} paddingAngle={2} stroke="none">
                  <Cell fill={ACCENT} />
                  <Cell fill="oklch(0.30 0.02 270)" />
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex items-center justify-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
                <span className="text-muted-foreground">Finalizados</span>
                <span className="font-mono">{fmtInt(kpis.finalizados)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground">Abandonos</span>
                <span className="font-mono">{fmtInt(kpis.abandonos)}</span>
              </div>
            </div>
          </ChartCard>
        </section>

        {/* Closers + Funil */}
        <section className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Ranking de Closers" subtitle="Por receita no período">
            {porCloser.length === 0 ? (
              <EmptyState label="Sem vendas registradas." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porCloser} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
                  <XAxis type="number" fontSize={10} stroke={MUTED} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="closer" fontSize={11} stroke={MUTED} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtBRL(v)} />
                  <Bar dataKey="receita" fill={ACCENT} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Onde os leads abandonam" subtitle="Últimos passos antes de sair">
            {funilAbandono.length === 0 ? (
              <EmptyState label="Sem abandonos no período." />
            ) : (
              <div className="space-y-2 overflow-auto h-full pr-1">
                {funilAbandono.map((f) => (
                  <div key={f.label} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 text-[11px] truncate text-muted-foreground" title={f.label}>{f.label}</div>
                    <div className="flex-1 h-6 rounded bg-muted/30 overflow-hidden relative">
                      <div className="h-full rounded"
                        style={{ width: `${(f.value / maxFunil) * 100}%`, background: `linear-gradient(90deg, ${ACCENT_SOFT}, ${ACCENT})` }} />
                    </div>
                    <div className="w-14 text-right text-xs font-mono tabular-nums">{fmtInt(f.value)}</div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </section>

        {/* Análise de respostas */}
        <section>
          <SectionTitle overline="Bloco 04" title="Análise de respostas do quiz" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {analiseRespostas.map((p) => {
              const max = Math.max(1, ...p.items.map((i) => i.value));
              return (
                <Card key={String(p.key)} className="border-border/50 bg-card/50 backdrop-blur">
                  <CardContent className="p-4">
                    <div className="flex items-baseline justify-between mb-3">
                      <div className="text-sm font-semibold truncate">{p.label}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 ml-2">
                        {fmtInt(p.total)}
                      </div>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-auto pr-1">
                      {p.items.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Sem respostas.</div>
                      ) : p.items.slice(0, 12).map((it) => (
                        <div key={it.label} className="space-y-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="text-[11px] truncate" title={it.label}>{it.label}</div>
                            <div className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
                              {fmtInt(it.value)} · {fmtPct((it.value / p.total) * 100)}
                            </div>
                          </div>
                          <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full rounded-full"
                              style={{ width: `${(it.value / max) * 100}%`, background: ACCENT }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Lista de Leads */}
        <LeadsListSection
          leads={leads}
          flStatus={flStatus} setFlStatus={setFlStatus}
          flScore={flScore} setFlScore={setFlScore}
          flCaixa={flCaixa} setFlCaixa={setFlCaixa}
          flUtm={flUtm} setFlUtm={setFlUtm}
          flSearch={flSearch} setFlSearch={setFlSearch}
          listLimit={listLimit} setListLimit={setListLimit}
        />

        {/* Últimas vendas */}
        <section>
          <SectionTitle overline="Bloco 06" title="Últimas vendas" />
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                      <th className="px-6 py-3">Data</th>
                      <th className="py-3">Cliente</th>
                      <th className="py-3">Produto</th>
                      <th className="py-3">Closer</th>
                      <th className="px-6 py-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendas.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-xs">
                        Nenhuma venda no período.
                      </td></tr>
                    )}
                    {vendas
                      .slice()
                      .sort((a, b) => String(b.data ?? b.created_at).localeCompare(String(a.data ?? a.created_at)))
                      .slice(0, 20)
                      .map((v) => (
                        <tr key={v.id} className="border-b border-border/30 last:border-0 hover:bg-accent/5 transition-colors">
                          <td className="px-6 py-3 text-muted-foreground tabular-nums">
                            {v.data ? new Date(v.data).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="py-3">{v.cliente || "—"}</td>
                          <td className="py-3 text-muted-foreground">{v.produto || "—"}</td>
                          <td className="py-3">{v.closer || "—"}</td>
                          <td className="px-6 py-3 text-right font-mono tabular-nums font-semibold text-accent">
                            {fmtBRL(Number(v.valor_total || 0))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ overline, title }: { overline: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-mono">{overline}</span>
      <span className="h-px flex-1 bg-border/50" />
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function Kpi({
  icon, label, value, sub, accent,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className={`relative overflow-hidden border-border/50 backdrop-blur transition-all hover:border-accent/40 ${
      accent ? "bg-gradient-to-br from-accent/10 via-card/50 to-card/50" : "bg-card/50"
    }`}>
      {accent && (
        <div className="absolute top-0 right-0 h-24 w-24 rounded-full blur-3xl pointer-events-none"
          style={{ background: "oklch(0.78 0.13 75 / 0.2)" }} />
      )}
      <CardContent className="relative p-5">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-3">
          <span className={accent ? "text-accent" : ""}>{icon}</span>
          {label}
        </div>
        <div className={`font-black tracking-tight text-3xl md:text-[2rem] leading-none ${accent ? "text-accent" : ""}`}>
          {value}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground mt-2">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title, subtitle, children, full,
}: { title: string; subtitle?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardContent className="p-6">
        <div className="mb-4">
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
        <div className={full ? "h-56" : "h-64"}>{children}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
      <Activity className="h-6 w-6 opacity-40" />
      <div className="text-xs">{label}</div>
    </div>
  );
}
