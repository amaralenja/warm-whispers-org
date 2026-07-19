import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw, DollarSign, TrendingUp, Target, ShoppingBag,
  Users, CheckCircle2, XCircle, Flame, Activity, Plus,
  Search, SlidersHorizontal, X, Mail, Phone, Calendar, TrendingDown, ArrowUpRight, Copy, Trash2,
  Sparkles, Zap, Megaphone, Loader2, Trophy, ChevronDown, ArrowDown
} from "lucide-react";
import { listCampaigns } from "@/lib/meta-ads-manager.functions";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { HTContasReceber } from "@/components/ht-contas-receber";
import { CalendarPage } from "@/routes/_authenticated/calendar";
import { HtLeadDetailDialog } from "@/components/ht-lead-detail-dialog";
import { KanbanLeadCard, useIgProfileMap } from "@/components/kanban-lead-card";
import { DragScroll } from "@/components/drag-scroll";
import { getHtTeamSession, matchesHtCloser } from "@/lib/ht-team-session";
import { getKanbanLocalData } from "@/lib/ht-api.functions";
import { useServerFn } from "@tanstack/react-start";
import { createEvent } from "@/lib/google-calendar.functions";
import {
  ensureHtKanbanState,
  snapshotSdrStages, snapshotFakeSet, snapshotSched, snapshotCloserEmail, snapshotCloserStages,
  setSdrStage as dbSetSdrStage, setFake as dbSetFake, setScheduled as dbSetScheduled,
  setCloserEmail as dbSetCloserEmail, setCloserStage as dbSetCloserStage,
  setScheduledAndCloser as dbSetScheduleAndCloser,
} from "@/lib/ht-kanban-state";


export const Route = createFileRoute("/_authenticated/ht-analytics")({
  component: () => <HTAnalytics />,
});

type HTTab = "dashboard" | "kanban" | "closer" | "receber" | "leads" | "sdr-metrics" | "facebook-ads";

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
  instagram: string | null;
  caixa_letra: string | null; caixa_label: string | null;
  faturamento: string | null; momento: string | null; objetivo: string | null;
  investir: string | null; minicurso: string | null; socio: string | null;
  comprometimento: string | null; last_step: string | null; funil: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content?: string | null;
  crm_status: string | null; crm_valor: number | null; crm_data_agendamento: string | null;
  respostas?: Record<string, any> | null;
};

const isFinalizado = (l: QLead) => {
  if (!l) return false;
  if (l.id?.startsWith("htq:") || l.utm_source === "sdr-manual" || l.utm_medium === "sdr-manual") return true;
  return !!(l.whatsapp || l.email || l.caixa_letra || l.faturamento || l.nome);
};

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

export function HTAnalytics({ initialTab = "dashboard" }: { initialTab?: HTTab } = {}) {
  const getLocalDataFn = useServerFn(getKanbanLocalData);
  const [period, setPeriod] = useState<Period>("30d");
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<QLead[]>([]);
  const [notesMap, setNotesMap] = useState<Record<string, { body: string; author: string | null; role: string }>>({});
  const [vendas, setVendas] = useState<any[]>([]);

  const [htLeads, setHtLeads] = useState<any[]>([]);
  const [reunioes, setReunioes] = useState<any[]>([]);
  const [agenda, setAgenda] = useState<any[]>([]);
  const [funilGrupo, setFunilGrupo] = useState<"consultoria" | "grupo" | "minicurso">("consultoria");
  const [tab, setTab] = useState<HTTab>(initialTab);
  const [lancarVendaOpen, setLancarVendaOpen] = useState(false);

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
        const mapped = (data as any[]).map(l => ({
          ...l,
          respostas: l.respostas_json || l.respostas || null
        }));
        all.push(...(mapped as QLead[]));
        if (data.length < pageSize) break;
      }

      // Quiz leads vindos pela API pública (tabela ht_quiz_submissions neste projeto).
      // Precisa entrar no Kanban SDR igual os leads do quiz externo.
      try {
        let qz = supabase.from("ht_quiz_submissions" as any)
          .select("id, received_at, nome, email, whatsapp, instagram, utm_source, utm_medium, utm_campaign, respostas")
          .order("received_at", { ascending: false })
          .limit(5000);
        if (startIso) qz = qz.gte("received_at", startIso);
        if (endIso) qz = qz.lt("received_at", endIso);
        const { data: qzData } = await qz;
        if (qzData) {
          for (const s of qzData as any[]) {
            const r = (s.respostas ?? {}) as Record<string, any>;
            all.push({
              id: `htq:${s.id}`,
              data_criacao: s.received_at,
              nome: s.nome ?? null,
              email: s.email ?? null,
              whatsapp: s.whatsapp ?? null,
              instagram: s.instagram ?? null,
              caixa_letra: r.caixa_letra ?? null,
              caixa_label: r.caixa_label ?? null,
              faturamento: r.faturamento ?? null,
              momento: r.momento ?? null,
              objetivo: r.objetivo ?? null,
              investir: r.investir ?? null,
              minicurso: r.minicurso ?? null,
              socio: r.socio ?? null,
              comprometimento: r.comprometimento ?? null,
              last_step: r.step_atual != null ? String(r.step_atual) : null,
              funil: r.funil ?? null,
              utm_source: s.utm_source ?? null,
              utm_medium: s.utm_medium ?? null,
              utm_campaign: s.utm_campaign ?? null,
              crm_status: null,
              crm_valor: null,
              crm_data_agendamento: null,
              respostas: r,
            } as QLead);
          }
        }
      } catch {
        /* silencioso — se falhar, só não mostra os leads da API */
      }

      // HT tables via secure server function to bypass RLS 401s
      let localData = {
        vendas: [] as any[],
        reunioes: [] as any[],
        leads: [] as any[],
        agenda: [] as any[],
        notes: [] as any[]
      };
      try {
        localData = await getLocalDataFn({ data: { startIso, endIso } });
      } catch (err) {
        console.error("Erro ao buscar dados locais do HT:", err);
      }

      if (cancel) return;
      // Deduplica por whatsapp: leads da API só entram se não vieram do quiz externo.
      const seenWa = new Set<string>();
      const merged: QLead[] = [];
      for (const l of all) {
        const key = (l.whatsapp || "").replace(/\D+/g, "");
        if (key) {
          if (seenWa.has(key)) continue;
          seenWa.add(key);
        }
        merged.push(l);
      }
      merged.sort((a, b) => String(b.data_criacao).localeCompare(String(a.data_criacao)));
      setLeads(merged);
      setVendas(localData.vendas);
      setHtLeads(localData.leads);
      setReunioes(localData.reunioes);
      setAgenda(localData.agenda);

      // Preenche o mapa com a observação mais recente
      const nMap: Record<string, { body: string; author: string | null; role: string }> = {};
      if (localData.notes) {
        for (const n of localData.notes as any[]) {
          nMap[n.lead_id] = {
            body: n.body,
            author: n.author,
            role: n.role,
          };
        }
      }
      setNotesMap(nMap);

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

  const STEP_LABELS: Record<string, string> = {
    nome: "Nome", email: "E-mail", whatsapp: "WhatsApp", instagram: "Instagram",
    momento: "Momento atual", gargalo: "Gargalo", situacao: "Situação",
    caixa: "Caixa disponível", caixa_letra: "Caixa (letra)",
    faturamento: "Faturamento", lucro: "Lucro desejado", meta: "Meta / objetivo",
    objetivo: "Objetivo", investir: "Já investiu?", socio: "Sócio/Cônjuge",
    comprometimento: "Comprometimento", minicurso: "Ideia de SaaS",
    inicio: "Início", start: "Início", finish: "Finalizado",
  };
  const prettyStep = (s: string): string => {
    const k = s.toLowerCase().trim();
    if (STEP_LABELS[k]) return STEP_LABELS[k];
    const m = k.match(/^step[_-]?(\d+)$/);
    if (m) return `Etapa ${m[1]}`;
    return k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };
  const funilAbandono = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      if (isFinalizado(l)) continue;
      const k = prettyStep((l.last_step ?? l.funil ?? "").trim() || "inicio");
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
              <Button onClick={() => setLancarVendaOpen(true)} className="h-10 bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5 font-semibold text-xs uppercase tracking-wider px-4">
                <Plus className="h-4 w-4" /> Lançar Venda
              </Button>
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
        <div className="px-6 md:px-10 flex items-center gap-1 overflow-x-auto">
          {(() => {
            const s = getHtTeamSession();
            const tabs: { id: HTTab; label: string }[] = [];
            if (!s || s.tipo === "sdr") tabs.push({ id: "kanban", label: "Kanban SDR" });
            if (!s || s.tipo === "closer") tabs.push({ id: "closer", label: "Kanban Closer" });
            tabs.push({ id: "dashboard", label: "Dashboard" });
            if (s && s.tipo === "sdr") tabs.push({ id: "sdr-metrics", label: "Métricas SDR" });
            tabs.push({ id: "receber", label: "Contas a Receber" });
            tabs.push({ id: "leads", label: "Lista de Leads" });
            tabs.push({ id: "facebook-ads", label: "Facebook Ads" });
            return tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-xs uppercase tracking-[0.2em] transition-colors relative whitespace-nowrap ${
                  tab === t.id ? "text-accent" : "text-muted-foreground hover:text-foreground"
                }`}>
                {t.label}
                {tab === t.id && <span className="absolute bottom-0 left-0 right-0 h-px bg-accent" />}
              </button>
            ));
          })()}
        </div>
      </div>

      {tab === "kanban" && <KanbanSDR leads={leads} loading={loading} onReload={() => setNonce((n) => n + 1)} notesMap={notesMap} />}
      {tab === "closer" && (
        <>
          <KanbanCloser leads={leads} vendas={vendas} loading={loading} onReload={() => setNonce((n) => n + 1)} notesMap={notesMap} />

          <div className="border-t border-border/50 mt-6">
            <div className="px-6 md:px-10 pt-6 pb-2">
              <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Calendário de Calls
              </h2>
            </div>
            <CalendarPage />
          </div>
        </>
      )}
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
      {tab === "sdr-metrics" && (
        <SdrDashboard leads={leads} notesMap={notesMap} onReload={() => setNonce((n) => n + 1)} />
      )}
      {tab === "facebook-ads" && (
        <FacebookAdsAnalyticsSection leads={leads} vendas={vendas} period={period} />
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

        {/* Funil de Vendas Hight Ticket */}
        <section>
          <SectionTitle overline="Bloco 02" title="Funil de Vendas HT" />
          <SalesFunnelView leads={leads} vendas={vendas} period={period} />
        </section>

        {/* Receita por Origem de Tráfego */}
        {vendas.length > 0 && (
          <section>
            <SectionTitle overline="Bloco 02B" title="Receita por Origem de Tráfego" />
            <ReceitaPorOrigemView leads={leads} vendas={vendas} />
          </section>
        )}

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
          htLeads={htLeads}
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

  // KPIs contextuais dos leads filtrados
  const kpisLista = useMemo(() => {
    const fin = filtered.filter(isFinalizado).length;
    const aband = filtered.length - fin;
    const quentes = filtered.filter((l) => ["D","E","F","G"].includes((l.caixa_letra ?? "").toUpperCase())).length;
    const rate = filtered.length > 0 ? (fin / filtered.length) * 100 : 0;
    return { fin, aband, quentes, rate };
  }, [filtered]);

  const clearAll = () => {
    setFlStatus(new Set()); setFlScore(new Set());
    setFlCaixa(new Set()); setFlUtm(new Set()); setFlSearch("");
  };

  return (
    <section className="space-y-5">
      {/* HERO / HEADER */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card/80 to-card/40 backdrop-blur">
        <div className="absolute inset-0 opacity-40 pointer-events-none">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="relative p-6 grid gap-6 lg:grid-cols-[1fr_auto] items-center">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-accent/80 mb-2">
              Lista de Leads · Quiz High Ticket
            </div>
            <h2 className="text-3xl font-black tracking-tight">
              {fmtInt(total)} <span className="text-muted-foreground font-medium text-2xl">leads encontrados</span>
            </h2>
            <div className="mt-1 text-xs text-muted-foreground">
              Filtragem avançada por status, score, caixa e origem de tráfego.
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <MiniKpi icon={CheckCircle2} label="Finalizados" value={fmtInt(kpisLista.fin)} tone="ok" />
            <MiniKpi icon={XCircle} label="Abandono" value={fmtInt(kpisLista.aband)} tone="mute" />
            <MiniKpi icon={Flame} label="Quentes D+" value={fmtInt(kpisLista.quentes)} tone="hot" />
            <MiniKpi icon={TrendingUp} label="Conversão" value={`${kpisLista.rate.toFixed(1)}%`} tone="accent" />
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* SIDEBAR DE FILTROS */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card className="border-border/50 bg-card/50 backdrop-blur overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-accent/5 to-transparent">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" />
                <div className="text-[11px] font-semibold uppercase tracking-wider">Filtros</div>
              </div>
              {activeCount > 0 && (
                <button onClick={clearAll} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  <X className="h-3 w-3" /> Limpar ({activeCount})
                </button>
              )}
            </div>
            <div className="p-4 space-y-5 max-h-[calc(100vh-14rem)] overflow-y-auto">
              <FilterBlock label="Status">
                <Chip active={flStatus.has("finalizado")} onClick={() => setFlStatus((s) => toggleInSet(s, "finalizado"))}>
                  <CheckCircle2 className="h-3 w-3" /> Finalizados
                </Chip>
                <Chip active={flStatus.has("abandono")} onClick={() => setFlStatus((s) => toggleInSet(s, "abandono"))}>
                  <XCircle className="h-3 w-3" /> Abandono
                </Chip>
              </FilterBlock>

              <FilterBlock label="Score / Grupo">
                {SCORE_GROUPS.map((g) => (
                  <Chip key={g.id} active={flScore.has(g.id)} onClick={() => setFlScore((s) => toggleInSet(s, g.id))}>
                    {g.label}
                  </Chip>
                ))}
              </FilterBlock>

              <FilterBlock label="Caixa (bolso)">
                {CAIXA_LETRAS.map((c) => (
                  <Chip key={c.letra} active={flCaixa.has(c.letra)} onClick={() => setFlCaixa((s) => toggleInSet(s, c.letra))}>
                    <span className="font-mono text-accent">{c.letra}</span>
                    <span className="opacity-70">{c.label}</span>
                  </Chip>
                ))}
              </FilterBlock>

              {utmOptions.length > 0 && (
                <FilterBlock label="Origem UTM">
                  {utmOptions.map((u) => (
                    <Chip key={u} active={flUtm.has(u)} onClick={() => setFlUtm((s) => toggleInSet(s, u))}>{u}</Chip>
                  ))}
                </FilterBlock>
              )}
            </div>
          </Card>
        </aside>

        {/* TABELA */}
        <div className="min-w-0 space-y-3">
          {/* Toolbar de busca */}
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <div className="p-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={flSearch}
                  onChange={(e) => setFlSearch(e.target.value)}
                  placeholder="Buscar por nome, e-mail ou WhatsApp…"
                  className="w-full h-10 pl-9 pr-9 rounded-lg bg-background/60 border border-border/60 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10 transition-all"
                />
                {flSearch && (
                  <button onClick={() => setFlSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border border-border/50 rounded-lg px-3 h-10">
                <Users className="h-3.5 w-3.5 text-accent" />
                {fmtInt(shown.length)} / {fmtInt(total)}
              </div>
            </div>
          </Card>

          {/* Tabela premium */}
          <Card className="border-border/50 bg-card/50 backdrop-blur overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80 bg-muted/20 border-b border-border/50">
                    <th className="px-5 py-3 font-semibold">Lead</th>
                    <th className="py-3 font-semibold">Contato</th>
                    <th className="py-3 font-semibold">Score</th>
                    <th className="py-3 font-semibold">Caixa</th>
                    <th className="py-3 font-semibold">Origem</th>
                    <th className="py-3 font-semibold">Data</th>
                    <th className="px-5 py-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <div className="h-12 w-12 rounded-full bg-muted/30 grid place-items-center">
                          <Search className="h-5 w-5 opacity-50" />
                        </div>
                        <div className="text-sm">Nenhum lead encontrado</div>
                        <div className="text-xs opacity-70">Ajuste os filtros para ver mais resultados</div>
                      </div>
                    </td></tr>
                  )}
                  {shown.map((l) => {
                    const fin = isFinalizado(l);
                    const letra = (l.caixa_letra ?? "").toUpperCase();
                    const scoreLabel = "DEFG".includes(letra) ? "Call agendada"
                      : "BC".includes(letra) ? "Análise equipe"
                      : letra === "A" ? "Minicurso" : "—";
                    const iniciais = (l.nome || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("");
                    return (
                      <tr key={l.id} className="border-b border-border/20 last:border-0 hover:bg-accent/[0.04] transition-colors group">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 shrink-0 rounded-full grid place-items-center text-[10px] font-bold ${
                              fin ? "bg-accent/20 text-accent" : "bg-muted/40 text-muted-foreground"
                            }`}>{iniciais || "?"}</div>
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[180px]">{l.nome || "Sem nome"}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">#{String(l.id).slice(0, 8)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground truncate max-w-[200px]">
                            <Mail className="h-3 w-3 shrink-0 opacity-60" />
                            <span className="truncate">{l.email || "—"}</span>
                          </div>
                          {l.whatsapp && (
                            <div className="flex items-center gap-1.5 text-muted-foreground/80 tabular-nums mt-0.5">
                              <Phone className="h-3 w-3 shrink-0 opacity-60" />
                              {l.whatsapp}
                            </div>
                          )}
                        </td>
                        <td className="py-3">
                          <span className="text-[10px] px-2 py-1 rounded-md bg-muted/40 text-muted-foreground whitespace-nowrap">
                            {scoreLabel}
                          </span>
                        </td>
                        <td className="py-3">
                          {letra ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/30 grid place-items-center text-[11px] font-mono font-bold text-accent">
                                {letra}
                              </div>
                              <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                                {CAIXA_LETRAS.find((c) => c.letra === letra)?.label ?? ""}
                              </span>
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="py-3 text-xs text-muted-foreground truncate max-w-[120px]">
                          {l.utm_source ? (
                            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary/80 text-[10px] font-medium">
                              {l.utm_source}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-3 text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 opacity-60" />
                            {new Date(l.data_criacao).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                            fin
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                              : "bg-muted/30 text-muted-foreground border border-border/40"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${fin ? "bg-emerald-400" : "bg-muted-foreground"}`} />
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
              <div className="p-4 border-t border-border/40 flex justify-center bg-gradient-to-b from-transparent to-accent/[0.02]">
                <Button variant="outline" size="sm" onClick={() => setListLimit((n) => n + 50)} className="gap-2">
                  Carregar mais <span className="text-muted-foreground">({fmtInt(total - shown.length)})</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 mb-2 font-semibold">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function MiniKpi({ icon: Icon, label, value, tone }: {
  icon: any; label: string; value: string; tone: "ok" | "mute" | "hot" | "accent";
}) {
  const toneClass = {
    ok: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    mute: "text-muted-foreground bg-muted/20 border-border/50",
    hot: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    accent: "text-accent bg-accent/10 border-accent/20",
  }[tone];
  return (
    <div className={`rounded-xl border px-3 py-2.5 min-w-[100px] ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider opacity-80 mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-lg font-black tabular-nums">{value}</div>
    </div>
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
  leads, agenda, vendas, htLeads, grupo, setGrupo,
}: {
  leads: QLead[]; agenda: any[]; reunioes: any[]; vendas: any[]; htLeads: any[];
  grupo: FunilGrupo; setGrupo: (g: FunilGrupo) => void;
}) {
  const normPhone = (s: any) => String(s ?? "").replace(/\D/g, "").slice(-11);

  const metricasPorGrupo = useMemo(() => {
    return FUNIL_GRUPOS.map((g) => {
      const set = new Set(g.letras);
      const doGrupo = leads.filter((l) => set.has((l.caixa_letra ?? "").toUpperCase()));
      const finalizados = doGrupo.length;
      const phones = new Set(doGrupo.map((l) => normPhone(l.whatsapp)).filter(Boolean));

      // Agendados: qualquer sinal de agendamento (crm, ht_leads.data_agendamento, agenda_leads)
      const agendadosPhones = new Set<string>();
      for (const l of doGrupo) {
        if (l.crm_data_agendamento || STATUS_AGENDADO.includes(norm(l.crm_status))) {
          const p = normPhone(l.whatsapp);
          if (p) agendadosPhones.add(p);
        }
      }
      for (const a of agenda) {
        const p = normPhone(a.lead_telefone);
        if (p && phones.has(p)) agendadosPhones.add(p);
      }
      for (const l of htLeads) {
        const p = normPhone(l.telefone);
        if (p && phones.has(p) && l.data_agendamento) agendadosPhones.add(p);
      }

      // Calls realizadas
      const realizadasPhones = new Set<string>();
      for (const l of doGrupo) {
        if (STATUS_CALL_FEITA.includes(norm(l.crm_status))) {
          const p = normPhone(l.whatsapp);
          if (p) realizadasPhones.add(p);
        }
      }
      for (const a of agenda) {
        const p = normPhone(a.lead_telefone);
        if (p && phones.has(p) && a.concluido) realizadasPhones.add(p);
      }
      for (const l of htLeads) {
        const p = normPhone(l.telefone);
        if (p && phones.has(p) && ["followup", "fechado"].includes(String(l.status ?? "").toLowerCase())) {
          realizadasPhones.add(p);
        }
      }

      // Fechamentos
      const fechamentosPhones = new Set<string>();
      for (const l of doGrupo) {
        if (STATUS_FECHADO.includes(norm(l.crm_status))) {
          const p = normPhone(l.whatsapp);
          if (p) fechamentosPhones.add(p);
        }
      }
      for (const l of htLeads) {
        const p = normPhone(l.telefone);
        if (p && phones.has(p) && String(l.status ?? "").toLowerCase() === "fechado") {
          fechamentosPhones.add(p);
        }
      }
      // ht_vendas: cliente costuma ser nome; ignoramos no fechamento por grupo (evita ruído)

      // No-show
      const noShowPhones = new Set<string>();
      for (const l of doGrupo) {
        if (STATUS_NOSHOW.includes(norm(l.crm_status))) {
          const p = normPhone(l.whatsapp);
          if (p) noShowPhones.add(p);
        }
      }

      const agendados = agendadosPhones.size;
      const realizadas = realizadasPhones.size;
      const fechamentos = fechamentosPhones.size;
      const noShow = noShowPhones.size;
      const naoFechou = Math.max(0, realizadas - fechamentos);

      const taxaAgend = finalizados > 0 ? (agendados / finalizados) * 100 : 0;
      const showUp = agendados > 0 ? (realizadas / agendados) * 100 : 0;
      const taxaFech = realizadas > 0 ? (fechamentos / realizadas) * 100 : 0;
      const taxaNoShow = agendados > 0 ? (noShow / agendados) * 100 : 0;

      return { g, finalizados, agendados, realizadas, fechamentos, noShow, naoFechou,
        taxaAgend, showUp, taxaFech, taxaNoShow };
    });
  }, [leads, agenda, htLeads, vendas]);


  const atual = metricasPorGrupo.find((m) => m.g.id === grupo)!;

  return (
    <section>
      <SectionTitle overline="Bloco 04" title="Métricas do Funil" />
      <Card className="border-border/50 bg-card/50 backdrop-blur overflow-hidden">
        <CardContent className="p-6">
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            {/* Coluna esquerda: seletor de grupos + perdas */}
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

              <div className="pt-4 mt-4 border-t border-border/40 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Perdas do funil</div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="h-3 w-3 text-red-400" />
                    <span className="text-[10px] uppercase tracking-wider text-red-400 font-semibold">No-show</span>
                  </div>
                  <div className="text-2xl font-mono tabular-nums font-bold text-red-400">{fmtInt(atual.noShow)}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtPct(atual.taxaNoShow)} dos agendados</div>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-3 w-3 text-amber-400" />
                    <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">Call · não fechou</span>
                  </div>
                  <div className="text-2xl font-mono tabular-nums font-bold text-amber-400">{fmtInt(atual.naoFechou)}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {atual.realizadas > 0 ? fmtPct((atual.naoFechou / atual.realizadas) * 100) : "0,0%"} das calls
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna central: funil visual (cone) — grande */}
            <div className="flex items-center justify-center min-h-[620px]">
              <FunilVisual
                stages={[
                  { label: "Formulários Finalizados", value: atual.finalizados, sub: `${atual.g.label} · ${atual.g.sub}`, prev: null },
                  { label: "Agendados p/ Call", value: atual.agendados, sub: `Taxa de agendamento: ${fmtPct(atual.taxaAgend)}`, prev: atual.finalizados },
                  { label: "Calls Realizadas", value: atual.realizadas, sub: `Show-up: ${fmtPct(atual.showUp)}`, prev: atual.agendados },
                  { label: "Fechamentos (Ganhos)", value: atual.fechamentos, sub: `Conversão da call: ${fmtPct(atual.taxaFech)}`, prev: atual.realizadas },
                ]}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// Cone SVG — grande, dados destacados + conversão entre estágios
function FunilVisual({ stages }: {
  stages: { label: string; value: number; sub: string; prev: number | null }[];
}) {
  const W = 780;
  const H = 620;
  const topW = 760;
  const botW = 160;
  const bandH = H / stages.length;
  const widthAt = (y: number) => topW - ((topW - botW) * (y / H));

  const COLORS = [
    { fill: "#3B82F6", stroke: "#60A5FA" },
    { fill: "#F59E0B", stroke: "#FBBF24" },
    { fill: "#8B5CF6", stroke: "#A78BFA" },
    { fill: "#10B981", stroke: "#34D399" },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full max-w-[820px]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {COLORS.map((c, i) => (
          <linearGradient key={i} id={`fg${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.stroke} stopOpacity="0.95" />
            <stop offset="100%" stopColor={c.fill} stopOpacity="1" />
          </linearGradient>
        ))}
        <filter id="funilShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" />
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
        const conv = s.prev && s.prev > 0 ? (s.value / s.prev) * 100 : null;

        return (
          <g key={s.label}>
            {i === 0 && (
              <ellipse cx={cx} cy={y1 + 4} rx={w1 / 2} ry={10}
                fill="rgba(0,0,0,0.25)" filter="url(#funilShadow)" />
            )}
            <path d={path} fill={`url(#fg${i})`} stroke={COLORS[i].stroke} strokeWidth="1.5" opacity="0.96" />
            <ellipse cx={cx} cy={y1 + 8} rx={(w1 / 2) - 6} ry={5} fill="rgba(255,255,255,0.18)" />

            <text x={cx} y={cy - 34} textAnchor="middle"
              fontSize="14" fontWeight="700" fill="#fff" style={{ letterSpacing: 1 }}>
              {s.label.toUpperCase()}
            </text>

            <text x={cx} y={cy + 12} textAnchor="middle"
              fontSize="52" fontWeight="900" fill="#fff"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", letterSpacing: -1 }}>
              {fmtInt(s.value)}
            </text>

            <text x={cx} y={cy + 34} textAnchor="middle"
              fontSize="12" fill="rgba(255,255,255,0.92)" fontWeight="500">
              {s.sub}
            </text>

            {conv !== null && (
              <g>
                <rect x={W - 140} y={y1 - 14} width="130" height="28" rx="14"
                  fill="rgba(15,23,42,0.9)" stroke={COLORS[i].stroke} strokeWidth="1" />
                <text x={W - 75} y={y1 + 5} textAnchor="middle"
                  fontSize="12" fontWeight="700" fill={COLORS[i].stroke}>
                  ↓ {fmtPct(conv)}
                </text>
              </g>
            )}
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
  { id: "novos", label: "Novos Leads" },
  { id: "c1", label: "1º Contato" },
  { id: "c2", label: "2º Contato" },
  { id: "c3", label: "3º Contato" },
  { id: "convite", label: "Convite do Grupo" },
  { id: "no_grupo", label: "1-3k no Grupo" },
  { id: "agendado", label: "Agendado", accent: "text-emerald-400" },
  { id: "no_show", label: "No-show", accent: "text-red-400" },
  { id: "descartado", label: "Descartado", accent: "text-muted-foreground" },
  { id: "fake", label: "Lead Fake", accent: "text-fuchsia-400" },

];

// Todos os estados abaixo agora vêm da tabela ht_kanban_state (compartilhada
// entre SDR e Closer). ensureHtKanbanState() faz um único fetch + realtime.

function useKanbanCacheReady(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    ensureHtKanbanState().then(() => { if (alive) setTick((t) => t + 1); });
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("ht-sdr-updated", bump);
    window.addEventListener("ht-fake-updated", bump);
    window.addEventListener("ht-sched-updated", bump);
    window.addEventListener("ht-closer-email-updated", bump);
    window.addEventListener("ht-closer-updated", bump);
    return () => {
      alive = false;
      window.removeEventListener("ht-sdr-updated", bump);
      window.removeEventListener("ht-fake-updated", bump);
      window.removeEventListener("ht-sched-updated", bump);
      window.removeEventListener("ht-closer-email-updated", bump);
      window.removeEventListener("ht-closer-updated", bump);
    };
  }, []);
  return tick;
}

function useSdrStageMap(): Record<string, string> {
  const tick = useKanbanCacheReady();
  return useMemo(() => snapshotSdrStages(), [tick]);
}

function useFakeSet(): [Set<string>, (leadId: string, fake: boolean) => void] {
  const tick = useKanbanCacheReady();
  const set = useMemo(() => snapshotFakeSet(), [tick]);
  const toggle = (leadId: string, fake: boolean) => dbSetFake(leadId, fake);
  return [set, toggle];
}

function useSchedMap(): [Record<string, string>, (leadId: string, iso: string | null) => void] {
  const tick = useKanbanCacheReady();
  const map = useMemo(() => snapshotSched(), [tick]);
  const set = (leadId: string, iso: string | null) => dbSetScheduled(leadId, iso);
  return [map, set];
}

function useCloserEmailMap(): [Record<string, string>, (leadId: string, email: string | null) => void] {
  const tick = useKanbanCacheReady();
  const map = useMemo(() => snapshotCloserEmail(), [tick]);
  const set = (leadId: string, email: string | null) => dbSetCloserEmail(leadId, email);
  return [map, set];
}


type ClosersOption = { id: string | number; nome: string; email: string | null };
function useClosersList(): ClosersOption[] {
  const [list, setList] = useState<ClosersOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    supabase.from("ht_team")
      .select("id, nome, email, tipo, ativo")
      .eq("tipo", "closer")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        if (cancelled) return;
        setList((data ?? []).map((r: any) => ({ id: r.id, nome: r.nome, email: r.email ?? null })));
      });
    return () => { cancelled = true; };
  }, []);
  return list;
}






function KanbanSDR({ leads, loading, onReload, notesMap }: { leads: QLead[]; loading: boolean; onReload?: () => void; notesMap: Record<string, { body: string; author: string | null; role: string }> }) {
  const scheduleCall = useServerFn(createEvent);
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const [caixaFilter, setCaixaFilter] = useState<string>("all"); // all | B | C | D | E | F | G
  const [utmFilter, setUtmFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [onlyFinalizados, setOnlyFinalizados] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<QLead | null>(null);
  const [fakeSet, setFake] = useFakeSet();
  const [schedMap, setSched] = useSchedMap();
  const [closerEmailMap, setCloserEmail] = useCloserEmailMap();
  const closersList = useClosersList();
  const [addOpen, setAddOpen] = useState(false);







  const igUsernames = useMemo(
    () => (leads || []).map((l) => l.instagram || "").filter(Boolean),
    [leads],
  );
  const igMap = useIgProfileMap(igUsernames);

  const sdrCacheTick = useKanbanCacheReady();
  useEffect(() => { setStageMap(snapshotSdrStages()); }, [sdrCacheTick]);

  const utmOptions = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) if (l.utm_source) s.add(l.utm_source);
    return Array.from(s).sort();
  }, [leads]);

  const eligible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      const c = (l.caixa_letra ?? "").toUpperCase();
      if (!q) {
        if (!"BCDEFG".includes(c)) return false;
        if (caixaFilter !== "all" && c !== caixaFilter) return false;
      } else if (caixaFilter !== "all" && c !== caixaFilter) {
        return false;
      }
      if (utmFilter !== "all" && (l.utm_source ?? "") !== utmFilter) return false;
      if (onlyFinalizados && !isFinalizado(l)) return false;
      if (q) {
        const hay = `${l.nome ?? ""} ${l.email ?? ""} ${l.whatsapp ?? ""} ${l.instagram ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, caixaFilter, utmFilter, search, onlyFinalizados]);


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
      const st = fakeSet.has(l.id)
        ? "fake"
        : (schedMap[l.id] ? "agendado" : (stageMap[l.id] || mapCrm(l.crm_status)));
      (m[st] || m.novos).push(l);
    }
    for (const s of KANBAN_STAGES) {
      m[s.id].sort((a, b) => String(b.data_criacao).localeCompare(String(a.data_criacao)));
    }

    return m;
  }, [eligible, stageMap, fakeSet, schedMap]);

  function moveTo(leadId: string, stage: string) {
    setFake(leadId, stage === "fake");
    dbSetSdrStage(leadId, stage);
    setStageMap((prev) => ({ ...prev, [leadId]: stage }));
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
              {([
                ["B","R$ 1k–5k"],
                ["C","R$ 5k–10k"],
                ["D","R$ 10k–30k"],
                ["E","R$ 30k–50k"],
                ["F","R$ 50k–100k"],
                ["G","R$ 100k+"],
              ] as const).map(([c, label]) => (
                <SelectItem key={c} value={c}>{label}</SelectItem>
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
          <button
            type="button"
            onClick={() => setOnlyFinalizados((v) => !v)}
            className={`h-9 px-3 rounded-md border text-xs font-semibold transition ${onlyFinalizados ? "bg-accent/20 border-accent/60 text-accent" : "bg-card/60 border-border/60 text-muted-foreground hover:text-foreground"}`}
            title="Mostrar apenas leads que finalizaram o quiz"
          >
            {onlyFinalizados ? "✓ Só finalizados" : "Só finalizados"}
          </button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-9 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Adicionar Lead
          </Button>
        </div>
      </div>

      <DragScroll className="flex gap-3 overflow-x-auto pb-4 -mx-6 md:-mx-10 px-6 md:px-10 cursor-grab active:cursor-grabbing select-none">

        {KANBAN_STAGES.map((s) => (
          <div key={s.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/x-lead-id");
              if (id) moveTo(id, s.id);
              setDraggingId(null);
            }}
            className={`shrink-0 w-72 rounded-xl border border-border/50 bg-card/40 backdrop-blur flex flex-col max-h-[70vh] ${s.id === "fake" ? "opacity-40 grayscale" : ""}`}>

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
                <KanbanLeadCard
                  key={l.id}
                  lead={l}
                  ig={igMap.get((l.instagram || "").toLowerCase().replace(/^@/, "").replace(/\/+$/, ""))}
                  scheduledAt={schedMap[l.id] ?? null}
                  lastNote={notesMap[l.id]}
                  dragging={draggingId === l.id}

                  onClick={() => setSelectedLead(l)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/x-lead-id", l.id);
                    setDraggingId(l.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  footer={
                    <select
                      value={stageMap[l.id] || "novos"}
                      onChange={(e) => moveTo(l.id, e.target.value)}
                      className="w-full text-[10px] h-6 px-1 rounded bg-card/60 border border-border/50 focus:outline-none focus:border-accent/60"
                    >
                      {KANBAN_STAGES.map((ks) => (
                        <option key={ks.id} value={ks.id}>{ks.label}</option>
                      ))}
                    </select>
                  }
                />
              ))}
              {byStage[s.id].length > 50 && (
                <div className="text-[10px] text-center text-muted-foreground py-2">
                  + {byStage[s.id].length - 50} leads ocultos
                </div>
              )}
            </div>
          </div>
        ))}
      </DragScroll>
      <HtLeadDetailDialog
        lead={selectedLead}
        role="sdr"
        open={!!selectedLead}
        onOpenChange={(v) => { if (!v) { setSelectedLead(null); onReload?.(); } }}
        scheduledAt={selectedLead ? (schedMap[selectedLead.id] ?? null) : null}
        closers={closersList}
        closerEmail={selectedLead ? (closerEmailMap[selectedLead.id] ?? null) : null}
        onSchedule={async (iso, email) => {
          if (!selectedLead) return;
          if (iso) {
            try {
              const start = new Date(iso);
              const end = new Date(start.getTime() + 60 * 60 * 1000);
              const closerObj = email ? closersList.find((c) => c.email === email || c.nome === email) : null;
              const closerInfo = closerObj ? `Closer: ${closerObj.nome} (${closerObj.email || "Sem e-mail"})` : "";
              await scheduleCall({
                data: {
                  summary: `Call - ${selectedLead.nome || "Lead"}`,
                  description: `Agendado pelo SDR\n\n${closerInfo}`,
                  start: start.toISOString(),
                  end: end.toISOString(),
                  attendees: email ? [email] : []
                }
              });
              toast.success("Call agendada no Google Calendar!");
            } catch (err: any) {
              toast.error("Erro GCal: " + err.message);
            }
          }
          dbSetScheduleAndCloser(selectedLead.id, iso, email ?? null);
          if (iso) {
            moveTo(selectedLead.id, "agendado");
            setSelectedLead(null);
          }
        }}
      />
      <AddSDRLeadDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => { setAddOpen(false); onReload?.(); }} />

    </div>
  );
}

function AddSDRLeadDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [caixa, setCaixa] = useState<string>("B");
  const [faturamento, setFaturamento] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [utmSource, setUtmSource] = useState("manual");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setNome(""); setEmail(""); setWhatsapp(""); setInstagram("");
      setCaixa("B"); setFaturamento(""); setObjetivo(""); setUtmSource("manual");
    }
  }, [open]);

  const caixaLabelMap: Record<string, string> = {
    B: "R$ 1k–5k", C: "R$ 5k–10k", D: "R$ 10k–30k",
    E: "R$ 30k–50k", F: "R$ 50k–100k", G: "R$ 100k+",
  };

  async function handleSave() {
    console.log("[AddSDRLeadDialog] handleSave acionado", { nome, whatsapp, email, instagram, caixa, faturamento, objetivo, utmSource });
    if (!nome.trim() && !whatsapp.trim() && !email.trim()) {
      console.warn("[AddSDRLeadDialog] validação de campos obrigatórios falhou. Nome, WhatsApp e E-mail estão vazios.");
      toast.error("Preencha ao menos nome, whatsapp ou email");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: crypto.randomUUID(),
        nome: nome.trim() || null,
        email: email.trim() || null,
        whatsapp: whatsapp.trim() || null,
        instagram: instagram.trim() || null,
        caixa_letra: caixa,
        caixa_label: caixaLabelMap[caixa] ?? null,
        faturamento: faturamento.trim() || null,
        objetivo: objetivo.trim() || null,
        comprometimento: "Alto (manual)",
        momento: "manual",
        utm_source: utmSource.trim() || "manual",
        utm_medium: "sdr-manual",
        data_criacao: new Date().toISOString(),
        crm_status: "novos",
      };
      console.log("[AddSDRLeadDialog] disparando insert no Quiz Supabase (tabela leads) com payload:", payload);
      const { data: res, error } = await quizSb
        .from("leads")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      console.log("[AddSDRLeadDialog] resposta do insert no Quiz Supabase:", res);
      toast.success("Lead adicionado ao Kanban SDR");
      onCreated();
    } catch (e: any) {
      console.error("[AddSDRLeadDialog] falha ao salvar lead manual no Quiz Supabase:", e);
      toast.error(e?.message ?? "Erro ao salvar lead");
    } finally {
      setSaving(false);
    }
  }

  const isFormInvalid = !nome.trim() && !whatsapp.trim() && !email.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar Lead Manualmente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5511999999999" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Instagram</Label>
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Caixa disponível</Label>
              <Select value={caixa} onValueChange={setCaixa}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(caixaLabelMap).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>UTM Source</Label>
              <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="manual" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Faturamento atual</Label>
            <Input value={faturamento} onChange={(e) => setFaturamento(e.target.value)} placeholder="Ex: R$ 10k/mês" />
          </div>
          <div className="space-y-1.5">
            <Label>Meta / Objetivo</Label>
            <Input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ex: R$ 50k/mês em 6 meses" />
          </div>
          {isFormInvalid && (
            <p className="text-[11px] text-red-400 font-medium bg-red-500/10 border border-red-500/20 rounded-md p-2 mt-2">
              ⚠️ Preencha ao menos Nome, WhatsApp ou E-mail para poder salvar.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { console.log('[AddSDRLeadDialog] cancelado'); onOpenChange(false); }} disabled={saving}>Cancelar</Button>
          <Button onClick={() => { console.log('[AddSDRLeadDialog] clicado em salvar'); handleSave(); }} disabled={saving || isFormInvalid}>
            {saving ? "Salvando…" : "Adicionar Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  { id: "fake", label: "Lead Fake", accent: "text-fuchsia-400" },

];

// (closer stage map agora vem do cache compartilhado — snapshotCloserStages)


type CloserCard = {
  id: string; nome: string; valor: number; created_at: string;
  closer?: string | null; source: "lead" | "venda"; defaultStage: string;
  caixa?: string | null; utm?: string | null;
  lead?: QLead | null;
};

// Valor estimado do sinal/ticket a partir da caixa do quiz
const CAIXA_VALOR: Record<string, number> = {
  D: 3000, E: 5000, F: 8000, G: 15000,
};

function KanbanCloser({ leads, vendas, loading, onReload, notesMap }: { leads: QLead[]; vendas: any[]; loading: boolean; onReload?: () => void; notesMap: Record<string, { body: string; author: string | null; role: string }> }) {
  const scheduleCall = useServerFn(createEvent);
  const htSession = useMemo(() => getHtTeamSession(), []);
  const isCloserSession = htSession?.tipo === "closer";
  const vendasScoped = useMemo(
    () => (isCloserSession ? (vendas || []).filter((v) => matchesHtCloser(htSession, { nome: v.closer })) : vendas),
    [vendas, htSession, isCloserSession],
  );
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const [closerFilter, setCloserFilter] = useState<string>(isCloserSession ? (htSession?.nome ?? "all") : "all");
  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<QLead | null>(null);
  const [fakeSet, setFake] = useFakeSet();
  const [schedMap, setSched] = useSchedMap();
  const [closerEmailMap, setCloserEmail] = useCloserEmailMap();
  const closersList = useClosersList();
  const sdrStageMap = useSdrStageMap();






  const igUsernames = useMemo(
    () => (leads || []).map((l) => l.instagram || "").filter(Boolean),
    [leads],
  );
  const igMap = useIgProfileMap(igUsernames);

  const closerCacheTick = useKanbanCacheReady();
  useEffect(() => { setStageMap(snapshotCloserStages()); }, [closerCacheTick]);

  // Mesma lógica de resolução de stage do SDR — fonte da verdade
  const mapCrmSdr = (s: string | null | undefined): string => {
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
  const sdrStageOf = (l: QLead): string => {
    if (fakeSet.has(l.id)) return "fake";
    if (schedMap[l.id]) return "agendado";
    return sdrStageMap[l.id] || mapCrmSdr(l.crm_status);
  };
  // Traduz stage do SDR → coluna padrão do closer. null = não aparece no closer.
  const sdrToCloser = (s: string): string | null => {
    switch (s) {
      case "agendado": return "agendado";
      case "fechado": return "fechado";
      case "descartado": return "descartado";
      case "no_show": return "descartado";
      case "fake": return "fake";
      default: return null; // novos, c2, no_grupo, convite — não são responsabilidade do closer
    }
  };

  const cards: CloserCard[] = useMemo(() => {
    const list: CloserCard[] = [];
    const q = (search || "").trim().toLowerCase();
    const matchesSearch = (l: any) => {
      if (!q) return false;
      const hay = `${l?.nome ?? ""} ${l?.whatsapp ?? ""} ${l?.email ?? ""} ${l?.instagram ?? ""}`.toLowerCase();
      return hay.includes(q);
    };
    for (const l of leads || []) {
      const caixa = (l.caixa_letra ?? "").toUpperCase();
      const sdr = sdrStageOf(l);
      const def = sdrToCloser(sdr);
      const cardId = `qlead-${l.id}`;
      const finalizado = isFinalizado(l);
      const isScheduled = sdr === "agendado";
      const inPipeline = (finalizado && "DEFG".includes(caixa) && (def || stageMap[cardId])) || isScheduled;
      const bySearch = matchesSearch(l);
      if (!inPipeline && !bySearch) continue;
      const closerEmail = closerEmailMap[l.id];
      const closerName = closerEmail 
        ? closersList.find((c) => c.email === closerEmail)?.nome || closerEmail
        : null;

      list.push({
        id: cardId,
        nome: l.nome || l.whatsapp || "Sem nome",
        valor: Number(l.crm_valor || CAIXA_VALOR[caixa] || 0),
        created_at: l.crm_data_agendamento || l.data_criacao,
        closer: closerName,
        source: "lead",
        defaultStage: def ?? "agendado",
        caixa: l.caixa_label,
        utm: l.utm_source,
        lead: l,
      });
    }
    for (const v of vendasScoped || []) {
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
  }, [leads, vendasScoped, fakeSet, schedMap, sdrStageMap, stageMap, search, closerEmailMap, closersList]);

  const closerOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) if (c.closer) s.add(c.closer);
    return Array.from(s).sort();
  }, [cards]);

  const filtered = useMemo(() => cards.filter((c) => {
    if (isCloserSession) {
      if (!matchesHtCloser(htSession, c.closer)) return false;
    } else {
      if (closerFilter !== "all" && c.closer !== closerFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const l: any = (c as any).lead || {};
      const hay = `${c.nome} ${c.closer ?? ""} ${l.whatsapp ?? ""} ${l.email ?? ""} ${l.instagram ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [cards, closerFilter, search]);

  const byStage = useMemo(() => {
    const m: Record<string, CloserCard[]> = {};
    for (const s of CLOSER_STAGES) m[s.id] = [];
    for (const c of filtered) {
      // defaultStage já reflete o SDR. stageMap só sobrescreve para colunas
      // exclusivas do closer (followup, remarcada, sinal, fechado manual).
      const st = stageMap[c.id] || c.defaultStage;
      (m[st] || m.agendado).push(c);
    }
    for (const s of CLOSER_STAGES) {
      m[s.id].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    }
    return m;
  }, [filtered, stageMap]);



  function moveTo(id: string, stage: string) {
    const card = filtered.find((c) => c.id === id);
    const quizId = card?.lead?.id;
    if (quizId) {
      setFake(quizId, stage === "fake");
      if (stage === "descartado" || stage === "no_show") {
        dbSetSdrStage(quizId, stage);
      }
    }
    dbSetCloserStage(id, stage);
    setStageMap((prev) => ({ ...prev, [id]: stage }));
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

      <DragScroll className="flex gap-3 overflow-x-auto pb-4 -mx-6 md:-mx-10 px-6 md:px-10 cursor-grab active:cursor-grabbing select-none">
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
              className={`shrink-0 w-72 rounded-xl border border-border/50 bg-card/40 backdrop-blur flex flex-col max-h-[70vh] ${s.id === "fake" ? "opacity-40 grayscale" : ""}`}>
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
                {items.slice(0, 60).map((c) => {
                  const leadObj = c.lead ?? {
                    id: c.id,
                    nome: c.nome,
                    caixa_label: c.caixa ?? null,
                    utm_source: c.utm ?? null,
                    data_criacao: c.created_at,
                  };
                  const handle = (c.lead?.instagram || "").toLowerCase().replace(/^@/, "").replace(/\/+$/, "");
                  return (
                    <KanbanLeadCard
                      key={c.id}
                      lead={leadObj as any}
                      ig={handle ? igMap.get(handle) : undefined}
                      scheduledAt={c.lead ? (schedMap[c.lead.id] ?? null) : null}
                      lastNote={c.lead ? notesMap[c.lead.id] : null}
                      dragging={draggingId === c.id}

                      onClick={c.lead ? () => setSelectedLead(c.lead!) : undefined}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-closer-id", c.id);
                        setDraggingId(c.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      footer={
                        <div className="space-y-1.5">
                          {c.valor > 0 && (
                            <div className="text-[11px] font-mono tabular-nums text-emerald-400">{fmtBRL(c.valor)}</div>
                          )}
                          {c.closer && (
                            <div className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 truncate inline-block">
                              {c.closer}
                            </div>
                          )}
                          <select
                            value={stageMap[c.id] || c.defaultStage}
                            onChange={(e) => moveTo(c.id, e.target.value)}
                            className="w-full text-[10px] h-6 px-1 rounded bg-card/60 border border-border/50 focus:outline-none focus:border-accent/60"
                          >
                            {CLOSER_STAGES.map((ks) => (
                              <option key={ks.id} value={ks.id}>{ks.label}</option>
                            ))}
                          </select>
                        </div>
                      }
                    />
                  );
                })}
                {items.length > 60 && (
                  <div className="text-[10px] text-center text-muted-foreground py-2">
                    + {items.length - 60} ocultos
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </DragScroll>
      <HtLeadDetailDialog
        lead={selectedLead}
        role="closer"
        open={!!selectedLead}
        onOpenChange={(v) => { if (!v) { setSelectedLead(null); onReload?.(); } }}
        scheduledAt={selectedLead ? (schedMap[selectedLead.id] ?? null) : null}
        closers={closersList}
        closerEmail={selectedLead ? (closerEmailMap[selectedLead.id] ?? null) : null}
        onSchedule={async (iso, email) => {
          if (!selectedLead) return;
          if (iso) {
            try {
              const start = new Date(iso);
              const end = new Date(start.getTime() + 60 * 60 * 1000);
              const closerObj = email ? closersList.find((c) => c.email === email || c.nome === email) : null;
              const closerInfo = closerObj ? `Closer: ${closerObj.nome} (${closerObj.email || "Sem e-mail"})` : "";
              await scheduleCall({
                data: {
                  summary: `Call - ${selectedLead.nome || "Lead"}`,
                  description: `Agendado pelo Closer\n\n${closerInfo}`,
                  start: start.toISOString(),
                  end: end.toISOString(),
                  attendees: email ? [email] : []
                }
              });
              toast.success("Call agendada no Google Calendar!");
            } catch (err: any) {
              toast.error("Erro GCal: " + err.message);
            }
          }
          dbSetScheduleAndCloser(selectedLead.id, iso, email ?? null);
          if (iso) {
            moveTo(`qlead-${selectedLead.id}`, "agendado");
            setSelectedLead(null);
          }
        }}
        onSaleSaved={onReload}
      />



    </div>
  );
}

interface SdrDashboardProps {
  leads: QLead[];
  notesMap: Record<string, { body: string; author: string | null; role: string }>;
  onReload?: () => void;
}

function SdrDashboard({ leads, notesMap, onReload }: SdrDashboardProps) {
  const session = getHtTeamSession();
  const sdrName = session?.nome || "SDR";

  const metrics = useMemo(() => {
    const sdrStages = snapshotSdrStages();
    const sched = snapshotSched();

    // Usa todos os leads qualificados e ativos no funil do SDR
    const myLeads = leads.filter((l) => isFinalizado(l));

    // Mapeia estágios
    const stageCounts: Record<string, number> = {
      novos: 0,
      c1: 0,
      c2: 0,
      convite: 0,
      agendado: 0,
      no_show: 0,
      descartado: 0,
    };

    // Mapeia crm_status do quiz DB → nossas colunas se não estiver cacheado
    const mapCrmSdr = (s: string | null | undefined): string => {
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

    let agendadosCount = 0;
    const upcomingCalls: any[] = [];

    for (const l of myLeads) {
      // Estágio no cache local do SDR
      const localStage = sdrStages[l.id];
      // Se agendado por data no banco do Kanban
      const isSched = !!sched[l.id];
      const stage = localStage || (isSched ? "agendado" : mapCrmSdr(l.crm_status));
      
      const normalizedStage = stageCounts[stage] !== undefined ? stage : "novos";
      stageCounts[normalizedStage] += 1;

      if (stage === "agendado") {
        agendadosCount += 1;
        upcomingCalls.push(l);
      }
    }

    // Ordenar próximas calls pela data de agendamento (mais recentes primeiro)
    upcomingCalls.sort((a, b) => {
      const dateA = sched[a.id] || a.crm_data_agendamento || "";
      const dateB = sched[b.id] || b.crm_data_agendamento || "";
      return dateB.localeCompare(dateA);
    });

    const totalTrabalhados = myLeads.length;
    const taxaAgendamento = totalTrabalhados > 0 ? (agendadosCount / totalTrabalhados) * 100 : 0;

    return {
      totalTrabalhados,
      stageCounts,
      agendadosCount,
      taxaAgendamento,
      upcomingCalls: upcomingCalls.slice(0, 10), // limita a 10
    };
  }, [leads, notesMap, sdrName]);

  const kpis = metrics;

  return (
    <div className="px-6 md:px-10 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu Painel SDR</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bem-vindo de volta, <span className="text-accent font-semibold">{sdrName}</span>. Acompanhe seus agendamentos e métricas abaixo.
        </p>
      </div>

      {/* KPI Cards */}
      <section>
        <SectionTitle overline="Métricas Pessoais" title="Resumo de Performance" />
        <div className="grid gap-4 md:grid-cols-3">
          <Kpi accent icon={<Users className="h-4 w-4" />} label="Total de Leads no Funil"
            value={fmtInt(kpis.totalTrabalhados)} sub="Leads qualificados e ativos" />
          <Kpi icon={<Calendar className="h-4 w-4" />} label="Total de Calls Agendadas"
            value={fmtInt(kpis.agendadosCount)} sub="Reuniões marcadas com closers" />
          <Kpi icon={<Target className="h-4 w-4" />} label="Taxa de Agendamento"
            value={`${kpis.taxaAgendamento.toFixed(1)}%`} sub="Conversão de leads em reunião" />
        </div>
      </section>

      {/* Funil de Contatos */}
      <section className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Distribuição do Meu Funil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { id: "novos", label: "Novos Leads", count: kpis.stageCounts.novos, color: "bg-muted-foreground/30" },
              { id: "c1", label: "Contato 1 (WhatsApp/Insta)", count: kpis.stageCounts.c1, color: "bg-blue-400" },
              { id: "c2", label: "Contato 2 (Follow-up)", count: kpis.stageCounts.c2, color: "bg-sky-400" },
              { id: "convite", label: "Convite para Call", count: kpis.stageCounts.convite, color: "bg-amber-400" },
              { id: "agendado", label: "Agendado (Reunião)", count: kpis.stageCounts.agendado, color: "bg-emerald-400" },
              { id: "no_show", label: "No Show / Perdeu Call", count: kpis.stageCounts.no_show, color: "bg-red-400" },
              { id: "descartado", label: "Leads Descartados", count: kpis.stageCounts.descartado, color: "bg-muted-foreground/55" },
            ].map((item) => {
              const pct = kpis.totalTrabalhados > 0 ? (item.count / kpis.totalTrabalhados) * 100 : 0;
              return (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{item.label}</span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {item.count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-border/20 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Próximas Calls do SDR */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Últimos Agendamentos Efetuados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/30 max-h-[380px] overflow-y-auto pr-1">
              {kpis.upcomingCalls.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-8">
                  Nenhuma call agendada por você nos registros.
                </div>
              ) : (
                kpis.upcomingCalls.map((l) => {
                  const dateVal = snapshotSched()[l.id] || l.crm_data_agendamento;
                  const formattedDate = dateVal ? new Date(dateVal).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  }) : "Data não definida";
                  return (
                    <div key={l.id} className="p-3 flex items-center justify-between hover:bg-muted/10 transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{l.nome || "Lead Sem Nome"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{l.whatsapp || l.email || "@" + (l.instagram || "")}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5 font-mono">
                          {formattedDate}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function FacebookAdsAnalyticsSection({
  leads,
  vendas,
  period,
}: {
  leads: QLead[];
  vendas: any[];
  period: Period;
}) {
  const listCampaignsFn = useServerFn(listCampaigns);
  const datePreset = useMemo(() => {
    if (period === "today") return "today";
    if (period === "yesterday") return "yesterday";
    if (period === "7d") return "last_7d";
    if (period === "15d") return "last_14d";
    if (period === "30d") return "last_30d";
    if (period === "mtd") return "this_month";
    return "maximum";
  }, [period]);

  const { data: campaigns, isLoading: loadingCampaigns } = useQuery({
    queryKey: ["ht-meta-campaigns", datePreset],
    queryFn: () => listCampaignsFn({ data: { datePreset } }),
  });

  const totalSpend = useMemo(() => {
    return (campaigns || []).reduce((acc: number, c: any) => acc + (c.insights?.spend || 0), 0);
  }, [campaigns]);

  const { start: pStart, end: pEnd } = useMemo(() => periodRange(period), [period]);

  const leadsFromAds = useMemo(() => {
    const isFromSocialAds = (l: any) => {
      const src = String(l.utm_source || l.utm_medium || "").toLowerCase();
      const med = String(l.utm_medium || "").toLowerCase();
      return (
        src.includes("facebook") ||
        src.includes("instagram") ||
        src.includes("fb") ||
        src.includes("ig") ||
        src.includes("meta") ||
        med.includes("cpc") ||
        med.includes("cpm") ||
        src.includes("ads")
      );
    };
    return leads.filter((l) => isFromSocialAds(l));
  }, [leads]);

  const finalizadosFromAds = useMemo(() => {
    return leadsFromAds.filter((l) => isFinalizado(l));
  }, [leadsFromAds]);

  const showupsFromAds = useMemo(() => {
    return leadsFromAds.filter((l) => {
      const status = String(l.crm_status || "").toLowerCase();
      return !!l.crm_data_agendamento && (
        status.includes("followup") ||
        status.includes("remarcad") ||
        status.includes("sinal") ||
        status.includes("fechado") ||
        status.includes("ganho")
      );
    });
  }, [leadsFromAds]);

  const cplFinalizado = totalSpend > 0 && finalizadosFromAds.length > 0 ? totalSpend / finalizadosFromAds.length : 0;
  const cpaShowup = totalSpend > 0 && showupsFromAds.length > 0 ? totalSpend / showupsFromAds.length : 0;

  const salesFromAds = useMemo(() => {
    return (vendas || []).filter((v: any) => {
      if (pStart && new Date(v.data) < pStart) return false;
      if (pEnd && new Date(v.data) >= pEnd) return false;

      const l = leads.find(
        (lead) =>
          String(lead.id) === String(v.lead_id) ||
          String(lead.email).toLowerCase() === String(v.cliente).toLowerCase()
      );
      const isFromSocialAds = (x: any) => {
        const src = String(x.utm_source || x.utm_medium || "").toLowerCase();
        const med = String(x.utm_medium || "").toLowerCase();
        return (
          src.includes("facebook") ||
          src.includes("instagram") ||
          src.includes("fb") ||
          src.includes("ig") ||
          src.includes("meta") ||
          med.includes("cpc") ||
          med.includes("cpm") ||
          src.includes("ads")
        );
      };
      return l ? isFromSocialAds(l) : false;
    });
  }, [leads, vendas, period, pStart, pEnd]);

  const adsFaturamento = useMemo(() => {
    return salesFromAds.reduce((acc: number, v: any) => acc + Number(v.valor_total || 0), 0);
  }, [salesFromAds]);

  const roas = totalSpend > 0 ? adsFaturamento / totalSpend : 0;
  const roi = totalSpend > 0 ? ((adsFaturamento - totalSpend) / totalSpend) * 100 : 0;

  const campaignsPerformance = useMemo(() => {
    return (campaigns || []).map((c: any) => {
      const campaignLeads = leadsFromAds.filter((l) => {
        const normName = (s: string) => s.toLowerCase().replace(/[\s\-_}{@()]+/g, "").trim();
        const campaignName = String(c.name).toLowerCase().trim();
        const campaignId = String(c.id).toLowerCase().trim();

        const utmCampaign = String(l.utm_campaign || "").toLowerCase().trim();
        const utmSource = String(l.utm_source || "").toLowerCase().trim();
        const utmContent = String(l.utm_content || "").toLowerCase().trim();

        if (!utmCampaign && !utmSource && !utmContent) return false;

        const matches = (u: string) => u && (
          normName(campaignName).includes(normName(u)) ||
          normName(u).includes(normName(campaignName)) ||
          campaignId === u
        );

        return matches(utmCampaign) || matches(utmSource) || matches(utmContent);
      });

      const campaignFinalizados = campaignLeads.filter((l) => isFinalizado(l)).length;
      const campaignShowups = campaignLeads.filter((l) => {
        const status = String(l.crm_status || "").toLowerCase();
        return !!l.crm_data_agendamento && (
          status.includes("followup") ||
          status.includes("remarcad") ||
          status.includes("sinal") ||
          status.includes("fechado") ||
          status.includes("ganho")
        );
      }).length;

      const salesForCampaign = salesFromAds.filter((v: any) => {
        const l = leads.find((lead) => String(lead.id) === String(v.lead_id));
        if (!l?.utm_campaign) return false;
        const normName = (s: string) => s.toLowerCase().replace(/[\s\-_}{@()]+/g, "").trim();
        const campaignName = String(c.name).toLowerCase().trim();
        const campaignId = String(c.id).toLowerCase().trim();
        const utmCampaign = String(l.utm_campaign).toLowerCase().trim();
        const isNameMatch = normName(campaignName).includes(normName(utmCampaign)) || normName(utmCampaign).includes(normName(campaignName));
        const isIdMatch = campaignId === utmCampaign;
        return isNameMatch || isIdMatch;
      });

      const faturamento = salesForCampaign.reduce((acc: number, v: any) => acc + Number(v.valor_total || 0), 0);
      const conversions = salesForCampaign.length;
      const spend = c.insights?.spend || 0;
      const campaignRoas = spend > 0 ? faturamento / spend : 0;

      const campaignCpl = campaignFinalizados > 0 ? spend / campaignFinalizados : 0;
      const campaignCps = campaignShowups > 0 ? spend / campaignShowups : 0;

      return {
        id: c.id,
        name: c.name,
        spend,
        finalizados: campaignFinalizados,
        cpl: campaignCpl,
        showups: campaignShowups,
        cps: campaignCps,
        faturamento,
        conversions,
        roas: campaignRoas,
        status: c.effectiveStatus,
      };
    }).sort((a: any, b: any) => b.spend - a.spend);
}, [campaigns, salesFromAds, leads]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Estatísticas de Facebook Ads (High Ticket)</h2>
        <p className="text-sm text-muted-foreground">ROI, ROAS e faturamento de vendas originadas de anúncios no Meta.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Kpi accent icon={<DollarSign className="h-4 w-4" />} label="Investimento (Ads)" value={fmtBRL(totalSpend)} sub="Gasto no período" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Faturamento (High Ticket)" value={fmtBRL(adsFaturamento)} sub={`${salesFromAds.length} vendas de anúncios`} />
        <Kpi icon={<Sparkles className="h-4 w-4" />} label="ROAS" value={`${roas.toFixed(2)}x`} sub="Retorno sobre o gasto" />
        <Kpi icon={<Target className="h-4 w-4" />} label="ROI de Anúncios" value={`${roi.toFixed(1)}%`} sub="Retorno do investimento" />
        <Kpi icon={<Zap className="h-4 w-4" />} label="CPA (Vendas)" value={salesFromAds.length > 0 ? fmtBRL(totalSpend / salesFromAds.length) : "—"} sub="Custo por Venda" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Users className="h-4 w-4 text-violet-400" />} label="Leads Finalizados" value={fmtInt(finalizadosFromAds.length)} sub="Preencheram Typebot" />
        <Kpi icon={<Zap className="h-4 w-4 text-emerald-400" />} label="CPL Finalizado" value={cplFinalizado > 0 ? fmtBRL(cplFinalizado) : "—"} sub="Custo por Lead completo" />
        <Kpi icon={<Activity className="h-4 w-4 text-amber-400" />} label="ShowUps (Call)" value={fmtInt(showupsFromAds.length)} sub="Compareceram à reunião" />
        <Kpi icon={<Target className="h-4 w-4 text-rose-400" />} label="Custo por ShowUp" value={cpaShowup > 0 ? fmtBRL(cpaShowup) : "—"} sub="Custo por Comparecimento" />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Tabela de Campanhas */}
        <Card className="col-span-2 border-border/50 bg-card/40 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-accent" />
              Desempenho por Campanha
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingCampaigns ? (
              <div className="p-8 text-center text-sm text-muted-foreground flex justify-center items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Carregando campanhas do Facebook Ads...
              </div>
            ) : campaignsPerformance.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma campanha de Meta Ads encontrada para o período.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/20 text-muted-foreground font-semibold">
                      <th className="px-4 py-3">Campanha</th>
                      <th className="px-4 py-3 text-right">Gasto</th>
                      <th className="px-4 py-3 text-right">Finalizados (CPL)</th>
                      <th className="px-4 py-3 text-right">ShowUps (CPS)</th>
                      <th className="px-4 py-3 text-right">Vendas (HT)</th>
                      <th className="px-4 py-3 text-right">Receita</th>
                      <th className="px-4 py-3 text-right">ROAS</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignsPerformance.map((c) => (
                      <tr key={c.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3.5 font-medium min-w-[150px] truncate max-w-[220px]" title={c.name}>{c.name}</td>
                        <td className="px-4 py-3.5 text-right font-mono font-medium">{fmtBRL(c.spend)}</td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          {c.finalizados} <span className="text-[10px] text-muted-foreground">({c.cpl > 0 ? fmtBRL(c.cpl) : "—"})</span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          {c.showups} <span className="text-[10px] text-muted-foreground">({c.cps > 0 ? fmtBRL(c.cps) : "—"})</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">{c.conversions}</td>
                        <td className="px-4 py-3.5 text-right font-mono font-medium text-emerald-400">{fmtBRL(c.faturamento)}</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-accent">{c.roas > 0 ? `${c.roas.toFixed(2)}x` : "—"}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-block h-2 w-2 rounded-full ${c.status === "ACTIVE" ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-zinc-500"}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Listagem das Vendas */}
        <Card className="col-span-1 border-border/50 bg-card/40 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-400" />
              Últimas Vendas de Ads
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[400px] overflow-y-auto">
            {salesFromAds.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma venda de anúncio no período.</div>
            ) : (
              <div className="divide-y divide-border/30">
                {salesFromAds.map((v) => {
                  const l = leads.find((lead) => String(lead.id) === String(v.lead_id));
                  return (
                    <div key={v.id} className="p-3.5 flex flex-col hover:bg-muted/10 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold">{v.cliente || "Cliente HT"}</p>
                          <p className="text-[10px] text-muted-foreground">Closer: {v.closer || "Closer"}</p>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-400">{fmtBRL(v.valor_total)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
                        <span className="font-mono bg-muted/40 px-1.5 py-0.5 rounded uppercase">{l?.utm_source || "ads"}</span>
                        <span>{new Date(v.data).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SalesFunnelView({
  leads,
  vendas,
  period,
}: {
  leads: QLead[];
  vendas: any[];
  period: Period;
}) {
  const [openLevel, setOpenLevel] = useState<number | null>(null);
  const { start: pStart, end: pEnd } = useMemo(() => periodRange(period), [period]);

  const periodVendas = useMemo(() => {
    return (vendas || []).filter((v: any) => {
      if (pStart && new Date(v.data) < pStart) return false;
      if (pEnd && new Date(v.data) >= pEnd) return false;
      return true;
    });
  }, [vendas, pStart, pEnd, period]);

  // 1. Topo: Entrada de Leads (Canais & Total)
  const topo = useMemo(() => {
    const total = leads.length;
    const channels: Record<string, number> = {};
    for (const l of leads) {
      const src = String(l.utm_source || (l as any).origem || "orgânico/direto").toLowerCase();
      let label = "Orgânico/Direto";
      if (src.includes("facebook") || src.includes("fb") || src.includes("meta")) label = "Meta Ads";
      else if (src.includes("instagram") || src.includes("ig")) label = "Instagram Ads";
      else if (src.includes("criar_saas")) label = "Criar SaaS";
      else if (src.includes("youtube") || src.includes("yt")) label = "YouTube";
      else if (src.includes("sdr")) label = "Prospecção Manual";
      channels[label] = (channels[label] || 0) + 1;
    }
    return { total, channels };
  }, [leads]);

  // 2. Nível 2: SDR Tratou (Ligados vs Não Ligados)
  const sdrAction = useMemo(() => {
    let ligados = 0;
    let naoLigados = 0;
    for (const l of leads) {
      const stage = String(l.crm_status || "").toLowerCase();
      if (!stage || stage === "novo" || stage === "new") {
        naoLigados++;
      } else {
        ligados++;
      }
    }
    return { ligados, naoLigados };
  }, [leads]);

  // 3. Nível 3: Qualificação (Qualificados para Call vs Não Qualificados)
  const qualification = useMemo(() => {
    let qualificados = 0;
    let naoQualificados = 0;
    for (const l of leads) {
      const c = (l.caixa_letra ?? "").toUpperCase();
      if ("BCDEFG".includes(c) || isQuente(l)) {
        qualificados++;
      } else {
        naoQualificados++;
      }
    }
    return { qualificados, naoQualificados };
  }, [leads]);

  // 4. Nível 4: Comparecimento (Compareceram vs No-Show)
  const attendance = useMemo(() => {
    let compareceram = 0;
    let noShow = 0;
    for (const l of leads) {
      const crmStatus = String(l.crm_status || "").toLowerCase();
      const hasSched = !!(l.crm_data_agendamento || crmStatus.includes("agendado"));
      if (hasSched) {
        if (crmStatus.includes("noshow")) {
          noShow++;
        } else if (
          crmStatus.includes("fechado") ||
          crmStatus.includes("ganho") ||
          crmStatus.includes("followup") ||
          crmStatus.includes("sinal") ||
          crmStatus.includes("remarcad")
        ) {
          compareceram++;
        } else {
          compareceram++;
        }
      }
    }
    return { compareceram, noShow };
  }, [leads]);

  // 5. Nível 5: Ações da Primeira Call
  const firstCallResult = useMemo(() => {
    let fechadosCall = 0;
    let naoFecharam = 0;
    let remarcaram = 0;
    let sinal = 0;
    let followup = 0;
    let descartados = 0;

    for (const l of leads) {
      const crmStatus = String(l.crm_status || "").toLowerCase();
      const hasSched = !!(l.crm_data_agendamento || crmStatus.includes("agendado"));
      if (hasSched) {
        if (crmStatus.includes("fechado") || crmStatus.includes("ganho")) {
          fechadosCall++;
        } else if (crmStatus.includes("remarcad")) {
          remarcaram++;
        } else if (crmStatus.includes("sinal")) {
          sinal++;
        } else if (crmStatus.includes("followup")) {
          followup++;
        } else if (crmStatus.includes("lost") || crmStatus.includes("descartad") || crmStatus.includes("arquivad")) {
          descartados++;
        } else {
          naoFecharam++;
        }
      }
    }
    return { fechadosCall, naoFecharam, remarcaram, sinal, followup, descartados };
  }, [leads]);

  // 6. Nível 6: Desfecho do Follow-up / Fechamento Posterior
  const followupResult = useMemo(() => {
    let fechadosFollowup = 0;
    let descartadosFollowup = 0;
    let fechadosSegundaCall = 0;

    for (const v of periodVendas) {
      const l = leads.find((lead) => String(lead.id) === String(v.lead_id));
      if (l) {
        const crmStatus = String(l.crm_status || "").toLowerCase();
        if (crmStatus.includes("followup")) {
          fechadosFollowup++;
        } else if (crmStatus.includes("remarcad")) {
          fechadosSegundaCall++;
        } else {
          fechadosFollowup++;
        }
      }
    }

    for (const l of leads) {
      const crmStatus = String(l.crm_status || "").toLowerCase();
      if (crmStatus.includes("followup") && (crmStatus.includes("lost") || crmStatus.includes("descartad"))) {
        discarded: descartadosFollowup++;
      }
    }

    return { fechadosFollowup, descartadosFollowup, fechadosSegundaCall };
  }, [leads, periodVendas]);

  // Taxas de conversão
  const rateSdr = topo.total > 0 ? (sdrAction.ligados / topo.total) * 100 : 0;
  const rateQual = sdrAction.ligados > 0 ? (qualification.qualificados / sdrAction.ligados) * 100 : 0;
  const rateComp = qualification.qualificados > 0 ? (attendance.compareceram / qualification.qualificados) * 100 : 0;
  const rateFech = attendance.compareceram > 0 ? (firstCallResult.fechadosCall / attendance.compareceram) * 100 : 0;
  const totalCloserFechados = firstCallResult.fechadosCall + followupResult.fechadosFollowup + followupResult.fechadosSegundaCall;
  const rateFinal = topo.total > 0 ? (totalCloserFechados / topo.total) * 100 : 0;

  const toggleLevel = (idx: number) => {
    setOpenLevel(openLevel === idx ? null : idx);
  };

  return (
    <Card className="border-border/50 bg-gradient-to-br from-card via-card/85 to-card/50 shadow-2xl p-6 md:p-8">
      <div className="mb-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-accent font-semibold mb-1">Métricas de Conversão</p>
        <h3 className="text-lg font-bold">Funil Tridimensional de Vendas</h3>
        <p className="text-xs text-muted-foreground mt-1">Clique em qualquer camada do funil para ver o detalhamento completo.</p>
      </div>

      <div className="relative flex flex-col items-center w-full max-w-2xl mx-auto space-y-4 py-4">
        
        {/* Nível 1: Topo */}
        <div className="w-full flex flex-col items-center">
          <div onClick={() => toggleLevel(1)}
            className="w-full bg-gradient-to-r from-violet-500/20 via-indigo-500/20 to-purple-500/20 border border-violet-500/30 hover:border-violet-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(139,92,246,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-violet-500/10 border border-violet-500/30 text-xs font-mono font-bold text-violet-400">01</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-violet-300">Entrada de Leads</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Origens dos canais de captação</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-violet-300">{fmtInt(topo.total)} <span className="text-[10px] text-muted-foreground">leads</span></span>
              <ChevronDown className={`h-4 w-4 text-violet-400 transition-transform ${openLevel === 1 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 1 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-violet-500/20 rounded-b-xl px-6 py-3.5 text-xs grid grid-cols-2 md:grid-cols-3 gap-3 animate-fadeIn">
              {Object.entries(topo.channels).map(([channel, count]) => (
                <div key={channel} className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                  <p className="text-muted-foreground text-[10px] uppercase font-bold">{channel}</p>
                  <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(count)} <span className="text-[9px] text-muted-foreground">({((count / (topo.total || 1)) * 100).toFixed(0)}%)</span></p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transição 1-2 */}
        <div className="flex flex-col items-center text-[10px] text-violet-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Tratamento SDR: {rateSdr.toFixed(0)}%</span>
        </div>

        {/* Nível 2: SDR Tratou */}
        <div className="w-[95%] flex flex-col items-center">
          <div onClick={() => toggleLevel(2)}
            className="w-full bg-gradient-to-r from-blue-500/20 via-cyan-500/20 to-sky-500/20 border border-blue-500/30 hover:border-blue-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(59,130,246,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs font-mono font-bold text-blue-400">02</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Ação do SDR</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Leads ligados vs não ligados</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-blue-300">{fmtInt(sdrAction.ligados)} <span className="text-[10px] text-muted-foreground">contatados</span></span>
              <ChevronDown className={`h-4 w-4 text-blue-400 transition-transform ${openLevel === 2 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 2 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-blue-500/20 rounded-b-xl px-6 py-3.5 text-xs flex gap-4 animate-fadeIn">
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-emerald-400 text-[10px] uppercase font-bold">Ligados / Contatados</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(sdrAction.ligados)} <span className="text-[10px] text-muted-foreground font-sans">({rateSdr.toFixed(0)}%)</span></p>
              </div>
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-rose-400 text-[10px] uppercase font-bold">Não Ligados (Novos)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(sdrAction.naoLigados)} <span className="text-[10px] text-muted-foreground font-sans">({(100 - rateSdr).toFixed(0)}%)</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Transição 2-3 */}
        <div className="flex flex-col items-center text-[10px] text-blue-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Qualificação: {rateQual.toFixed(0)}%</span>
        </div>

        {/* Nível 3: Qualificação */}
        <div className="w-[90%] flex flex-col items-center">
          <div onClick={() => toggleLevel(3)}
            className="w-full bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-green-500/20 border border-emerald-500/30 hover:border-emerald-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(16,185,129,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono font-bold text-emerald-400">03</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">Qualificação</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Qualificados para call de vendas</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-emerald-300">{fmtInt(qualification.qualificados)} <span className="text-[10px] text-muted-foreground">qualificados</span></span>
              <ChevronDown className={`h-4 w-4 text-emerald-400 transition-transform ${openLevel === 3 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 3 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-emerald-500/20 rounded-b-xl px-6 py-3.5 text-xs flex gap-4 animate-fadeIn">
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-emerald-400 text-[10px] uppercase font-bold">Qualificados (Caixa &gt; R$ 1k)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(qualification.qualificados)} <span className="text-[10px] text-muted-foreground font-sans">({rateQual.toFixed(0)}%)</span></p>
              </div>
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-rose-400 text-[10px] uppercase font-bold">Não Qualificados (Caixa Baixo)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(qualification.naoQualificados)} <span className="text-[10px] text-muted-foreground font-sans">({(100 - rateQual).toFixed(0)}%)</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Transição 3-4 */}
        <div className="flex flex-col items-center text-[10px] text-emerald-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Comparecimento: {rateComp.toFixed(0)}%</span>
        </div>

        {/* Nível 4: Comparecimento */}
        <div className="w-[85%] flex flex-col items-center">
          <div onClick={() => toggleLevel(4)}
            className="w-full bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-yellow-500/20 border border-amber-500/30 hover:border-amber-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(245,158,11,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-mono font-bold text-amber-400">04</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">Comparecimento</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Show vs No-Show na reunião</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-amber-300">{fmtInt(attendance.compareceram)} <span className="text-[10px] text-muted-foreground">compareceram</span></span>
              <ChevronDown className={`h-4 w-4 text-amber-400 transition-transform ${openLevel === 4 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 4 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-amber-500/20 rounded-b-xl px-6 py-3.5 text-xs flex gap-4 animate-fadeIn">
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-emerald-400 text-[10px] uppercase font-bold">Compareceram (Show)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(attendance.compareceram)} <span className="text-[10px] text-muted-foreground font-sans">({rateComp.toFixed(0)}%)</span></p>
              </div>
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-rose-400 text-[10px] uppercase font-bold">Não Compareceram (No-Show)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(attendance.noShow)} <span className="text-[10px] text-muted-foreground font-sans">({(100 - rateComp).toFixed(0)}%)</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Transição 4-5 */}
        <div className="flex flex-col items-center text-[10px] text-amber-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Fechamento Direto: {rateFech.toFixed(0)}%</span>
        </div>

        {/* Nível 5: Ações da Primeira Call */}
        <div className="w-[80%] flex flex-col items-center">
          <div onClick={() => toggleLevel(5)}
            className="w-full bg-gradient-to-r from-rose-500/20 via-pink-500/20 to-red-500/20 border border-rose-500/30 hover:border-rose-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(244,63,94,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-mono font-bold text-rose-400">05</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">Primeira Call</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Resultados pós-reunião direta</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-rose-300">{fmtInt(firstCallResult.fechadosCall)} <span className="text-[10px] text-muted-foreground">fecharam</span></span>
              <ChevronDown className={`h-4 w-4 text-rose-400 transition-transform ${openLevel === 5 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 5 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-rose-500/20 rounded-b-xl px-6 py-3.5 text-xs grid grid-cols-2 md:grid-cols-3 gap-3 animate-fadeIn">
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-emerald-400 text-[10px] uppercase font-bold">Fechados na Call</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.fechadosCall)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-amber-400 text-[10px] uppercase font-bold">Deram Sinal</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.sinal)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-blue-400 text-[10px] uppercase font-bold">Em Follow-up</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.followup)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-sky-400 text-[10px] uppercase font-bold">Remarcaram</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.remarcaram)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-rose-400 text-[10px] uppercase font-bold">Descartados</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.descartados)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-muted-foreground text-[10px] uppercase font-bold">Não Fecharam/Aberto</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.naoFecharam)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Transição 5-6 */}
        <div className="flex flex-col items-center text-[10px] text-rose-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Follow-up &amp; Desfecho</span>
        </div>

        {/* Nível 6: Desfecho do Follow-up */}
        <div className="w-[75%] flex flex-col items-center">
          <div onClick={() => toggleLevel(6)}
            className="w-full bg-gradient-to-r from-fuchsia-500/20 via-purple-500/20 to-pink-500/20 border border-fuchsia-500/30 hover:border-fuchsia-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(217,70,239,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 text-xs font-mono font-bold text-fuchsia-400">06</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Follow-up &amp; Fechamentos</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Desfecho posterior e segunda call</p>
              </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-violet-300">{fmtInt(topo.total)} <span className="text-[10px] text-muted-foreground">leads</span></span>
              <ChevronDown className={`h-4 w-4 text-violet-400 transition-transform ${openLevel === 1 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 1 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-violet-500/20 rounded-b-xl px-6 py-3.5 text-xs grid grid-cols-2 md:grid-cols-3 gap-3 animate-fadeIn">
              {Object.entries(topo.channels).map(([channel, count]) => (
                <div key={channel} className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                  <p className="text-muted-foreground text-[10px] uppercase font-bold">{channel}</p>
                  <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(count)} <span className="text-[9px] text-muted-foreground">({((count / (topo.total || 1)) * 100).toFixed(0)}%)</span></p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transição 1-2 */}
        <div className="flex flex-col items-center text-[10px] text-violet-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Tratamento SDR: {rateSdr.toFixed(0)}%</span>
        </div>

        {/* Nível 2: SDR Tratou */}
        <div className="w-[95%] flex flex-col items-center">
          <div onClick={() => toggleLevel(2)}
            className="w-full bg-gradient-to-r from-blue-500/20 via-cyan-500/20 to-sky-500/20 border border-blue-500/30 hover:border-blue-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(59,130,246,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs font-mono font-bold text-blue-400">02</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Ação do SDR</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Leads ligados vs não ligados</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-blue-300">{fmtInt(sdrAction.ligados)} <span className="text-[10px] text-muted-foreground">contatados</span></span>
              <ChevronDown className={`h-4 w-4 text-blue-400 transition-transform ${openLevel === 2 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 2 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-blue-500/20 rounded-b-xl px-6 py-3.5 text-xs flex gap-4 animate-fadeIn">
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-emerald-400 text-[10px] uppercase font-bold">Ligados / Contatados</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(sdrAction.ligados)} <span className="text-[10px] text-muted-foreground font-sans">({rateSdr.toFixed(0)}%)</span></p>
              </div>
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-rose-400 text-[10px] uppercase font-bold">Não Ligados (Novos)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(sdrAction.naoLigados)} <span className="text-[10px] text-muted-foreground font-sans">({(100 - rateSdr).toFixed(0)}%)</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Transição 2-3 */}
        <div className="flex flex-col items-center text-[10px] text-blue-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Qualificação: {rateQual.toFixed(0)}%</span>
        </div>

        {/* Nível 3: Qualificação */}
        <div className="w-[90%] flex flex-col items-center">
          <div onClick={() => toggleLevel(3)}
            className="w-full bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-green-500/20 border border-emerald-500/30 hover:border-emerald-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(16,185,129,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono font-bold text-emerald-400">03</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">Qualificação</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Qualificados para call de vendas</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-emerald-300">{fmtInt(qualification.qualificados)} <span className="text-[10px] text-muted-foreground">qualificados</span></span>
              <ChevronDown className={`h-4 w-4 text-emerald-400 transition-transform ${openLevel === 3 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 3 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-emerald-500/20 rounded-b-xl px-6 py-3.5 text-xs flex gap-4 animate-fadeIn">
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-emerald-400 text-[10px] uppercase font-bold">Qualificados (Caixa &gt; R$ 1k)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(qualification.qualificados)} <span className="text-[10px] text-muted-foreground font-sans">({rateQual.toFixed(0)}%)</span></p>
              </div>
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-rose-400 text-[10px] uppercase font-bold">Não Qualificados (Caixa Baixo)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(qualification.naoQualificados)} <span className="text-[10px] text-muted-foreground font-sans">({(100 - rateQual).toFixed(0)}%)</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Transição 3-4 */}
        <div className="flex flex-col items-center text-[10px] text-emerald-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Comparecimento: {rateComp.toFixed(0)}%</span>
        </div>

        {/* Nível 4: Comparecimento */}
        <div className="w-[85%] flex flex-col items-center">
          <div onClick={() => toggleLevel(4)}
            className="w-full bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-yellow-500/20 border border-amber-500/30 hover:border-amber-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(245,158,11,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-mono font-bold text-amber-400">04</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">Comparecimento</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Show vs No-Show na reunião</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-amber-300">{fmtInt(attendance.compareceram)} <span className="text-[10px] text-muted-foreground">compareceram</span></span>
              <ChevronDown className={`h-4 w-4 text-amber-400 transition-transform ${openLevel === 4 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 4 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-amber-500/20 rounded-b-xl px-6 py-3.5 text-xs flex gap-4 animate-fadeIn">
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-emerald-400 text-[10px] uppercase font-bold">Compareceram (Show)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(attendance.compareceram)} <span className="text-[10px] text-muted-foreground font-sans">({rateComp.toFixed(0)}%)</span></p>
              </div>
              <div className="flex-1 bg-muted/20 border border-border/40 p-3 rounded-lg">
                <p className="text-rose-400 text-[10px] uppercase font-bold">Não Compareceram (No-Show)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{fmtInt(attendance.noShow)} <span className="text-[10px] text-muted-foreground font-sans">({(100 - rateComp).toFixed(0)}%)</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Transição 4-5 */}
        <div className="flex flex-col items-center text-[10px] text-amber-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Fechamento Direto: {rateFech.toFixed(0)}%</span>
        </div>

        {/* Nível 5: Ações da Primeira Call */}
        <div className="w-[80%] flex flex-col items-center">
          <div onClick={() => toggleLevel(5)}
            className="w-full bg-gradient-to-r from-rose-500/20 via-pink-500/20 to-red-500/20 border border-rose-500/30 hover:border-rose-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(244,63,94,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-mono font-bold text-rose-400">05</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">Primeira Call</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Resultados pós-reunião direta</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-rose-300">{fmtInt(firstCallResult.fechadosCall)} <span className="text-[10px] text-muted-foreground">fecharam</span></span>
              <ChevronDown className={`h-4 w-4 text-rose-400 transition-transform ${openLevel === 5 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 5 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-rose-500/20 rounded-b-xl px-6 py-3.5 text-xs grid grid-cols-2 md:grid-cols-3 gap-3 animate-fadeIn">
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-emerald-400 text-[10px] uppercase font-bold">Fechados na Call</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.fechadosCall)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-amber-400 text-[10px] uppercase font-bold">Deram Sinal</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.sinal)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-blue-400 text-[10px] uppercase font-bold">Em Follow-up</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.followup)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-sky-400 text-[10px] uppercase font-bold">Remarcaram</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.remarcaram)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-rose-400 text-[10px] uppercase font-bold">Descartados</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.descartados)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-muted-foreground text-[10px] uppercase font-bold">Não Fecharam/Aberto</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(firstCallResult.naoFecharam)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Transição 5-6 */}
        <div className="flex flex-col items-center text-[10px] text-rose-400 font-mono gap-0.5">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span>Follow-up &amp; Desfecho</span>
        </div>

        {/* Nível 6: Desfecho do Follow-up */}
        <div className="w-[75%] flex flex-col items-center">
          <div onClick={() => toggleLevel(6)}
            className="w-full bg-gradient-to-r from-fuchsia-500/20 via-purple-500/20 to-pink-500/20 border border-fuchsia-500/30 hover:border-fuchsia-400/50 rounded-xl px-6 py-4 flex items-center justify-between shadow-[0_4px_20px_-5px_rgba(217,70,239,0.15)] hover:scale-[1.01] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 text-xs font-mono font-bold text-fuchsia-400">06</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Follow-up &amp; Fechamentos</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Desfecho posterior e segunda call</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-base font-bold text-fuchsia-300">{fmtInt(followupResult.fechadosFollowup + followupResult.fechadosSegundaCall)} <span className="text-[10px] text-muted-foreground">fechamentos</span></span>
              <ChevronDown className={`h-4 w-4 text-fuchsia-400 transition-transform ${openLevel === 6 ? "rotate-180" : ""}`} />
            </div>
          </div>
          {openLevel === 6 && (
            <div className="w-[98%] bg-card/60 border-x border-b border-fuchsia-500/20 rounded-b-xl px-6 py-3.5 text-xs grid grid-cols-1 md:grid-cols-3 gap-3 animate-fadeIn">
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-emerald-400 text-[10px] uppercase font-bold">Fechados em Follow-up</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(followupResult.fechadosFollowup)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-rose-400 text-[10px] uppercase font-bold">Descartados pós-followup</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(followupResult.descartadosFollowup)}</p>
              </div>
              <div className="bg-muted/20 border border-border/40 p-2.5 rounded-lg">
                <p className="text-sky-400 text-[10px] uppercase font-bold">Fechados na 2ª Call</p>
                <p className="text-sm font-semibold font-mono mt-0.5">{fmtInt(followupResult.fechadosSegundaCall)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-border/40 text-center text-xs text-muted-foreground flex flex-col md:flex-row md:justify-around gap-4 font-mono">
          <div>Total Geral Convertido: <span className="text-emerald-400 font-bold">{fmtInt(totalCloserFechados)}</span></div>
          <div>Conversão Geral do Funil: <span className="text-accent font-bold">{rateFinal.toFixed(1)}%</span></div>
        </div>
      </Card>
  );
}

function ReceitaPorOrigemView({ leads, vendas }: { leads: QLead[]; vendas: any[] }) {
  const fontes = useMemo(() => {
    const map = new Map<string, { faturamento: number; vendas: number }>();
    const init = (k: string) => { if (!map.has(k)) map.set(k, { faturamento: 0, vendas: 0 }); };
    init("Tráfego Pago"); init("Orgânico (Typebot)"); init("SDR Manual"); init("Direto");

    for (const v of vendas) {
      const val = Number(v.valor_total || 0);
      const lead = leads.find((l) =>
        String(l.id) === String(v.lead_id) ||
        (l.email && v.cliente && String(l.email).toLowerCase() === String(v.cliente).toLowerCase())
      );
      let fonte = "Direto";
      if (lead) {
        const src = String(lead.utm_source || "").toLowerCase();
        const med = String(lead.utm_medium || "").toLowerCase();
        if (src === "sdr-manual" || med === "sdr-manual") fonte = "SDR Manual";
        else if (
          src.includes("fb") || src.includes("ig") || src.includes("facebook") ||
          src.includes("instagram") || src.includes("meta") || src.includes("ads") ||
          med.includes("cpc") || med.includes("cpm") || med.includes("paid")
        ) fonte = "Tráfego Pago";
        else fonte = "Orgânico (Typebot)";
      }
      const e = map.get(fonte)!;
      e.faturamento += val;
      e.vendas += 1;
    }

    const all = Array.from(map.entries()).map(([fonte, s]) => ({ fonte, ...s })).filter(f => f.vendas > 0);
    const totalFat = all.reduce((a, f) => a + f.faturamento, 0);
    return all.map(f => ({ ...f, pct: totalFat > 0 ? (f.faturamento / totalFat) * 100 : 0 }))
      .sort((a, b) => b.faturamento - a.faturamento);
  }, [leads, vendas]);

  const FONTE_COLORS: Record<string, string> = {
    "Tráfego Pago": "#8b5cf6",
    "Orgânico (Typebot)": "#10b981",
    "SDR Manual": "#f59e0b",
    "Direto": "#64748b",
  };

  const totalFat = fontes.reduce((a, f) => a + f.faturamento, 0);
  const totalVendas = fontes.reduce((a, f) => a + f.vendas, 0);

  if (fontes.length === 0) return (
    <div className="text-center text-muted-foreground text-sm py-8">Nenhuma venda registrada no período.</div>
  );

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-widest">Total</span>
            <div className="text-2xl font-bold tabular-nums text-foreground">{fmtBRL(totalFat)}</div>
            <div className="text-xs text-muted-foreground">{totalVendas} vendas fechadas</div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {fontes.map(f => (
              <div key={f.fonte} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ background: FONTE_COLORS[f.fonte] ?? "#94a3b8" }} />
                <span className="text-muted-foreground">{f.fonte}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {fontes.map(f => (
            <div key={f.fonte} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: FONTE_COLORS[f.fonte] ?? "#94a3b8" }} />
                  <span className="font-medium">{f.fonte}</span>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="text-muted-foreground text-xs">{f.vendas} venda{f.vendas !== 1 ? "s" : ""}</span>
                  <span className="font-semibold tabular-nums" style={{ color: FONTE_COLORS[f.fonte] ?? "#94a3b8" }}>{fmtBRL(f.faturamento)}</span>
                  <span className="text-muted-foreground text-xs w-10 text-right">{f.pct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary/40 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${f.pct}%`, background: FONTE_COLORS[f.fonte] ?? "#94a3b8" }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LancarVendaDialog({
  open, onOpenChange, leads, onReload
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leads: QLead[];
  onReload: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<QLead | null>(null);
  const [valTotal, setValTotal] = useState("");
  const [valLiquido, setValLiquido] = useState("");
  const [closerName, setCloserName] = useState("");
  const [vendaData, setVendaData] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return leads.filter(l =>
      (l.nome && l.nome.toLowerCase().includes(q)) ||
      (l.whatsapp && l.whatsapp.includes(q)) ||
      (l.email && l.email.toLowerCase().includes(q))
    ).slice(0, 5);
  }, [search, leads]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLead) {
      toast.error("Por favor, selecione um lead.");
      return;
    }
    const total = parseFloat(valTotal.replace(/,/g, ".")) || 0;
    if (total <= 0) {
      toast.error("Informe um valor de venda válido.");
      return;
    }
    const liq = parseFloat(valLiquido.replace(/,/g, ".")) || total * 0.9;

    setSaving(true);
    try {
      const payload = {
        lead_id: selectedLead.id,
        cliente: selectedLead.email || selectedLead.nome || "Lead Manual",
        valor_total: total,
        valor_liquido: liq,
        closer: closerName || "Manual",
        data: vendaData,
        status: "aprovado",
      };

      const { error } = await supabase.from("ht_vendas").insert([payload]);
      if (error) throw error;

      toast.success("Venda lançada com sucesso!");
      onOpenChange(false);
      // Reset form
      setSelectedLead(null);
      setSearch("");
      setValTotal("");
      setValLiquido("");
      setCloserName("");
      onReload();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao lançar venda: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border/50 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Lançar Venda Manual (High Ticket)</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Busca de Lead */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase font-semibold">Pesquisar Lead do Quiz</Label>
            {selectedLead ? (
              <div className="flex items-center justify-between rounded-lg bg-accent/20 border border-accent/40 p-2.5 text-sm">
                <div>
                  <p className="font-semibold text-foreground">{selectedLead.nome || "Sem Nome"}</p>
                  <p className="text-xs text-muted-foreground">{selectedLead.whatsapp || selectedLead.email || "Sem contato"}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedLead(null)} className="h-7 px-2 text-xs">
                  Alterar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Pesquise por nome, e-mail ou whatsapp..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-background border-border/60"
                />
                {filteredLeads.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border/60 rounded-lg shadow-xl z-50 divide-y divide-border/40 overflow-hidden">
                    {filteredLeads.map(l => (
                      <div
                        key={l.id}
                        onClick={() => setSelectedLead(l)}
                        className="p-2.5 text-xs hover:bg-secondary/40 cursor-pointer flex flex-col gap-0.5"
                      >
                        <span className="font-semibold text-foreground">{l.nome || "Sem Nome"}</span>
                        <span className="text-muted-foreground">{l.whatsapp || l.email || "Sem contato"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Valor Bruto */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold">Valor Bruto (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="1000.00"
                value={valTotal}
                onChange={(e) => setValTotal(e.target.value)}
                className="bg-background border-border/60"
                required
              />
            </div>
            {/* Valor Líquido */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold">Valor Líquido (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="900.00"
                value={valLiquido}
                onChange={(e) => setValLiquido(e.target.value)}
                className="bg-background border-border/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Nome do Closer */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold">Nome do Closer</Label>
              <Input
                placeholder="Nome do Closer"
                value={closerName}
                onChange={(e) => setCloserName(e.target.value)}
                className="bg-background border-border/60"
              />
            </div>
            {/* Data da Venda */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold">Data da Venda</Label>
              <Input
                type="date"
                value={vendaData}
                onChange={(e) => setVendaData(e.target.value)}
                className="bg-background border-border/60"
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border/60"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !selectedLead}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {saving ? "Registrando..." : "Confirmar Venda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

