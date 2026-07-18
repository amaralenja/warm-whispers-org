import { createFileRoute } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  Wallet,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Clock,
  Phone,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import { useServerFn } from "@tanstack/react-start";
import { fetchInstagramProfile, listInstagramLeads } from "@/lib/instagram.functions";
import { listHtQuizSubmissions } from "@/lib/ht-api.functions";
import { toast } from "sonner";
import { DragScroll } from "@/components/drag-scroll";
import { getHtTeamSession } from "@/lib/ht-team-session";

export function formatUtm(val: string | null): string {
  if (!val) return "—";
  const trimmed = val.trim();
  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length > 8) {
      return `ID: ${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
    }
    return `ID: ${trimmed}`;
  }
  return trimmed;
}

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
  const raw = l.caixa_label;
  const fromLabel = typeof raw === "string" ? raw.trim() : "";
  if (fromLabel) return fromLabel;
  const j = (l.respostas_json as Record<string, unknown> | null)?.caixa;
  if (typeof j === "string" && j.trim()) return j.trim();
  if (typeof j === "number") return String(j);
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
        key: "instagram", label: "Instagram", icon: Instagram,
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

// Alguns campos podem chegar como objeto/array vindos da API externa —
// coage tudo pra string pra não estourar "Objects are not valid as a React child".
function safeStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}
const STRING_FIELDS: (keyof Lead)[] = [
  "nome", "email", "whatsapp", "instagram",
  "utm_source", "utm_medium", "utm_campaign", "utm_content",
  "fbc", "fbp", "fbclid", "gclid",
  "caixa_letra", "caixa_label", "faturamento", "momento", "momento_letra",
  "situacao", "renda", "objetivo", "socio", "investir", "porque",
  "comprometimento", "minicurso", "funil", "last_step", "referrer",
  "user_agent", "status", "crm_status", "origem",
];
function sanitizeLead(raw: unknown): Lead {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...r };
  for (const k of STRING_FIELDS) out[k as string] = safeStr(r[k as string]);
  return out as Lead;
}

// Mapeia uma submissão vinda do endpoint /api/public/ht-quiz/submit
// para o shape Lead usado pela aba de Quiz.
function apiSubToLead(s: any): Lead {
  const r = (s?.respostas && typeof s.respostas === "object") ? s.respostas : {};
  const pick = (k: string): string | null => {
    const v = (r as any)[k];
    if (v == null) return null;
    if (typeof v === "object") {
      const o: any = v;
      const s2 = o.label ?? o.value ?? o.text ?? null;
      return typeof s2 === "string" || typeof s2 === "number" ? String(s2) : null;
    }
    return typeof v === "string" || typeof v === "number" ? String(v) : null;
  };
  const caixaRaw = pick("caixa") ?? pick("caixa_label");
  const letra = (pick("caixa_letra") ?? (caixaRaw && /^[A-G]$/i.test(caixaRaw) ? caixaRaw : "") ?? "").toUpperCase() || null;
  const label = caixaRaw && !/^[A-G]$/i.test(caixaRaw) ? caixaRaw : (letra ? TICKET_TIERS[letra]?.label ?? null : null);
  return sanitizeLead({
    id: `api:${s.id}`,
    data_criacao: s.received_at ?? s.updated_at ?? new Date().toISOString(),
    nome: s.nome, email: s.email, whatsapp: s.whatsapp, instagram: s.instagram,
    utm_source: s.utm_source, utm_medium: s.utm_medium, utm_campaign: s.utm_campaign, utm_content: s.utm_content,
    fbc: s.fbc, fbp: s.fbp, fbclid: s.fbclid, gclid: s.gclid,
    caixa_letra: letra, caixa_label: label,
    faturamento: pick("faturamento"), momento: pick("momento"),
    objetivo: pick("objetivo"), socio: pick("socio"),
    investir: pick("investir"), comprometimento: pick("comprometimento"),
    minicurso: pick("minicurso"), situacao: pick("situacao"),
    renda: pick("renda"), porque: pick("porque"),
    respostas_json: r as Record<string, unknown>,
    status: s.status, origem: "api",
  });
}

function QuizPage() {
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const isGeral = workspace?.id === "all";
  const htSession = useMemo(() => getHtTeamSession(), []);
  const isSdr = htSession?.tipo === "sdr" || htSession?.tipo === "closer";

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

  const { data: extLeads = [], isLoading, error } = useQuery({
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
      return (data ?? []).map(sanitizeLead) as Lead[];
    },
    refetchInterval: 30000,
  });

  // Também puxa submissões vindas via API (/api/public/ht-quiz/submit)
  const listSubsFn = useServerFn(listHtQuizSubmissions);
  const { data: apiSubsRes } = useQuery({
    queryKey: ["quiz-api-subs"],
    queryFn: () => listSubsFn() as Promise<{ submissions: any[] }>,
    refetchInterval: 20000,
  });

  const leads: Lead[] = useMemo(() => {
    const api = (apiSubsRes?.submissions ?? []).map(apiSubToLead).filter((l) => {
      if (!fromIso && !toIso) return true;
      const t = l.data_criacao;
      if (fromIso && t < fromIso) return false;
      if (toIso && t >= toIso) return false;
      return true;
    });
    // dedupe por email/whatsapp (API tem prioridade — é o novo canal)
    const seen = new Set<string>();
    const keyOf = (l: Lead) => `${(l.email ?? "").toLowerCase()}|${(l.whatsapp ?? "").replace(/\D/g, "")}`;
    const out: Lead[] = [];
    for (const l of api) { const k = keyOf(l); if (k !== "|") seen.add(k); out.push(l); }
    for (const l of extLeads) { const k = keyOf(l); if (k === "|" || !seen.has(k)) out.push(l); }
    return out.sort((a, b) => (b.data_criacao || "").localeCompare(a.data_criacao || ""));
  }, [extLeads, apiSubsRes, fromIso, toIso]);


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
    if (!isGeral && !isSdr && workspace?.nome) {
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
  }, [leads, isGeral, isSdr, workspace, search, originFilter, reality, overrides]);

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

  const sortedLeads = useMemo(() => {
    // Leads com caixa < R$1k (peso <= 1) vão sempre pro fim da lista
    const isLow = (l: Lead) => caixaWeight(l) <= 1;
    return [...filteredLeads].sort((a, b) => {
      const lowDiff = Number(isLow(a)) - Number(isLow(b));
      if (lowDiff !== 0) return lowDiff;
      const wb = caixaWeight(b) - caixaWeight(a);
      if (wb !== 0) return wb;
      return (b.data_criacao || "").localeCompare(a.data_criacao || "");
    });
  }, [filteredLeads]);

  const grouped = useMemo(() => {
    const g: Record<OriginKey, Lead[]> = { facebook: [], instagram: [], google: [], tiktok: [], organic: [], unknown: [] };
    const fakes: Lead[] = [];
    for (const l of sortedLeads) {
      if (!leadIsReal(l)) { fakes.push(l); continue; }
      g[classifyLead(l).key].push(l);
    }
    return { ...g, fakes };
  }, [sortedLeads, overrides]);

  function refresh() {
    setLiveCount(0);
    qc.invalidateQueries({ queryKey: ["quiz-leads"] });
  }

  // Batch: busca todos os @ do banco em uma chamada e compartilha via contexto
  const allIgUsernames = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) {
      const u = (l.instagram ?? "").replace(/^@/, "").trim().toLowerCase();
      if (u) set.add(u);
    }
    return Array.from(set);
  }, [leads]);

  const listIgFn = useServerFn(listInstagramLeads);
  const { data: igDbRows = [] } = useQuery({
    queryKey: ["ig-leads-batch", allIgUsernames.length, allIgUsernames.slice(0, 50).join(",")],
    queryFn: () => listIgFn({ data: { usernames: allIgUsernames } }) as Promise<IgDbRow[]>,
    enabled: allIgUsernames.length > 0,
    staleTime: 60_000,
  });

  const [igLocalOverrides, setIgLocalOverrides] = useState<Record<string, IgDbRow>>({});
  const igMap = useMemo(() => {
    const m = new Map<string, IgDbRow>();
    for (const r of igDbRows) m.set((r.username || "").toLowerCase(), r);
    for (const [k, v] of Object.entries(igLocalOverrides)) m.set(k, v);
    return m;
  }, [igDbRows, igLocalOverrides]);

  const igCtxValue = useMemo(
    () => ({
      map: igMap,
      setLocal: (k: string, row: IgDbRow) =>
        setIgLocalOverrides((p) => ({ ...p, [k]: row })),
    }),
    [igMap],
  );

  return (
    <IgDbContext.Provider value={igCtxValue}>
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
        <StatPill active={originFilter === "instagram"} onClick={() => setOriginFilter(originFilter === "instagram" ? "all" : "instagram")} icon={<Instagram className="h-4 w-4" />} label="Instagram" value={stats.byOrigin.instagram} accent="text-pink-300" loading={isLoading} />
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
        <DragScroll className="flex gap-4 overflow-x-auto scrollbar-fancy pb-3 -mx-2 px-2 cursor-grab active:cursor-grabbing select-none">
          {ORIGIN_ORDER.map((key) => {
            const items = grouped[key] ?? [];
            if (items.length === 0) return null;
            const sample = items[0];
            const origin = classifyLead(sample);
            const Icon = origin.icon;
            return (
              <div key={key} className={`shrink-0 w-[360px] flex flex-col rounded-2xl border ${origin.border} ${origin.bg} max-h-[82vh]`}>
                <div className={`flex items-center justify-between px-4 py-3 border-b ${origin.border}`}>
                  <div className={`flex items-center gap-2 text-sm font-semibold ${origin.text}`}>
                    <Icon className="h-4 w-4" /> {key === "unknown" ? "Outros" : origin.label}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-fancy p-3 space-y-3">
                  {items.map((l) => (
                    <LeadCard key={l.id} lead={l} real={leadIsReal(l)} onToggle={(r) => setLeadReality(l.id, r)} onOpen={() => setSelectedLead(l)} compact />
                  ))}
                </div>
              </div>
            );
          })}
          {grouped.fakes.length > 0 && reality !== "real" && (
            <div className="shrink-0 w-[360px] flex flex-col rounded-2xl border border-rose-500/30 bg-rose-500/5 max-h-[82vh]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-rose-500/30">
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-300">
                  <XCircle className="h-4 w-4" /> Fakes
                </div>
                <Badge variant="outline" className="text-[10px] border-rose-500/40 text-rose-300">{grouped.fakes.length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-fancy p-3 space-y-3">
                {grouped.fakes.map((l) => (
                  <LeadCard key={l.id} lead={l} real={false} onToggle={(r) => setLeadReality(l.id, r)} onOpen={() => setSelectedLead(l)} compact />
                ))}
              </div>
            </div>
          )}
        </DragScroll>
      ) : (

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Lead</th>
                  <th className="text-left px-3 py-2">Origem</th>
                  <th className="text-left px-3 py-2">Contato</th>
                  <th className="text-left px-3 py-2">Caixa</th>
                  <th className="text-left px-3 py-2">Score</th>
                  <th className="text-left px-3 py-2">Quando</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sortedLeads.slice(0, 300).map((l) => {
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
                          <Wallet className="h-3 w-3" /> {caixaLabel(l)}
                          {caixaWeight(l) >= 4 && <span>🔥</span>}
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
    </IgDbContext.Provider>
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
    <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-semibold shadow-sm">
      <button
        type="button"
        onClick={() => onChange(real ? null : "real")}
        className={`px-3 py-1.5 flex items-center gap-1.5 transition ${real ? "bg-emerald-500/25 text-emerald-200" : "text-muted-foreground hover:bg-accent/10"}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Real
      </button>
      <button
        type="button"
        onClick={() => onChange(!real ? null : "fake")}
        className={`px-3 py-1.5 flex items-center gap-1.5 border-l border-border transition ${!real ? "bg-rose-500/25 text-rose-200" : "text-muted-foreground hover:bg-accent/10"}`}
      >
        <XCircle className="h-3.5 w-3.5" /> Fake
      </button>
    </div>
  );
}


function LeadCard({
  lead, real, onToggle, onOpen,
}: {
  lead: Lead;
  real: boolean;
  onToggle: (r: Reality | null) => void;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const origin = classifyLead(lead);
  const Icon = origin.icon;
  const letter = (lead.caixa_letra ?? "").toUpperCase();
  const isHigh = HIGH_SCORE.has(letter);
  const cleanIg = lead.instagram?.replace(/^@/, "");
  const ticket = String(ticketLabel(lead));
  const tier = TICKET_TIERS[letter];
  const weight = caixaWeight(lead);

  return (
    <div
      className={[
        "group relative flex flex-col gap-3.5 rounded-2xl border bg-card/70 backdrop-blur-sm p-5 transition-all",
        real ? "" : "opacity-60",
        isHigh
          ? "border-yellow-500/40 shadow-[0_0_40px_-12px_rgba(234,179,8,0.5)]"
          : "border-border/60 hover:border-border hover:shadow-lg",
        onOpen ? "cursor-pointer hover:bg-card/90" : "",
      ].join(" ")}
      onClick={onOpen}
    >
      {/* HEADER: nome + origem */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={`truncate text-base font-bold leading-tight ${lead.nome ? "" : "italic text-muted-foreground"}`}>
            {lead.nome || "sem nome"}
          </h3>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className={`h-3.5 w-3.5 ${origin.text}`} />
            <span className="font-medium">{origin.label}</span>
            <span className="opacity-40">·</span>
            <span>{timeAgo(lead.data_criacao)}</span>
          </div>
        </div>
        {isHigh && (
          <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/15 border border-yellow-500/40">
            <Crown className="h-4.5 w-4.5 text-yellow-400" />
          </div>
        )}
      </div>

      {/* TICKET / CAIXA */}
      {ticket !== "—" && (
        <div className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${tier?.cls ?? "bg-muted/30 border-border text-foreground"}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <Wallet className="h-4 w-4 shrink-0 opacity-70" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider opacity-60 leading-none">Caixa</div>
              <div className="text-sm font-bold leading-tight mt-1 truncate">{ticket}</div>
            </div>
          </div>
          {weight >= 5 && <span className="text-xl">🔥</span>}
          {letter && weight < 5 && (
            <span className="text-xs font-mono font-bold opacity-70">{letter}</span>
          )}
        </div>
      )}

      {/* INSTAGRAM verificado (card grande) */}
      {cleanIg && <IgRow username={cleanIg} autoVerify={weight >= 2} />}

      {/* CONTATO */}
      {(lead.email || lead.whatsapp) && (
        <div className="space-y-1.5 text-xs">
          {lead.whatsapp && (
            <div className="flex items-center gap-2 text-foreground/85">
              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="truncate font-medium">{lead.whatsapp}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
        </div>
      )}

      {/* UTM */}
      {lead.utm_campaign && (
        <div className="text-[11px] text-muted-foreground truncate border-t border-border/40 pt-2.5" title={lead.utm_campaign}>
          <TrendingUp className="inline h-3 w-3 mr-1 opacity-60" />
          {formatUtm(lead.utm_campaign)}
        </div>
      )}

      {/* FOOTER ações */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        {onOpen && (
          <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs gap-1.5 -ml-2" onClick={onOpen}>
            <Eye className="h-3.5 w-3.5" /> Respostas
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

  const initial = (lead.nome || lead.email || "?").trim().charAt(0).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden border-border/60 bg-gradient-to-b from-background to-background/95">
        {/* Header com gradiente sutil */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-border/40 bg-gradient-to-br from-accent/[0.06] via-transparent to-transparent">
          <div className="flex items-start gap-4">
            <div className="shrink-0 grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/30 text-accent text-xl font-bold shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 text-xl truncate">
                <span className="truncate">{lead.nome || <span className="italic text-muted-foreground">sem nome</span>}</span>
                {lead.caixa_letra && (
                  <Badge className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 shrink-0">
                    Caixa {lead.caixa_letra.toUpperCase()}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(lead.data_criacao)}</span>
                {lead.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>}
                {lead.whatsapp && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.whatsapp}</span>}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Corpo com scroll customizado dourado */}
        <div className="scrollbar-fancy overflow-y-auto max-h-[70vh] px-6 py-5 space-y-5">
          <div className={`rounded-xl border p-4 ${tier?.cls ?? "bg-accent/5 border-accent/30 text-accent"}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] opacity-80">
              <DollarSign className="h-3.5 w-3.5" /> Ticket / Faturamento
            </div>
            <div className="mt-1 text-2xl font-bold tracking-tight">{ticketLabel(lead)}</div>
            {lead.caixa_label && <div className="text-xs opacity-70 mt-0.5">{lead.caixa_label}</div>}
          </div>

          <div>
            <h4 className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3 flex items-center gap-2">
              <span className="h-px flex-1 bg-border/60" />
              Respostas do Quiz
              <span className="h-px flex-1 bg-border/60" />
            </h4>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-8">Nenhuma resposta registrada.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {entries.map(([k, v]) => (
                  <div
                    key={k}
                    className="group rounded-lg border border-border/60 bg-muted/10 hover:bg-muted/20 hover:border-accent/40 transition-colors p-3"
                  >
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 group-hover:text-accent/80 transition-colors">
                      {ANSWER_LABELS[k] ?? k}
                    </div>
                    <div className="text-sm font-medium mt-1 break-words leading-snug">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(lead.utm_source || lead.utm_campaign) && (
            <div>
              <h4 className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3 flex items-center gap-2">
                <span className="h-px flex-1 bg-border/60" />
                Atribuição
                <span className="h-px flex-1 bg-border/60" />
              </h4>
              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {lead.utm_source && (
                  <div title={lead.utm_source}>
                    <span className="text-muted-foreground">source:</span>{" "}
                    <span className="font-medium">{formatUtm(lead.utm_source)}</span>
                  </div>
                )}
                {lead.utm_medium && (
                  <div title={lead.utm_medium}>
                    <span className="text-muted-foreground">medium:</span>{" "}
                    <span className="font-medium">{formatUtm(lead.utm_medium)}</span>
                  </div>
                )}
                {lead.utm_campaign && (
                  <div className="col-span-2" title={lead.utm_campaign}>
                    <span className="text-muted-foreground">campaign:</span>{" "}
                    <span className="font-medium">{formatUtm(lead.utm_campaign)}</span>
                  </div>
                )}
                {lead.utm_content && (
                  <div className="col-span-2" title={lead.utm_content}>
                    <span className="text-muted-foreground">content:</span>{" "}
                    <span className="font-medium">{formatUtm(lead.utm_content)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ----- Verificação de Instagram (Bright Data + cache em banco) -----
type IgStatus = "unknown" | "checking" | "real" | "fake";
type IgProfile = {
  username: string;
  full_name?: string | null;
  biography?: string | null;
  followers?: number;
  following?: number;
  posts_count?: number;
  is_verified?: boolean;
  profile_pic_url?: string | null;
  profile_url?: string | null;
};

// Contexto: mapa compartilhado de @username -> row do banco
type IgDbRow = { username: string; verification_status?: string | null } & Partial<IgProfile>;
const IgDbContext = createContext<{
  map: Map<string, IgDbRow>;
  setLocal: (key: string, row: IgDbRow) => void;
}>({ map: new Map(), setLocal: () => {} });

function fmtIg(n?: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// ---- Fila global throttled p/ não estourar Bright Data ----
const IG_QUEUE: Array<() => void> = [];
let IG_BUSY = false;
async function igEnqueue(task: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    IG_QUEUE.push(async () => {
      try { await task(); } finally { resolve(); }
    });
    igDrain();
  });
}
async function igDrain() {
  if (IG_BUSY) return;
  const next = IG_QUEUE.shift();
  if (!next) return;
  IG_BUSY = true;
  try { await next(); } finally {
    setTimeout(() => { IG_BUSY = false; igDrain(); }, 1200);
  }
}

function IgRow({ username, autoVerify = true }: { username: string; autoVerify?: boolean }) {
  const key = (username || "").toLowerCase().trim().replace(/^@/, "").replace(/\/+$/, "");
  const isValidHandle = /^[a-z0-9._]+$/i.test(key);
  const { map, setLocal } = useContext(IgDbContext);
  const dbRow = isValidHandle ? map.get(key) : undefined;

  function rowToProfile(r: IgDbRow | undefined): IgProfile | null {
    if (!r) return null;
    return {
      username: r.username,
      full_name: r.full_name ?? null,
      biography: r.biography ?? null,
      followers: Number(r.followers) || 0,
      following: Number(r.following) || 0,
      posts_count: Number(r.posts_count) || 0,
      is_verified: !!r.is_verified,
      profile_pic_url: r.profile_pic_url ?? null,
      profile_url: r.profile_url ?? `https://instagram.com/${r.username}`,
    };
  }

  const initialStatus: IgStatus = dbRow
    ? (dbRow.verification_status === "fake" ? "fake" : "real")
    : "unknown";

  const [status, setStatus] = useState<IgStatus>(initialStatus);
  const [profile, setProfile] = useState<IgProfile | null>(rowToProfile(dbRow));
  const fetchFn = useServerFn(fetchInstagramProfile);

  // Sincroniza quando o batch do banco chega depois
  useEffect(() => {
    if (!dbRow) return;
    setStatus(dbRow.verification_status === "fake" ? "fake" : "real");
    setProfile(rowToProfile(dbRow));
  }, [dbRow]);

  async function runVerify() {
    setStatus("checking");
    try {
      const p: any = await fetchFn({ data: { input: username } });
      const prof: IgProfile = rowToProfile(p as IgDbRow) ?? {
        username,
        profile_url: `https://instagram.com/${username}`,
      };
      setLocal(key, { ...(p as IgDbRow), verification_status: "real" });
      setProfile(prof);
      setStatus("real");
    } catch {
      setLocal(key, { username: key, verification_status: "fake" });
      setStatus("fake");
    }
  }

  // Auto-verifica via fila global se ainda desconhecido (lead novo do quiz)
  useEffect(() => {
    if (status !== "unknown") return;
    if (!isValidHandle) return;
    if (!autoVerify) return; // economiza Bright Data: não verifica caixa < R$1k
    let cancelled = false;
    igEnqueue(async () => { if (!cancelled) await runVerify(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, status, isValidHandle, autoVerify]);

  async function verify(e: React.MouseEvent) {
    e.stopPropagation();
    if (status === "checking") return;
    await runVerify();
    if (status !== "fake") toast.success(`@${username} verificado ✓`);
  }



  if (status === "real" && profile) {
    return (
      <div className="mt-1 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.02] p-3 space-y-3">
        <div className="flex items-start gap-3">
          {profile.profile_pic_url ? (
            <img
              src={`/api/public/ig-image?u=${encodeURIComponent(profile.profile_pic_url)}`}
              alt={profile.username}
              className="h-16 w-16 rounded-full object-cover border-2 border-emerald-500/60 bg-pink-500/10 shrink-0"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                el.onerror = null;
                el.replaceWith(Object.assign(document.createElement("div"), {
                  className: "h-16 w-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold border-2 border-emerald-500/60 shrink-0",
                  textContent: (profile.username?.[0] || "?").toUpperCase(),
                }));
              }}
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold border-2 border-emerald-500/60 shrink-0">
              {(profile.username?.[0] || "?").toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-emerald-200">
                @{profile.username}
              </span>
              {profile.is_verified && <ShieldCheck className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
            </div>
            {profile.full_name && (
              <div className="truncate text-xs text-foreground/80 mt-0.5">{profile.full_name}</div>
            )}
            <div className="flex gap-3 text-[11px] text-muted-foreground mt-1.5">
              <span><b className="text-foreground">{fmtIg(profile.followers)}</b> seg</span>
              <span><b className="text-foreground">{fmtIg(profile.following)}</b> seg.</span>
              <span><b className="text-foreground">{fmtIg(profile.posts_count)}</b> posts</span>
            </div>
          </div>
        </div>

        {profile.biography && (
          <p className="text-[11px] text-foreground/70 leading-snug line-clamp-2 border-l-2 border-emerald-500/40 pl-2">
            {profile.biography}
          </p>
        )}

        <a
          href={profile.profile_url || `https://instagram.com/${username}`}
          target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white text-xs font-semibold py-2 transition shadow-sm"
        >
          <Instagram className="h-3.5 w-3.5" />
          Visitar perfil
        </a>
      </div>
    );
  }


  const color =
    status === "fake" ? "text-rose-400 line-through"
    : "text-pink-400";

  return (
    <div className="flex items-center gap-1.5">
      <Instagram className={`h-3 w-3 shrink-0 ${color}`} />
      <span className={`truncate text-xs ${color}`}>@{username}</span>
      {status === "fake" && (
        <Badge className="h-4 px-1 text-[9px] bg-rose-500/20 text-rose-300 border-rose-500/40">
          <ShieldAlert className="h-2.5 w-2.5 mr-0.5" /> fake
        </Badge>
      )}
      {status !== "fake" && (
        <button
          type="button"
          onClick={verify}
          className="ml-auto text-[9px] text-muted-foreground hover:text-accent transition flex items-center gap-0.5"
          title="Verificar via Bright Data"
        >
          {status === "checking" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "checar"}
        </button>
      )}
    </div>
  );
}

