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
  lead_score: number | null;
  faturamento: string | null;
  status: string | null;
  crm_status: string | null;
  origem: string | null;
};

type Period = "today" | "yesterday" | "7d" | "30d" | "90d" | "all";

function periodToFrom(p: Period): string | null {
  const now = new Date();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  switch (p) {
    case "today":
      return d.toISOString();
    case "yesterday": {
      const y = new Date(d);
      y.setDate(y.getDate() - 1);
      return y.toISOString();
    }
    case "7d": {
      const x = new Date(d);
      x.setDate(x.getDate() - 7);
      return x.toISOString();
    }
    case "30d": {
      const x = new Date(d);
      x.setDate(x.getDate() - 30);
      return x.toISOString();
    }
    case "90d": {
      const x = new Date(d);
      x.setDate(x.getDate() - 90);
      return x.toISOString();
    }
    case "all":
      return null;
  }
}

// ---------- Lead Classification ----------
type LeadOrigin = {
  key: "facebook" | "google" | "organic" | "tiktok" | "unknown";
  label: string;
  icon: typeof Facebook;
  // Tailwind classes
  ring: string;
  bg: string;
  text: string;
  glow: string;
};

function classifyLead(l: Lead): LeadOrigin {
  const src = (l.utm_source ?? "").toLowerCase();
  if (l.fbc || l.fbp || l.fbclid || src.includes("fb") || src.includes("facebook") || src.includes("ig") || src.includes("instagram")) {
    return {
      key: "facebook",
      label: "Facebook Ads",
      icon: Facebook,
      ring: "ring-blue-500/40",
      bg: "bg-blue-500/10",
      text: "text-blue-300",
      glow: "shadow-[0_0_24px_-8px_rgba(59,130,246,0.5)]",
    };
  }
  if (l.gclid || src.includes("google") || src.includes("gad")) {
    return {
      key: "google",
      label: "Google Ads",
      icon: Megaphone,
      ring: "ring-amber-500/40",
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      glow: "shadow-[0_0_24px_-8px_rgba(245,158,11,0.5)]",
    };
  }
  if (src.includes("tiktok") || src.includes("tt")) {
    return {
      key: "tiktok",
      label: "TikTok",
      icon: Flame,
      ring: "ring-pink-500/40",
      bg: "bg-pink-500/10",
      text: "text-pink-300",
      glow: "shadow-[0_0_24px_-8px_rgba(236,72,153,0.5)]",
    };
  }
  if (src && src !== "(direct)" && src !== "direct") {
    return {
      key: "unknown",
      label: src,
      icon: Megaphone,
      ring: "ring-violet-500/40",
      bg: "bg-violet-500/10",
      text: "text-violet-300",
      glow: "shadow-[0_0_24px_-8px_rgba(139,92,246,0.4)]",
    };
  }
  return {
    key: "organic",
    label: "Orgânico",
    icon: Leaf,
    ring: "ring-emerald-500/30",
    bg: "bg-emerald-500/5",
    text: "text-emerald-300",
    glow: "shadow-[0_0_24px_-10px_rgba(16,185,129,0.4)]",
  };
}

const HIGH_SCORE = new Set(["E", "F", "G"]);
const MID_SCORE = new Set(["C", "D"]);

function hasUseful(l: Lead): boolean {
  // Mostra só quem preencheu pelo menos um campo de contato real
  return !!(l.nome || l.email || l.whatsapp || l.instagram);
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

  const [period, setPeriod] = useState<Period>("7d");
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<LeadOrigin["key"] | "all">("all");
  const [liveCount, setLiveCount] = useState(0);

  const fromIso = periodToFrom(period);

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ["quiz-leads", period],
    queryFn: async () => {
      let q = quizSb
        .from("leads")
        .select("*")
        .order("data_criacao", { ascending: false })
        .limit(1000);
      if (fromIso) q = q.gte("data_criacao", fromIso);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    refetchInterval: 30000,
  });

  // Realtime
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

  // Hide empty leads + workspace scope + search + origin filter
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
    if (originFilter !== "all") {
      rows = rows.filter((l) => classifyLead(l).key === originFilter);
    }
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
  }, [leads, isGeral, workspace, search, originFilter]);

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const byOrigin = { facebook: 0, google: 0, organic: 0, tiktok: 0, unknown: 0 };
    let high = 0;
    for (const l of filteredLeads) {
      byOrigin[classifyLead(l).key]++;
      if (HIGH_SCORE.has((l.caixa_letra ?? "").toUpperCase())) high++;
    }
    return { total, byOrigin, high };
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
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Tudo</SelectItem>
              </SelectContent>
            </Select>
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

      {/* STATS — clickable filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatPill
          active={originFilter === "all"}
          onClick={() => setOriginFilter("all")}
          icon={<Users className="h-4 w-4" />}
          label="Total"
          value={stats.total}
          accent="text-foreground"
          loading={isLoading}
        />
        <StatPill
          active={originFilter === "facebook"}
          onClick={() => setOriginFilter(originFilter === "facebook" ? "all" : "facebook")}
          icon={<Facebook className="h-4 w-4" />}
          label="Facebook"
          value={stats.byOrigin.facebook}
          accent="text-blue-300"
          loading={isLoading}
        />
        <StatPill
          active={originFilter === "google"}
          onClick={() => setOriginFilter(originFilter === "google" ? "all" : "google")}
          icon={<Megaphone className="h-4 w-4" />}
          label="Google"
          value={stats.byOrigin.google}
          accent="text-amber-300"
          loading={isLoading}
        />
        <StatPill
          active={originFilter === "organic"}
          onClick={() => setOriginFilter(originFilter === "organic" ? "all" : "organic")}
          icon={<Leaf className="h-4 w-4" />}
          label="Orgânico"
          value={stats.byOrigin.organic}
          accent="text-emerald-300"
          loading={isLoading}
        />
        <StatPill
          icon={<Crown className="h-4 w-4" />}
          label="Score alto (E/F/G)"
          value={stats.high}
          accent="text-yellow-300"
          loading={isLoading}
        />
      </div>

      {/* LEAD GRID */}
      {filteredLeads.length === 0 && !isLoading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum lead com dados de contato no período selecionado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredLeads.slice(0, 120).map((l) => (
            <LeadCard key={l.id} lead={l} />
          ))}
        </div>
      )}

      {filteredLeads.length > 120 && (
        <p className="text-center text-xs text-muted-foreground">
          Mostrando 120 de {filteredLeads.length} · refine o filtro pra ver mais.
        </p>
      )}
    </div>
  );
}

function StatPill({
  icon,
  label,
  value,
  accent,
  loading,
  active,
  onClick,
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
        active
          ? "border-accent/60 bg-accent/10 shadow-[0_0_30px_-10px_hsl(var(--accent))]"
          : "border-border bg-card hover:border-accent/30",
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

function LeadCard({ lead }: { lead: Lead }) {
  const origin = classifyLead(lead);
  const Icon = origin.icon;
  const letter = (lead.caixa_letra ?? "").toUpperCase();
  const isHigh = HIGH_SCORE.has(letter);
  const isMid = MID_SCORE.has(letter);
  const cleanIg = lead.instagram?.replace(/^@/, "");

  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5",
        "ring-1",
        origin.ring,
        origin.glow,
        isHigh ? "border-yellow-500/40" : "border-border",
      ].join(" ")}
    >
      {/* origin stripe */}
      <div className={`absolute left-0 top-0 h-full w-1 ${origin.bg}`} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {lead.nome ? (
              <h3 className="truncate text-base font-semibold">{lead.nome}</h3>
            ) : (
              <h3 className="truncate text-sm italic text-muted-foreground">sem nome</h3>
            )}
            {isHigh && (
              <Badge className="gap-1 bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/20">
                <Crown className="h-3 w-3" /> {letter}
              </Badge>
            )}
            {isMid && (
              <Badge variant="outline" className="font-mono text-muted-foreground">
                {letter}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{timeAgo(lead.data_criacao)}</span>
            <span>·</span>
            <span>{new Date(lead.data_criacao).toLocaleDateString("pt-BR")}</span>
          </div>
        </div>

        <Badge
          variant="outline"
          className={`gap-1 border-current/30 ${origin.text} ${origin.bg}`}
        >
          <Icon className="h-3 w-3" /> {origin.label}
        </Badge>
      </div>

      {/* contact */}
      <div className="mt-3 space-y-1 text-sm">
        {lead.email && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        {lead.whatsapp && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate">{lead.whatsapp}</span>
          </div>
        )}
        {cleanIg && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Instagram className="h-3.5 w-3.5 shrink-0 text-pink-400" />
            <span className="truncate">@{cleanIg}</span>
          </div>
        )}
      </div>

      {/* utm + tracking */}
      {(lead.utm_campaign || lead.utm_content || lead.fbc || lead.fbp || lead.gclid) && (
        <div className="mt-3 flex flex-wrap gap-1 border-t border-border/50 pt-3">
          {lead.utm_campaign && (
            <Badge variant="outline" className="max-w-[200px] truncate text-[10px]">
              <TrendingUp className="mr-1 h-2.5 w-2.5" /> {lead.utm_campaign}
            </Badge>
          )}
          {(lead.fbc || lead.fbp) && (
            <Badge variant="outline" className="text-[10px] text-blue-300">
              FB tracking ✓
            </Badge>
          )}
          {lead.gclid && (
            <Badge variant="outline" className="text-[10px] text-amber-300">
              gclid ✓
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
