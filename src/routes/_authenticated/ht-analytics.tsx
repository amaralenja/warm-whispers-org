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
import { HTContasReceber } from "@/components/ht-contas-receber";

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
  crm_status: string | null; crm_valor: number | null; crm_data_agendamento: string | null;
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
  const [agenda, setAgenda] = useState<any[]>([]);
  const [funilGrupo, setFunilGrupo] = useState<"consultoria" | "grupo" | "minicurso">("consultoria");
  const [tab, setTab] = useState<"dashboard" | "kanban" | "closer" | "receber" | "leads">("dashboard");

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
      const [v, hl, r, ag] = await Promise.all([
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
        (() => {
          let q = supabase.from("agenda_leads").select("*").limit(5000);
          if (startIso) q = q.gte("data_agendada", startIso);
          if (endIso) q = q.lt("data_agendada", endIso);
          return q;
        })(),
      ]);

      if (cancel) return;
      setLeads(all);
      setVendas(v.data ?? []);
      setHtLeads(hl.data ?? []);
      setReunioes(r.data ?? []);
      setAgenda(ag.data ?? []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [period, nonce]);

  const kpis = useMemo(() => {
    // Receita do quiz (crm_status = fechado/ganho, valor = crm_valor)
    const fechadosQuiz = leads.filter((l) => STATUS_FECHADO.includes(norm(l.crm_status || "")));
    const receitaQuiz = fechadosQuiz.reduce((s, l) => s + Number(l.crm_valor || 0), 0);
    // Vendas registradas em ht_vendas (se houver)
    const receitaVendas = vendas.reduce((s, x) => s + Number(x.valor_total || 0), 0);
    const liquidoVendas = vendas.reduce((s, x) => s + Number(x.valor_liquido || 0), 0);
    const receita = receitaQuiz + receitaVendas;
    const qtdVendas = fechadosQuiz.length + vendas.length;
    // Estimar líquido: usa ht_vendas se tiver, senão 85% do bruto do quiz (proxy pós-taxas)
    const liquido = liquidoVendas + (receitaQuiz * 0.85);
    const ticket = qtdVendas > 0 ? receita / qtdVendas : 0;
    const iniciados = leads.length;
    const finalizados = leads.filter(isFinalizado).length;
    const abandonos = iniciados - finalizados;
    const quentes = leads.filter(isQuente).length;
    const conv = iniciados > 0 ? (finalizados / iniciados) * 100 : 0;
    // Reuniões: leads com crm_data_agendamento OU status agendado/pós-agendamento
    const reunioesQuiz = leads.filter((l) => {
      if (l.crm_data_agendamento) return true;
      return STATUS_AGENDADO.includes(norm(l.crm_status || ""));
    }).length;
    const qtdReunioes = reunioesQuiz + reunioes.length;
    return {
      receita, liquido, ticket, qtdVendas,
      iniciados, finalizados, abandonos, quentes, conv,
      qtdHtLeads: htLeads.length, qtdReunioes,
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

      {/* Tabs */}
      <div className="border-b border-border/50 bg-background/60 backdrop-blur sticky top-0 z-10">
        <div className="px-6 md:px-10 flex items-center gap-1">
          {([
            { id: "dashboard", label: "Dashboard" },
            { id: "kanban", label: "Kanban SDR" },
            { id: "closer", label: "Kanban Closer" },
            { id: "receber", label: "Contas a Receber" },
            { id: "leads", label: "Lista de Leads" },
          ] as const).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-xs uppercase tracking-[0.2em] transition-colors relative ${
                tab === t.id ? "text-accent" : "text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
              {tab === t.id && <span className="absolute bottom-0 left-0 right-0 h-px bg-accent" />}
            </button>
          ))}
        </div>
      </div>

      {tab === "kanban" && <KanbanSDR leads={leads} loading={loading} />}
      {tab === "closer" && <KanbanCloser leads={leads} vendas={vendas} loading={loading} />}
      {tab === "receber" && <HTContasReceber />}
      {tab === "leads" && (
        <div className="px-6 md:px-10 py-8">
          <LeadsListSection
            leads={leads}
            flStatus={flStatus} setFlStatus={setFlStatus}
            flScore={flScore} setFlScore={setFlScore}
            flCaixa={flCaixa} setFlCaixa={setFlCaixa}
            flUtm={flUtm} setFlUtm={setFlUtm}
            flSearch={flSearch} setFlSearch={setFlSearch}
            listLimit={listLimit} setListLimit={setListLimit}
          />
        </div>
      )}

      {tab === "dashboard" && (
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

          <ChartCard title="Divisão por caixa (bolso)">
            <div className="flex flex-col h-full">
              <div className="h-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={divisaoCaixa} dataKey="value" nameKey="name"
                      innerRadius={40} outerRadius={70} paddingAngle={2} stroke="none">
                      {divisaoCaixa.map((_, i) => <Cell key={i} fill={CAIXA_COLORS[i % CAIXA_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1 flex-1 min-h-0 overflow-y-auto pr-1">
                {divisaoCaixa.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CAIXA_COLORS[i % CAIXA_COLORS.length] }} />
                      <span className="truncate text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-mono tabular-nums">{fmtInt(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Status geral">
            <div className="flex flex-col h-full">
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[
                      { name: "Finalizados", value: kpis.finalizados },
                      { name: "Abandonos", value: kpis.abandonos },
                    ]} dataKey="value" nameKey="name"
                      innerRadius={45} outerRadius={75} paddingAngle={2} stroke="none">
                      <Cell fill={ACCENT} />
                      <Cell fill="oklch(0.30 0.02 270)" />
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex items-center justify-center gap-6 text-xs shrink-0">
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
            </div>
          </ChartCard>

        </section>

        {/* Métricas do Funil */}
        <FunilSection
          leads={leads}
          agenda={agenda}
          reunioes={reunioes}
          vendas={vendas}
          grupo={funilGrupo}
          setGrupo={setFunilGrupo}
        />

        {/* Onde os leads abandonam */}
        <section>
          <SectionTitle overline="Bloco 05" title="Onde os leads abandonam" />
          <ChartCard title="Últimos passos antes de sair" subtitle="Ranking de etapas de abandono">
            {funilAbandono.length === 0 ? (
              <EmptyState label="Sem abandonos no período." />
            ) : (
              <div className="space-y-2 overflow-auto h-full pr-1">
                {funilAbandono.map((f) => (
                  <div key={f.label} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 text-[11px] truncate text-muted-foreground" title={f.label}>{f.label}</div>
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
      )}
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
    <Card className="border-border/50 bg-card/50 backdrop-blur flex flex-col">
      <CardContent className="p-6 flex-1 flex flex-col min-h-0">
        <div className="mb-4 shrink-0">
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
        <div className={`${full ? "h-56" : "h-72"} flex-1 min-h-0`}>{children}</div>
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

type LeadsListProps = {
  leads: QLead[];
  flStatus: Set<"finalizado" | "abandono">;
  setFlStatus: React.Dispatch<React.SetStateAction<Set<"finalizado" | "abandono">>>;
  flScore: Set<string>;
  setFlScore: React.Dispatch<React.SetStateAction<Set<string>>>;
  flCaixa: Set<string>;
  setFlCaixa: React.Dispatch<React.SetStateAction<Set<string>>>;
  flUtm: Set<string>;
  setFlUtm: React.Dispatch<React.SetStateAction<Set<string>>>;
  flSearch: string;
  setFlSearch: (v: string) => void;
  listLimit: number;
  setListLimit: React.Dispatch<React.SetStateAction<number>>;
};

function toggleInSet<T>(set: Set<T>, val: T): Set<T> {
  const next = new Set(set);
  if (next.has(val)) next.delete(val); else next.add(val);
  return next;
}

function LeadsListSection(props: LeadsListProps) {
  const { leads, flStatus, setFlStatus, flScore, setFlScore, flCaixa, setFlCaixa,
    flUtm, setFlUtm, flSearch, setFlSearch, listLimit, setListLimit } = props;

  const utmOptions = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) {
      const u = (l.utm_source ?? "").trim();
      if (u) s.add(u);
    }
    return Array.from(s).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const scoreLetras = new Set<string>();
    for (const g of SCORE_GROUPS) if (flScore.has(g.id)) g.letras.forEach((x) => scoreLetras.add(x));
    const q = flSearch.trim().toLowerCase();

    return leads.filter((l) => {
      const fin = isFinalizado(l);
      if (flStatus.size > 0) {
        const key: "finalizado" | "abandono" = fin ? "finalizado" : "abandono";
        if (!flStatus.has(key)) return false;
      }
      const letra = (l.caixa_letra ?? "").toUpperCase();
      if (scoreLetras.size > 0 && !scoreLetras.has(letra)) return false;
      if (flCaixa.size > 0 && !flCaixa.has(letra)) return false;
      if (flUtm.size > 0) {
        const u = (l.utm_source ?? "").trim();
        if (!flUtm.has(u)) return false;
      }
      if (q) {
        const hay = `${l.nome ?? ""} ${l.email ?? ""} ${l.whatsapp ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.data_criacao ?? "").localeCompare(a.data_criacao ?? ""));
  }, [leads, flStatus, flScore, flCaixa, flUtm, flSearch]);

  const total = filtered.length;
  const shown = filtered.slice(0, listLimit);
  const activeCount = flStatus.size + flScore.size + flCaixa.size + flUtm.size + (flSearch ? 1 : 0);

  return (
    <section>
      <SectionTitle overline="Bloco 05" title="Lista de Leads" />
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-5 space-y-5">
          {/* Filtros */}
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FilterGroup label="Status">
                <Chip active={flStatus.has("finalizado")} onClick={() => setFlStatus((s) => toggleInSet(s, "finalizado"))}>Finalizados</Chip>
                <Chip active={flStatus.has("abandono")} onClick={() => setFlStatus((s) => toggleInSet(s, "abandono"))}>Abandonaram</Chip>
              </FilterGroup>
              <FilterGroup label="Score">
                {SCORE_GROUPS.map((g) => (
                  <Chip key={g.id} active={flScore.has(g.id)} onClick={() => setFlScore((s) => toggleInSet(s, g.id))}>
                    {g.label}
                  </Chip>
                ))}
              </FilterGroup>
            </div>

            <FilterGroup label="Caixa (bolso)">
              {CAIXA_LETRAS.map((c) => (
                <Chip key={c.letra} active={flCaixa.has(c.letra)} onClick={() => setFlCaixa((s) => toggleInSet(s, c.letra))}>
                  <span className="font-mono text-accent mr-1.5">{c.letra}</span>{c.label}
                </Chip>
              ))}
            </FilterGroup>

            {utmOptions.length > 0 && (
              <FilterGroup label="Origem (UTM Source)">
                {utmOptions.map((u) => (
                  <Chip key={u} active={flUtm.has(u)} onClick={() => setFlUtm((s) => toggleInSet(s, u))}>{u}</Chip>
                ))}
              </FilterGroup>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={flSearch}
                onChange={(e) => setFlSearch(e.target.value)}
                placeholder="Buscar por nome, email ou WhatsApp…"
                className="flex-1 min-w-64 h-9 px-3 rounded-md bg-card/60 border border-border/60 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-accent/50"
              />
              {activeCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-8"
                  onClick={() => {
                    setFlStatus(new Set()); setFlScore(new Set());
                    setFlCaixa(new Set()); setFlUtm(new Set()); setFlSearch("");
                  }}>
                  Limpar {activeCount} filtro{activeCount > 1 ? "s" : ""}
                </Button>
              )}
              <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
                {fmtInt(total)} lead{total !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/50">
                  <th className="px-5 py-2.5">Data</th>
                  <th className="py-2.5">Lead</th>
                  <th className="py-2.5">Contato</th>
                  <th className="py-2.5">Score</th>
                  <th className="py-2.5">Caixa</th>
                  <th className="py-2.5">UTM</th>
                  <th className="px-5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-xs">
                    Nenhum lead encontrado com esses filtros.
                  </td></tr>
                )}
                {shown.map((l) => {
                  const fin = isFinalizado(l);
                  const letra = (l.caixa_letra ?? "").toUpperCase();
                  const scoreLabel = "DEFG".includes(letra) ? "Call agendada"
                    : "BC".includes(letra) ? "Análise equipe"
                    : letra === "A" ? "Minicurso" : "—";
                  return (
                    <tr key={l.id} className="border-b border-border/30 last:border-0 hover:bg-accent/5 transition-colors">
                      <td className="px-5 py-2.5 text-muted-foreground tabular-nums text-xs">
                        {new Date(l.data_criacao).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-2.5">
                        <div className="font-medium truncate max-w-40">{l.nome || "—"}</div>
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        <div className="truncate max-w-48">{l.email || "—"}</div>
                        <div className="tabular-nums">{l.whatsapp || ""}</div>
                      </td>
                      <td className="py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">
                          {scoreLabel}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {letra ? (
                          <span className="text-xs font-mono">
                            <span className="text-accent font-bold">{letra}</span>
                            <span className="text-muted-foreground ml-1.5">
                              {CAIXA_LETRAS.find((c) => c.letra === letra)?.label ?? l.caixa_label ?? ""}
                            </span>
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground truncate max-w-32">
                        {l.utm_source || "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${
                          fin ? "bg-accent/20 text-accent" : "bg-muted/30 text-muted-foreground"
                        }`}>
                          {fin ? "Finalizado" : "Abandono"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {shown.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setListLimit((n) => n + 50)}>
                Ver mais ({fmtInt(total - shown.length)} restantes)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
        active
          ? "bg-accent text-accent-foreground border-accent shadow-[0_0_20px_-6px_oklch(0.78_0.13_75_/_0.5)]"
          : "bg-card/40 border-border/50 text-muted-foreground hover:border-accent/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ================= Métricas do Funil =================
type FunilGrupo = "consultoria" | "grupo" | "minicurso";
const FUNIL_GRUPOS: { id: FunilGrupo; label: string; sub: string; letras: string[] }[] = [
  { id: "consultoria", label: "Consultoria", sub: "> R$ 3k · Caixa D+", letras: ["D", "E", "F", "G"] },
  { id: "grupo", label: "Grupo", sub: "R$ 1k – 3k · Caixa B/C", letras: ["B", "C"] },
  { id: "minicurso", label: "Minicurso", sub: "< R$ 1k · Caixa A", letras: ["A"] },
];

// Buckets de crm_status vindos do banco do quiz
const STATUS_AGENDADO = ["agendado", "fechado", "ganho", "followup", "follow_up", "remarcada", "remarcado", "no_show", "no-show", "noshow", "sinal", "sinal_recebido"];
const STATUS_CALL_FEITA = ["fechado", "ganho", "followup", "follow_up", "remarcada", "remarcado", "sinal", "sinal_recebido"];
const STATUS_FECHADO = ["fechado", "ganho"];
const STATUS_NOSHOW = ["no_show", "no-show", "noshow"];

const norm = (s: string | null | undefined) => (s ?? "").toString().trim().toLowerCase();

function FunilSection({
  leads, grupo, setGrupo,
}: {
  leads: QLead[]; agenda: any[]; reunioes: any[]; vendas: any[];
  grupo: FunilGrupo; setGrupo: (g: FunilGrupo) => void;
}) {
  const metricasPorGrupo = useMemo(() => {
    return FUNIL_GRUPOS.map((g) => {
      const set = new Set(g.letras);
      // "Formulário finalizado" no funil = lead que chegou até a atribuição de caixa
      // (mesma base da Lista de Leads quando filtrada por Caixa). Não exigimos
      // whatsapp/comprometimento aqui pra bater com o número que o usuário vê na lista.
      const doGrupo = leads.filter((l) => {
        const c = (l.caixa_letra ?? "").toUpperCase();
        return set.has(c);
      });
      const finalizados = doGrupo.length;

      const withStatus = doGrupo.filter((l) => l.crm_status);
      const agendados = withStatus.filter((l) => STATUS_AGENDADO.includes(norm(l.crm_status))).length;
      const realizadas = withStatus.filter((l) => STATUS_CALL_FEITA.includes(norm(l.crm_status))).length;
      const fechamentos = withStatus.filter((l) => STATUS_FECHADO.includes(norm(l.crm_status))).length;
      const noShow = withStatus.filter((l) => STATUS_NOSHOW.includes(norm(l.crm_status))).length;
      const naoFechou = Math.max(0, realizadas - fechamentos);

      const taxaAgend = finalizados > 0 ? (agendados / finalizados) * 100 : 0;
      const showUp = agendados > 0 ? (realizadas / agendados) * 100 : 0;
      const taxaFech = realizadas > 0 ? (fechamentos / realizadas) * 100 : 0;
      const taxaNoShow = agendados > 0 ? (noShow / agendados) * 100 : 0;

      return { g, finalizados, agendados, realizadas, fechamentos, noShow, naoFechou,
        taxaAgend, showUp, taxaFech, taxaNoShow };
    });
  }, [leads]);

  const atual = metricasPorGrupo.find((m) => m.g.id === grupo)!;

  return (
    <section>
      <SectionTitle overline="Bloco 04" title="Métricas do Funil" />
      <Card className="border-border/50 bg-card/50 backdrop-blur overflow-hidden">
        <CardContent className="p-6">
          <div className="grid gap-6 lg:grid-cols-[220px_1fr_240px]">
            {/* Coluna esquerda: seletor de grupos */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Grupo de leads</div>
              {metricasPorGrupo.map((m) => {
                const active = m.g.id === grupo;
                return (
                  <button
                    key={m.g.id}
                    type="button"
                    onClick={() => setGrupo(m.g.id)}
                    className={`w-full text-left rounded-lg border p-3 transition-all ${
                      active
                        ? "border-accent bg-accent/10 shadow-[0_0_24px_-8px_oklch(0.78_0.13_75_/_0.5)]"
                        : "border-border/50 bg-card/40 hover:border-accent/40"
                    }`}
                  >
                    <div className={`text-sm font-semibold ${active ? "text-accent" : ""}`}>{m.g.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{m.g.sub}</div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-xl font-mono tabular-nums font-bold">{fmtInt(m.finalizados)}</span>
                      <span className="text-[10px] text-muted-foreground">finalizados</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Coluna central: funil visual (cone) */}
            <div className="flex items-center justify-center">
              <FunilVisual
                stages={[
                  { label: "Formulários Finalizados", value: atual.finalizados, sub: atual.g.sub },
                  { label: "Agendados p/ Call", value: atual.agendados, sub: `Taxa: ${fmtPct(atual.taxaAgend)}` },
                  { label: "Calls Realizadas", value: atual.realizadas, sub: `Show-up: ${fmtPct(atual.showUp)}` },
                  { label: "Fechamentos (Ganhos)", value: atual.fechamentos, sub: `Conversão: ${fmtPct(atual.taxaFech)}` },
                ]}
              />
            </div>

            {/* Coluna direita: perdas */}
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Perdas do funil</div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-[10px] uppercase tracking-wider text-red-400 font-semibold">No-show</span>
                </div>
                <div className="text-3xl font-mono tabular-nums font-bold text-red-400">{fmtInt(atual.noShow)}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{fmtPct(atual.taxaNoShow)} dos agendados</div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">Call feita · não fechou</span>
                </div>
                <div className="text-3xl font-mono tabular-nums font-bold text-amber-400">{fmtInt(atual.naoFechou)}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {atual.realizadas > 0 ? fmtPct((atual.naoFechou / atual.realizadas) * 100) : "0,0%"} das calls
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// Cone SVG — 4 estágios com largura decrescente
function FunilVisual({ stages }: {
  stages: { label: string; value: number; sub: string }[];
}) {
  const W = 460;
  const H = 420;
  const topW = 440;   // largura no topo
  const botW = 90;    // largura na base
  const bandH = H / stages.length;

  const widthAt = (y: number) => topW - ((topW - botW) * (y / H));

  const COLORS = [
    { fill: "#3B82F6", stroke: "#60A5FA" },   // azul
    { fill: "#F59E0B", stroke: "#FBBF24" },   // âmbar
    { fill: "#8B5CF6", stroke: "#A78BFA" },   // violeta
    { fill: "#10B981", stroke: "#34D399" },   // verde
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H + 10}`} className="w-full max-w-[460px]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {COLORS.map((c, i) => (
          <linearGradient key={i} id={`fg${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.stroke} stopOpacity="0.95" />
            <stop offset="100%" stopColor={c.fill} stopOpacity="1" />
          </linearGradient>
        ))}
        <filter id="funilShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {stages.map((s, i) => {
        const y1 = i * bandH;
        const y2 = (i + 1) * bandH;
        const w1 = widthAt(y1);
        const w2 = widthAt(y2);
        const cx = W / 2;
        const x1L = cx - w1 / 2, x1R = cx + w1 / 2;
        const x2L = cx - w2 / 2, x2R = cx + w2 / 2;
        const path = `M ${x1L} ${y1} L ${x1R} ${y1} L ${x2R} ${y2} L ${x2L} ${y2} Z`;
        const cy = (y1 + y2) / 2;

        return (
          <g key={s.label}>
            {i === 0 && (
              <ellipse cx={cx} cy={y1 + 4} rx={w1 / 2} ry={8}
                fill="rgba(0,0,0,0.25)" filter="url(#funilShadow)" />
            )}
            <path d={path} fill={`url(#fg${i})`} stroke={COLORS[i].stroke} strokeWidth="1" opacity="0.95" />
            {/* leve highlight elíptico */}
            <ellipse cx={cx} cy={y1 + 6} rx={(w1 / 2) - 4} ry={4} fill="rgba(255,255,255,0.18)" />
            <text x={cx} y={cy - 14} textAnchor="middle"
              fontSize="11" fontWeight="700" fill="#fff" style={{ letterSpacing: 0.5 }}>
              {s.label.toUpperCase()}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle"
              fontSize="26" fontWeight="900" fill="#fff" style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
              {fmtInt(s.value)}
            </text>
            <text x={cx} y={cy + 26} textAnchor="middle"
              fontSize="10" fill="rgba(255,255,255,0.85)">
              {s.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}


// ============================================================
// Kanban SDR
// ============================================================
const KANBAN_STAGES: { id: string; label: string; accent?: string }[] = [
  { id: "novos", label: "Novos Leads (> 1k)" },
  { id: "c1", label: "1º Contato (Msg Caio)" },
  { id: "c2", label: "2º Contato (SDR)" },
  { id: "c3", label: "3º Contato (Msg Caio)" },
  { id: "convite", label: "Convite do Grupo" },
  { id: "no_grupo", label: "1-3k no Grupo" },
  { id: "agendado", label: "Agendado", accent: "text-emerald-400" },
  { id: "no_show", label: "No-show", accent: "text-red-400" },
  { id: "descartado", label: "Descartado", accent: "text-muted-foreground" },
];

const KANBAN_LS_KEY = "ht_kanban_sdr_v1";

function loadKanbanMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KANBAN_LS_KEY) || "{}"); } catch { return {}; }
}
function saveKanbanMap(m: Record<string, string>) {
  try { localStorage.setItem(KANBAN_LS_KEY, JSON.stringify(m)); } catch {}
}

function KanbanSDR({ leads, loading }: { leads: QLead[]; loading: boolean }) {
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const [caixaFilter, setCaixaFilter] = useState<string>("all"); // all | B | C | D | E | F | G
  const [utmFilter, setUtmFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => { setStageMap(loadKanbanMap()); }, []);

  const utmOptions = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) if (l.utm_source) s.add(l.utm_source);
    return Array.from(s).sort();
  }, [leads]);

  const eligible = useMemo(() => {
    return leads.filter((l) => {
      const c = (l.caixa_letra ?? "").toUpperCase();
      if (!"BCDEFG".includes(c)) return false; // Leads > R$ 1k
      if (caixaFilter !== "all" && c !== caixaFilter) return false;
      if (utmFilter !== "all" && (l.utm_source ?? "") !== utmFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${l.nome ?? ""} ${l.email ?? ""} ${l.whatsapp ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, caixaFilter, utmFilter, search]);

  const byStage = useMemo(() => {
    const m: Record<string, QLead[]> = {};
    for (const s of KANBAN_STAGES) m[s.id] = [];
    // Mapeia crm_status do quiz DB → nossas colunas
    const mapCrm = (s: string | null | undefined): string => {
      switch ((s ?? "").toLowerCase()) {
        case "followup": return "c2";
        case "grupo13k": return "no_grupo";
        case "reagendamento": return "convite";
        case "fechado":
        case "agendado": return "agendado";
        case "noshow": return "no_show";
        case "descartado_sdr":
        case "descartado_closer":
        case "descartado": return "descartado";
        default: return "novos";
      }
    };
    for (const l of eligible) {
      const st = stageMap[l.id] || mapCrm(l.crm_status);
      (m[st] || m.novos).push(l);
    }
    for (const s of KANBAN_STAGES) {
      m[s.id].sort((a, b) => String(b.data_criacao).localeCompare(String(a.data_criacao)));
    }
    return m;
  }, [eligible, stageMap]);

  function moveTo(leadId: string, stage: string) {
    setStageMap((prev) => {
      const next = { ...prev, [leadId]: stage };
      saveKanbanMap(next);
      return next;
    });
  }

  return (
    <div className="px-6 md:px-10 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight">
            Kanban <span className="text-accent italic font-serif">SDR</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Gestão de primeiros contatos e qualificação · {loading ? "carregando…" : `${fmtInt(eligible.length)} leads (caixa > R$ 1k)`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={caixaFilter} onValueChange={setCaixaFilter}>
            <SelectTrigger className="h-9 w-48 bg-card/60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Caixas (&gt; 1k)</SelectItem>
              {["B","C","D","E","F","G"].map((c) => (
                <SelectItem key={c} value={c}>Caixa {c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={utmFilter} onValueChange={setUtmFilter}>
            <SelectTrigger className="h-9 w-44 bg-card/60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as UTMs</SelectItem>
              {utmOptions.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead…"
            className="h-9 px-3 rounded-md bg-card/60 border border-border/60 text-xs w-52 focus:outline-none focus:border-accent/60" />
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 -mx-6 md:-mx-10 px-6 md:px-10">
        {KANBAN_STAGES.map((s) => (
          <div key={s.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/x-lead-id");
              if (id) moveTo(id, s.id);
              setDraggingId(null);
            }}
            className="shrink-0 w-72 rounded-xl border border-border/50 bg-card/40 backdrop-blur flex flex-col max-h-[70vh]">
            <div className="px-3 py-3 border-b border-border/40 flex items-center justify-between sticky top-0 bg-card/60 rounded-t-xl">
              <div className={`text-xs font-semibold tracking-tight ${s.accent ?? ""}`}>{s.label}</div>
              <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
                {byStage[s.id].length}
              </span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto flex-1">
              {byStage[s.id].length === 0 && (
                <div className="text-[11px] text-muted-foreground text-center py-6 opacity-60">
                  Arraste leads aqui
                </div>
              )}
              {byStage[s.id].slice(0, 50).map((l) => (
                <div key={l.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/x-lead-id", l.id);
                    setDraggingId(l.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`p-3 rounded-lg bg-background/60 border border-border/50 hover:border-accent/50 transition-colors cursor-grab active:cursor-grabbing ${
                    draggingId === l.id ? "opacity-40" : ""
                  }`}>
                  <div className="text-xs font-semibold truncate">{l.nome || "Sem nome"}</div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {l.utm_source && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                        {l.utm_source}
                      </span>
                    )}
                    {l.caixa_letra && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-mono">
                        {l.caixa_letra}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1.5 tabular-nums">
                    {new Date(l.data_criacao).toLocaleDateString("pt-BR")}
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <select
                      value={stageMap[l.id] || "novos"}
                      onChange={(e) => moveTo(l.id, e.target.value)}
                      className="flex-1 text-[10px] h-6 px-1 rounded bg-card/60 border border-border/50 focus:outline-none focus:border-accent/60">
                      {KANBAN_STAGES.map((ks) => (
                        <option key={ks.id} value={ks.id}>{ks.label}</option>
                      ))}
                    </select>
                    {l.whatsapp && (
                      <a href={`https://wa.me/${String(l.whatsapp).replace(/\D/g, "")}`}
                        target="_blank" rel="noreferrer"
                        className="text-[10px] px-2 h-6 flex items-center rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30">
                        WA
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {byStage[s.id].length > 50 && (
                <div className="text-[10px] text-center text-muted-foreground py-2">
                  + {byStage[s.id].length - 50} leads ocultos
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Kanban Closer
// ============================================================
const CLOSER_STAGES: { id: string; label: string; accent?: string }[] = [
  { id: "agendado", label: "Agendado" },
  { id: "followup", label: "Follow Up", accent: "text-sky-400" },
  { id: "remarcada", label: "Remarcada", accent: "text-amber-400" },
  { id: "sinal", label: "Sinal Recebido", accent: "text-violet-400" },
  { id: "fechado", label: "Fechado (Ganho)", accent: "text-emerald-400" },
  { id: "descartado", label: "Descartado", accent: "text-red-400" },
];

const CLOSER_LS_KEY = "ht_kanban_closer_v1";

function loadCloserMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(CLOSER_LS_KEY) || "{}"); } catch { return {}; }
}
function saveCloserMap(m: Record<string, string>) {
  try { localStorage.setItem(CLOSER_LS_KEY, JSON.stringify(m)); } catch {}
}

type CloserCard = {
  id: string; nome: string; valor: number; created_at: string;
  closer?: string | null; source: "lead" | "venda"; defaultStage: string;
  caixa?: string | null; utm?: string | null;
};

// Valor estimado do sinal/ticket a partir da caixa do quiz
const CAIXA_VALOR: Record<string, number> = {
  D: 3000, E: 5000, F: 8000, G: 15000,
};

function KanbanCloser({ leads, vendas, loading }: { leads: QLead[]; vendas: any[]; loading: boolean }) {
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const [closerFilter, setCloserFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => { setStageMap(loadCloserMap()); }, []);

  const cards: CloserCard[] = useMemo(() => {
    const list: CloserCard[] = [];
    // Leads quentes do quiz — usa crm_status como stage padrão
    const mapCloserStage = (s: string | null | undefined): string => {
      switch ((s ?? "").toLowerCase()) {
        case "fechado": return "fechado";
        case "followup": return "followup";
        case "reagendamento": return "remarcada";
        case "noshow": return "descartado";
        case "descartado_sdr":
        case "descartado_closer":
        case "descartado": return "descartado";
        default: return "agendado";
      }
    };
    for (const l of leads || []) {
      if (!isFinalizado(l)) continue;
      const caixa = (l.caixa_letra ?? "").toUpperCase();
      if (!"DEFG".includes(caixa)) continue;
      list.push({
        id: `qlead-${l.id}`,
        nome: l.nome || l.whatsapp || "Sem nome",
        valor: Number(l.crm_valor || CAIXA_VALOR[caixa] || 0),
        created_at: l.crm_data_agendamento || l.data_criacao,
        closer: null,
        source: "lead",
        defaultStage: mapCloserStage(l.crm_status),
        caixa: l.caixa_label,
        utm: l.utm_source,
      });
    }
    // Vendas confirmadas = fechado (ganho)
    for (const v of vendas || []) {
      list.push({
        id: `venda-${v.id}`,
        nome: v.cliente || "Sem nome",
        valor: Number(v.valor_total || 0),
        created_at: v.data || v.created_at,
        closer: v.closer,
        source: "venda",
        defaultStage: "fechado",
      });
    }
    return list;
  }, [leads, vendas]);

  const closerOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) if (c.closer) s.add(c.closer);
    return Array.from(s).sort();
  }, [cards]);

  const filtered = useMemo(() => cards.filter((c) => {
    if (closerFilter !== "all" && c.closer !== closerFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${c.nome} ${c.closer ?? ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [cards, closerFilter, search]);

  const byStage = useMemo(() => {
    const m: Record<string, CloserCard[]> = {};
    for (const s of CLOSER_STAGES) m[s.id] = [];
    for (const c of filtered) {
      const st = stageMap[c.id] || c.defaultStage;
      (m[st] || m.agendado).push(c);
    }
    for (const s of CLOSER_STAGES) {
      m[s.id].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    }
    return m;
  }, [filtered, stageMap]);

  function moveTo(id: string, stage: string) {
    setStageMap((prev) => {
      const next = { ...prev, [id]: stage };
      saveCloserMap(next);
      return next;
    });
  }

  return (
    <div className="px-6 md:px-10 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight">
            Kanban <span className="text-accent italic font-serif">Closer</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Gestão de agendamentos e fechamento · {loading ? "carregando…" : `${fmtInt(filtered.length)} cards`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={closerFilter} onValueChange={setCloserFilter}>
            <SelectTrigger className="h-9 w-48 bg-card/60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os closers</SelectItem>
              {closerOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead…"
            className="h-9 px-3 rounded-md bg-card/60 border border-border/60 text-xs w-52 focus:outline-none focus:border-accent/60" />
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 -mx-6 md:-mx-10 px-6 md:px-10">
        {CLOSER_STAGES.map((s) => {
          const items = byStage[s.id];
          const total = items.reduce((a, c) => a + (c.valor || 0), 0);
          return (
            <div key={s.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/x-closer-id");
                if (id) moveTo(id, s.id);
                setDraggingId(null);
              }}
              className="shrink-0 w-72 rounded-xl border border-border/50 bg-card/40 backdrop-blur flex flex-col max-h-[70vh]">
              <div className="px-3 py-3 border-b border-border/40 sticky top-0 bg-card/60 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div className={`text-xs font-semibold tracking-tight ${s.accent ?? ""}`}>{s.label}</div>
                  <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <div className="text-[10px] font-mono tabular-nums text-accent mt-1">{fmtBRL(total)}</div>
              </div>
              <div className="p-2 space-y-2 overflow-y-auto flex-1">
                {items.length === 0 && (
                  <div className="text-[11px] text-muted-foreground text-center py-6 opacity-60">Vazio</div>
                )}
                {items.slice(0, 60).map((c) => (
                  <div key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/x-closer-id", c.id);
                      setDraggingId(c.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`p-3 rounded-lg bg-background/60 border border-border/50 hover:border-accent/50 transition-colors cursor-grab active:cursor-grabbing ${
                      draggingId === c.id ? "opacity-40" : ""
                    }`}>
                    <div className="text-xs font-semibold truncate">{c.nome}</div>
                    {c.valor > 0 && (
                      <div className="text-[11px] font-mono tabular-nums text-emerald-400 mt-1">{fmtBRL(c.valor)}</div>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}
                      </div>
                      {c.closer && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 truncate max-w-[100px]">
                          {c.closer}
                        </span>
                      )}
                    </div>
                    <select
                      value={stageMap[c.id] || c.defaultStage}
                      onChange={(e) => moveTo(c.id, e.target.value)}
                      className="w-full mt-2 text-[10px] h-6 px-1 rounded bg-card/60 border border-border/50 focus:outline-none focus:border-accent/60">
                      {CLOSER_STAGES.map((ks) => (
                        <option key={ks.id} value={ks.id}>{ks.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {items.length > 60 && (
                  <div className="text-[10px] text-center text-muted-foreground py-2">
                    + {items.length - 60} ocultos
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



