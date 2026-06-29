import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Users,
  TrendingUp,
  Facebook,
  RefreshCw,
  Search,
  Radio,
  Sparkles,
  Mail,
  MessageCircle,
  Instagram,
  Flame,
  Leaf,
  Megaphone,
  Crown,
  LayoutGrid,
  List as ListIcon,
  CheckCircle2,
  XCircle,
  DollarSign,
  Eye,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";

export const Route = createFileRoute("/_authenticated/quiz")({
  component: QuizPage,
});

// ---------- External Supabase (Quiz API) ----------
const QUIZ_SUPABASE_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";

const quizSb = createClient(QUIZ_SUPABASE_URL, QUIZ_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

type Lead = {
  id: string;
  data_criacao: string;
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
  instagram: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  fbc: string | null;
  fbp: string | null;
  fbclid: string | null;
  gclid: string | null;
  caixa_letra: string | null;
  caixa_label: string | null;
  lead_score: number | string | null;
  faturamento: string | null;
  momento: string | null;
  momento_letra: string | null;
  situacao: string | null;
  renda: string | null;
  objetivo: string | null;
  socio: string | null;
  investir: string | null;
  porque: string | null;
  comprometimento: string | null;
  minicurso: string | null;
  funil: string | null;
  last_step: string | null;
  referrer: string | null;
  user_agent: string | null;
  respostas_json: Record<string, unknown> | null;
  status: string | null;
  crm_status: string | null;
  origem: string | null;
};

const TICKET_TIERS: Record<string, { label: string; cls: string; weight: number }> = {
  A: { label: "Até R$ 1k",      cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",                 weight: 1 },
  B: { label: "R$ 1k–5k",       cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",                 weight: 2 },
  C: { label: "R$ 5k–10k",      cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",                 weight: 3 },
  D: { label: "R$ 10k–30k",     cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",       weight: 4 },
  E: { label: "R$ 30k–50k",     cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",             weight: 5 },
  F: { label: "R$ 50k–100k",    cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",          weight: 6 },
  G: { label: "R$ 100k+",       cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40 shadow-[0_0_20px_-5px_rgba(234,179,8,0.6)]", weight: 7 },
};

// Caixa = capital disponível que a pessoa declarou ter (não é faturamento desejado)
function caixaLabel(l: Lead): string {
  const fromLabel = (l.caixa_label ?? "").trim();
  if (fromLabel) return fromLabel;
  const fromJson = ((l.respostas_json as Record<string, unknown> | null)?.caixa ?? "") as string;
  if (typeof fromJson === "string" && fromJson.trim()) return fromJson.trim();
  const letter = (l.caixa_letra ?? "").toUpperCase();
  return TICKET_TIERS[letter]?.label ?? "—";
}

function caixaWeight(l: Lead): number {
  const letter = (l.caixa_letra ?? "").toUpperCase();
  return TICKET_TIERS[letter]?.weight ?? 0;
}

// Mantém o nome antigo pra não quebrar referências
const ticketLabel = caixaLabel;


type Period = "today" | "yesterday" | "7d" | "15d" | "30d" | "custom" | "all";
type ViewMode = "kanban" | "list";
type RealityFilter = "all" | "real" | "fake";

function periodToRange(
  p: Period,
  customFrom?: string,
  customTo?: string,
): { from: string | null; to: string | null } {
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  switch (p) {
    case "today":
      return { from: startToday.toISOString(), to: startTomorrow.toISOString() };
    case "yesterday": {
      const y = new Date(startToday);
      y.setDate(y.getDate() - 1);
      return { from: y.toISOString(), to: startToday.toISOString() };
    }
    case "7d":
    case "15d":
    case "30d": {
      const days = p === "7d" ? 7 : p === "15d" ? 15 : 30;
      const x = new Date(startToday);
      x.setDate(x.getDate() - days);
      return { from: x.toISOString(), to: startTomorrow.toISOString() };
    }
    case "custom": {
      const f = customFrom ? new Date(customFrom + "T00:00:00").toISOString() : null;
      const t = customTo ? new Date(customTo + "T23:59:59").toISOString() : null;
      return { from: f, to: t };
    }
    case "all":
      return { from: null, to: null };
  }
}

// ---------- Lead Classification ----------
type OriginKey = "facebook" | "instagram" | "google" | "organic" | "tiktok" | "unknown";
type LeadOrigin = {
  key: OriginKey;
  label: string;
  icon: typeof Facebook;
  ring: string;
  bg: string;
  text: string;
  glow: string;
  border: string;
};

const ORIGIN_ORDER: OriginKey[] = ["facebook", "instagram", "google", "tiktok", "organic", "unknown"];

function classifyLead(l: Lead): LeadOrigin {
  const src = (l.utm_source ?? "").toLowerCase();
  const isInstagram = src.includes("ig") || src.includes("instagram");
  const isFacebook = src.includes("fb") || src.includes("facebook");
  const hasFbTracking = !!(l.fbc && l.fbp);

  // Anúncio Meta: SOMENTE com fbc + fbp.
  // Se a source for IG => Instagram Ads; caso contrário => Facebook Ads.
  if (hasFbTracking) {
    if (isInstagram) {
      return {
        key: "instagram", label: "Instagram Ads", icon: Instagram,
        ring: "ring-pink-500/40", bg: "bg-gradient-to-br from-pink-500/10 to-purple-500/10",
        text: "text-pink-300",
        glow: "shadow-[0_0_24px_-8px_rgba(236,72,153,0.5)]", border: "border-pink-500/40",
      };
    }
    return {
      key: "facebook", label: "Facebook Ads", icon: Facebook,
      ring: "ring-blue-500/40", bg: "bg-blue-500/10", text: "text-blue-300",
      glow: "shadow-[0_0_24px_-8px_rgba(59,130,246,0.5)]", border: "border-blue-500/40",
    };
  }
  // Sem fbc/fbp: IG/FB caem como orgânico, mesmo com utm_source preenchida
  if (isInstagram || isFacebook) {
    return {
      key: "organic", label: "Orgânico", icon: Sparkles,
      ring: "ring-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-300",
      glow: "shadow-[0_0_24px_-8px_rgba(16,185,129,0.5)]", border: "border-emerald-500/40",
    };
  }
  if (l.gclid || src.includes("google") || src.includes("gad")) {
    return {
      key: "google", label: "Google Ads", icon: Megaphone,
      ring: "ring-amber-500/40", bg: "bg-amber-500/10", text: "text-amber-300",
      glow: "shadow-[0_0_24px_-8px_rgba(245,158,11,0.5)]", border: "border-amber-500/40",
    };
  }
  if (src.includes("tiktok") || src.includes("tt")) {
    return {
      key: "tiktok", label: "TikTok", icon: Flame,
      ring: "ring-pink-500/40", bg: "bg-pink-500/10", text: "text-pink-300",
      glow: "shadow-[0_0_24px_-8px_rgba(236,72,153,0.5)]", border: "border-pink-500/40",
    };
  }
  if (src && src !== "(direct)" && src !== "direct") {
    return {
      key: "unknown", label: src || "Outros", icon: Megaphone,
      ring: "ring-violet-500/40", bg: "bg-violet-500/10", text: "text-violet-300",
      glow: "shadow-[0_0_24px_-8px_rgba(139,92,246,0.4)]", border: "border-violet-500/40",
    };
  }
  return {
    key: "organic", label: "Orgânico", icon: Leaf,
    ring: "ring-emerald-500/30", bg: "bg-emerald-500/5", text: "text-emerald-300",
    glow: "shadow-[0_0_24px_-10px_rgba(16,185,129,0.4)]", border: "border-emerald-500/30",
  };
}

const HIGH_SCORE = new Set(["E", "F", "G"]);
const MID_SCORE = new Set(["C", "D"]);

function hasUseful(l: Lead): boolean {
  return !!(l.nome || l.email || l.whatsapp || l.instagram);
}

// "real" detection — heuristic. Manual overrides via localStorage.
function isRealHeuristic(l: Lead): boolean {
  const st = `${l.status ?? ""} ${l.crm_status ?? ""}`.toLowerCase();
  if (st.includes("fake") || st.includes("falso") || st.includes("invalid") || st.includes("spam")) return false;
  if (st.includes("real") || st.includes("valid") || st.includes("qualifi")) return true;
  // default: precisa de e-mail OU whatsapp pra contar como "real"
  return !!(l.email || l.whatsapp);
}

// ---- Manual real/fake overrides (localStorage) ----
const REALITY_KEY = "quiz-reality-overrides-v1";
type Reality = "real" | "fake";
function loadOverrides(): Record<string, Reality> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(REALITY_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveOverrides(o: Record<string, Reality>) {
  try {
    localStorage.setItem(REALITY_KEY, JSON.stringify(o));
  } catch {
    /* noop */
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function QuizPage() {
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const isGeral = workspace?.id === "all";

  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<OriginKey | "all">("all");
  const [liveCount, setLiveCount] = useState(0);
  const [view, setView] = useState<ViewMode>("kanban");
  const [reality, setReality] = useState<RealityFilter>("all");
  const [overrides, setOverrides] = useState<Record<string, Reality>>(() => loadOverrides());
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  function setLeadReality(id: string, r: Reality | null) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (r === null) delete next[id];
      else next[id] = r;
      saveOverrides(next);
      return next;
    });
  }

  function leadIsReal(l: Lead): boolean {
    const o = overrides[l.id];
    if (o === "real") return true;
    if (o === "fake") return false;
    return isRealHeuristic(l);
  }

  const { from: fromIso, to: toIso } = periodToRange(period, customFrom, customTo);

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ["quiz-leads", period, fromIso, toIso],
    queryFn: async () => {
      let q = quizSb
        .from("leads")
        .select("*")
        .order("data_criacao", { ascending: false })
        .limit(1000);
      if (fromIso) q = q.gte("data_criacao", fromIso);
      if (toIso) q = q.lt("data_criacao", toIso);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    const ch = quizSb
      .channel("quiz-leads-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        () => {
          setLiveCount((n) => n + 1);
          qc.invalidateQueries({ queryKey: ["quiz-leads"] });
        },
      )
      .subscribe();
    return () => {
      quizSb.removeChannel(ch);
    };
  }, [qc]);

  const filteredLeads = useMemo(() => {
    let rows = leads.filter(hasUseful);
    if (!isGeral && workspace?.nome) {
      const w = workspace.nome.toLowerCase();
      rows = rows.filter(
        (l) =>
          (l.utm_campaign ?? "").toLowerCase().includes(w) ||
          (l.utm_source ?? "").toLowerCase().includes(w) ||
          (l.utm_content ?? "").toLowerCase().includes(w),
      );
    }
    if (originFilter !== "all") rows = rows.filter((l) => classifyLead(l).key === originFilter);
    if (reality !== "all") rows = rows.filter((l) => (reality === "real" ? leadIsReal(l) : !leadIsReal(l)));
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (l) =>
          (l.nome ?? "").toLowerCase().includes(s) ||
          (l.email ?? "").toLowerCase().includes(s) ||
          (l.whatsapp ?? "").toLowerCase().includes(s) ||
          (l.instagram ?? "").toLowerCase().includes(s),
      );
    }
    return rows;
  }, [leads, isGeral, workspace, search, originFilter, reality, overrides]);

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const byOrigin: Record<OriginKey, number> = { facebook: 0, instagram: 0, google: 0, organic: 0, tiktok: 0, unknown: 0 };
    let high = 0;
    let real = 0;
    let fake = 0;
    for (const l of filteredLeads) {
      byOrigin[classifyLead(l).key]++;
      if (HIGH_SCORE.has((l.caixa_letra ?? "").toUpperCase())) high++;
      if (leadIsReal(l)) real++; else fake++;
    }
    return { total, byOrigin, high, real, fake };
  }, [filteredLeads, overrides]);

  const grouped = useMemo(() => {
    const g: Record<OriginKey, Lead[]> = { facebook: [], instagram: [], google: [], tiktok: [], organic: [], unknown: [] };
    for (const l of filteredLeads) g[classifyLead(l).key].push(l);
    return g;
  }, [filteredLeads]);

  function refresh() {
    setLiveCount(0);
    qc.invalidateQueries({ queryKey: ["quiz-leads"] });
  }

  return (
    <div className="p-6 space-y-6">
      {/* HERO HEADER */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-card to-card p-6">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/20 text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Quiz Leads</h1>
              <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-400">
                <Radio className="h-3 w-3 animate-pulse" /> ao vivo
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {isGeral ? "Todos os leads do quiz" : `Operação · ${workspace?.nome}`}
              {liveCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  +{liveCount} novo{liveCount > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar nome, email, whatsapp…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-[260px] pl-8"
              />
            </div>
            <div className="flex rounded-md border border-border overflow-hidden">
              {([
                ["today", "Hoje"],
                ["yesterday", "Ontem"],
                ["7d", "7d"],
                ["15d", "15d"],
                ["30d", "30d"],
                ["custom", "Personalizado"],
              ] as [Period, string][]).map(([key, label], i) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={`px-3 h-9 text-xs transition ${i > 0 ? "border-l border-border" : ""} ${
                    period === key ? "bg-accent/20 text-accent font-semibold" : "hover:bg-accent/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 w-[140px]"
                />
                <span className="text-muted-foreground text-xs">até</span>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 w-[140px]"
                />
              </div>
            )}
            <Select value={reality} onValueChange={(v) => setReality(v as RealityFilter)}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="real">Só reais</SelectItem>
                <SelectItem value="fake">Só fakes</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setView("kanban")}
                className={`px-3 h-9 text-xs flex items-center gap-1 transition ${view === "kanban" ? "bg-accent/20 text-accent" : "hover:bg-accent/10"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={`px-3 h-9 text-xs flex items-center gap-1 transition border-l border-border ${view === "list" ? "bg-accent/20 text-accent" : "hover:bg-accent/10"}`}
              >
                <ListIcon className="h-3.5 w-3.5" /> Lista
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Atualizar
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardContent className="p-4 text-sm text-rose-300">
            Erro ao consultar API: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <StatPill active={originFilter === "all"} onClick={() => setOriginFilter("all")} icon={<Users className="h-4 w-4" />} label="Total" value={stats.total} accent="text-foreground" loading={isLoading} />
        <StatPill active={originFilter === "facebook"} onClick={() => setOriginFilter(originFilter === "facebook" ? "all" : "facebook")} icon={<Facebook className="h-4 w-4" />} label="Facebook" value={stats.byOrigin.facebook} accent="text-blue-300" loading={isLoading} />
        <StatPill active={originFilter === "instagram"} onClick={() => setOriginFilter(originFilter === "instagram" ? "all" : "instagram")} icon={<Instagram className="h-4 w-4" />} label="Instagram Ads" value={stats.byOrigin.instagram} accent="text-pink-300" loading={isLoading} />
        <StatPill active={originFilter === "google"} onClick={() => setOriginFilter(originFilter === "google" ? "all" : "google")} icon={<Megaphone className="h-4 w-4" />} label="Google" value={stats.byOrigin.google} accent="text-amber-300" loading={isLoading} />
        <StatPill active={originFilter === "tiktok"} onClick={() => setOriginFilter(originFilter === "tiktok" ? "all" : "tiktok")} icon={<Flame className="h-4 w-4" />} label="TikTok" value={stats.byOrigin.tiktok} accent="text-pink-300" loading={isLoading} />
        <StatPill active={originFilter === "organic"} onClick={() => setOriginFilter(originFilter === "organic" ? "all" : "organic")} icon={<Leaf className="h-4 w-4" />} label="Orgânico" value={stats.byOrigin.organic} accent="text-emerald-300" loading={isLoading} />
        <StatPill icon={<CheckCircle2 className="h-4 w-4" />} label="Reais" value={stats.real} accent="text-emerald-300" loading={isLoading} active={reality === "real"} onClick={() => setReality(reality === "real" ? "all" : "real")} />
        <StatPill icon={<XCircle className="h-4 w-4" />} label="Fakes" value={stats.fake} accent="text-rose-300" loading={isLoading} active={reality === "fake"} onClick={() => setReality(reality === "fake" ? "all" : "fake")} />
      </div>

      {/* CONTENT */}
      {filteredLeads.length === 0 && !isLoading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum lead encontrado com esses filtros.
          </CardContent>
        </Card>
      ) : view === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {ORIGIN_ORDER.map((key) => {
            const items = grouped[key] ?? [];
            if (items.length === 0) return null;
            const sample = items[0];
            const origin = classifyLead(sample);
            const Icon = origin.icon;
            return (
              <div key={key} className={`flex flex-col rounded-xl border ${origin.border} ${origin.bg} max-h-[78vh]`}>
                <div className={`flex items-center justify-between px-3 py-2 border-b ${origin.border}`}>
                  <div className={`flex items-center gap-2 text-sm font-semibold ${origin.text}`}>
                    <Icon className="h-4 w-4" /> {origin.label}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-fancy p-2 space-y-2">
                  {items.map((l) => (
                    <LeadCard key={l.id} lead={l} real={leadIsReal(l)} onToggle={(r) => setLeadReality(l.id, r)} onOpen={() => setSelectedLead(l)} compact />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Lead</th>
                  <th className="text-left px-3 py-2">Origem</th>
                  <th className="text-left px-3 py-2">Contato</th>
                  <th className="text-left px-3 py-2">Ticket</th>
                  <th className="text-left px-3 py-2">Score</th>
                  <th className="text-left px-3 py-2">Quando</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.slice(0, 300).map((l) => {
                  const o = classifyLead(l);
                  const Icon = o.icon;
                  const real = leadIsReal(l);
                  const letter = (l.caixa_letra ?? "").toUpperCase();
                  const tier = TICKET_TIERS[letter];
                  return (
                    <tr key={l.id} className="border-t border-border hover:bg-accent/5 cursor-pointer" onClick={() => setSelectedLead(l)}>
                      <td className="px-3 py-2 font-medium">{l.nome || <span className="italic text-muted-foreground">sem nome</span>}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`gap-1 ${o.text} ${o.bg}`}>
                          <Icon className="h-3 w-3" /> {o.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        <div>{l.email || "—"}</div>
                        <div>{l.whatsapp || ""}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tier?.cls ?? "bg-muted text-muted-foreground border-border"}`}>
                          <DollarSign className="h-3 w-3" /> {ticketLabel(l)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {letter ? (
                          <Badge className={HIGH_SCORE.has(letter) ? "bg-yellow-500/20 text-yellow-300" : "bg-muted text-muted-foreground"}>
                            {letter}
                          </Badge>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{timeAgo(l.data_criacao)}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <RealityToggle real={real} onChange={(r) => setLeadReality(l.id, r)} />
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setSelectedLead(l)}>
                          <Eye className="h-3 w-3" /> Ver
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredLeads.length > 300 && (
              <p className="p-3 text-center text-xs text-muted-foreground">
                Mostrando 300 de {filteredLeads.length} · refine o filtro pra ver mais.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <LeadDetailDialog lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}

function StatPill({
  icon, label, value, accent, loading, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
  loading?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={[
        "group relative overflow-hidden rounded-xl border p-4 text-left transition-all",
        active ? "border-accent/60 bg-accent/10 shadow-[0_0_30px_-10px_hsl(var(--accent))]" : "border-border bg-card hover:border-accent/30",
        clickable ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
    >
      <div className={`flex items-center gap-2 text-xs uppercase tracking-wider ${accent}`}>
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">
        {loading ? "…" : value.toLocaleString("pt-BR")}
      </div>
    </button>
  );
}

function RealityToggle({ real, onChange }: { real: boolean; onChange: (r: Reality | null) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden text-[11px]">
      <button
        type="button"
        onClick={() => onChange(real ? null : "real")}
        className={`px-2 py-1 flex items-center gap-1 transition ${real ? "bg-emerald-500/20 text-emerald-300" : "text-muted-foreground hover:bg-accent/10"}`}
      >
        <CheckCircle2 className="h-3 w-3" /> Real
      </button>
      <button
        type="button"
        onClick={() => onChange(!real ? null : "fake")}
        className={`px-2 py-1 flex items-center gap-1 border-l border-border transition ${!real ? "bg-rose-500/20 text-rose-300" : "text-muted-foreground hover:bg-accent/10"}`}
      >
        <XCircle className="h-3 w-3" /> Fake
      </button>
    </div>
  );
}

function LeadCard({
  lead, real, onToggle, onOpen, compact,
}: {
  lead: Lead;
  real: boolean;
  onToggle: (r: Reality | null) => void;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const origin = classifyLead(lead);
  const letter = (lead.caixa_letra ?? "").toUpperCase();
  const isHigh = HIGH_SCORE.has(letter);
  const isMid = MID_SCORE.has(letter);
  const cleanIg = lead.instagram?.replace(/^@/, "");
  const ticket = ticketLabel(lead);
  const tier = TICKET_TIERS[letter];

  return (
    <div
      className={[
        "relative overflow-hidden rounded-lg border bg-card p-3 transition-all",
        real ? "" : "opacity-70",
        isHigh ? "border-yellow-500/40" : "border-border",
        compact ? "" : "hover:-translate-y-0.5",
        onOpen ? "cursor-pointer hover:border-accent/50" : "",
      ].join(" ")}
      onClick={onOpen}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${origin.bg}`} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {lead.nome ? (
              <h3 className="truncate text-sm font-semibold">{lead.nome}</h3>
            ) : (
              <h3 className="truncate text-xs italic text-muted-foreground">sem nome</h3>
            )}
            {isHigh && (
              <Badge className="gap-1 bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/20 text-[10px]">
                <Crown className="h-3 w-3" /> {letter}
              </Badge>
            )}
            {isMid && (
              <Badge variant="outline" className="font-mono text-muted-foreground text-[10px]">{letter}</Badge>
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(lead.data_criacao)}</div>
        </div>
      </div>

      {ticket !== "—" && (
        <div className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${tier?.cls ?? "bg-accent/10 text-accent border-accent/30"}`}>
          <DollarSign className="h-3 w-3" /> {ticket}
        </div>
      )}

      <div className="mt-2 space-y-0.5 text-xs">
        {lead.email && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        {lead.whatsapp && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageCircle className="h-3 w-3 shrink-0 text-emerald-400" />
            <span className="truncate">{lead.whatsapp}</span>
          </div>
        )}
        {cleanIg && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Instagram className="h-3 w-3 shrink-0 text-pink-400" />
            <span className="truncate">@{cleanIg}</span>
          </div>
        )}
      </div>

      {lead.utm_campaign && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <Badge variant="outline" className="max-w-full truncate text-[9px]">
            <TrendingUp className="mr-1 h-2.5 w-2.5" /> {lead.utm_campaign}
          </Badge>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        {onOpen && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1" onClick={onOpen}>
            <Eye className="h-3 w-3" /> Respostas
          </Button>
        )}
        <RealityToggle real={real} onChange={onToggle} />
      </div>
    </div>
  );
}

const ANSWER_LABELS: Record<string, string> = {
  nome: "Nome",
  email: "E-mail",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  faturamento: "Faturamento atual",
  momento: "Momento de vida",
  situacao: "Situação",
  renda: "Renda",
  objetivo: "Objetivo",
  socio: "Tem sócio?",
  investir: "Quanto pode investir",
  porque: "Por quê",
  comprometimento: "Comprometimento",
  ideia: "Ideia",
  lucro: "Lucro desejado",
  tentou: "Já tentou antes",
  meta: "Meta",
  caixa: "Caixa",
  caixa_label: "Faixa de ticket",
};

function LeadDetailDialog({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const open = !!lead;
  if (!lead) return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent />
    </Dialog>
  );
  const r = (lead.respostas_json ?? {}) as Record<string, unknown>;
  const tier = TICKET_TIERS[(lead.caixa_letra ?? "").toUpperCase()];
  const entries = Object.entries(r).filter(([k, v]) => {
    if (["id", "status", "last_step", "updated_at", "user_agent", "referrer", "lead_score", "funil", "origem"].includes(k)) return false;
    if (v == null) return false;
    if (typeof v === "string" && !v.trim()) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead.nome || <span className="italic text-muted-foreground">sem nome</span>}
            {lead.caixa_letra && (
              <Badge className="bg-yellow-500/20 text-yellow-300">{lead.caixa_letra.toUpperCase()}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {timeAgo(lead.data_criacao)} · {lead.email || "sem email"} · {lead.whatsapp || "sem whatsapp"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className={`rounded-lg border p-4 ${tier?.cls ?? "bg-accent/5 border-accent/30 text-accent"}`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
              <DollarSign className="h-4 w-4" /> Ticket / Faturamento
            </div>
            <div className="mt-1 text-2xl font-bold">{ticketLabel(lead)}</div>
            {lead.caixa_label && <div className="text-xs opacity-70 mt-0.5">{lead.caixa_label}</div>}
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Respostas do Quiz</h4>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhuma resposta registrada.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {entries.map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {ANSWER_LABELS[k] ?? k}
                    </div>
                    <div className="text-sm font-medium mt-0.5 break-words">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(lead.utm_source || lead.utm_campaign) && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Atribuição</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {lead.utm_source && <div><span className="text-muted-foreground">source:</span> {lead.utm_source}</div>}
                {lead.utm_medium && <div><span className="text-muted-foreground">medium:</span> {lead.utm_medium}</div>}
                {lead.utm_campaign && <div className="col-span-2"><span className="text-muted-foreground">campaign:</span> {lead.utm_campaign}</div>}
                {lead.utm_content && <div className="col-span-2"><span className="text-muted-foreground">content:</span> {lead.utm_content}</div>}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
