import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, TrendingUp, DollarSign, Facebook, RefreshCw, Search, Radio,
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
    case "today": return d.toISOString();
    case "yesterday": { const y = new Date(d); y.setDate(y.getDate() - 1); return y.toISOString(); }
    case "7d": { const x = new Date(d); x.setDate(x.getDate() - 7); return x.toISOString(); }
    case "30d": { const x = new Date(d); x.setDate(x.getDate() - 30); return x.toISOString(); }
    case "90d": { const x = new Date(d); x.setDate(x.getDate() - 90); return x.toISOString(); }
    case "all": return null;
  }
}

function QuizPage() {
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const isGeral = workspace?.id === "all";

  const [period, setPeriod] = useState<Period>("7d");
  const [search, setSearch] = useState("");
  const [onlyFb, setOnlyFb] = useState(false);
  const [liveCount, setLiveCount] = useState(0);

  const fromIso = periodToFrom(period);

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ["quiz-leads", period, onlyFb],
    queryFn: async () => {
      let q = quizSb
        .from("leads")
        .select("*")
        .order("data_criacao", { ascending: false })
        .limit(1000);
      if (fromIso) q = q.gte("data_criacao", fromIso);
      if (onlyFb) q = q.not("fbc", "is", null);
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, () => {
        setLiveCount((n) => n + 1);
        qc.invalidateQueries({ queryKey: ["quiz-leads"] });
      })
      .subscribe();
    return () => { quizSb.removeChannel(ch); };
  }, [qc]);

  // Optional: scope by workspace if a UTM matches operation name
  const scopedLeads = useMemo(() => {
    let rows = leads;
    if (!isGeral && workspace?.nome) {
      const w = workspace.nome.toLowerCase();
      rows = rows.filter(
        (l) =>
          (l.utm_campaign ?? "").toLowerCase().includes(w) ||
          (l.utm_source ?? "").toLowerCase().includes(w) ||
          (l.utm_content ?? "").toLowerCase().includes(w),
      );
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
  }, [leads, isGeral, workspace, search]);

  const stats = useMemo(() => {
    const total = scopedLeads.length;
    const withFb = scopedLeads.filter((l) => l.fbc || l.fbp).length;
    const withGoogle = scopedLeads.filter((l) => l.gclid).length;
    const scoreAlto = scopedLeads.filter((l) => ["E", "F", "G"].includes((l.caixa_letra ?? "").toUpperCase())).length;
    const fbRate = total > 0 ? (withFb / total) * 100 : 0;
    return { total, withFb, withGoogle, scoreAlto, fbRate };
  }, [scopedLeads]);

  function refresh() {
    setLiveCount(0);
    qc.invalidateQueries({ queryKey: ["quiz-leads"] });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Quiz · Leads</h1>
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-400">
              <Radio className="h-3 w-3 animate-pulse" /> Tempo real
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {isGeral ? "Todos os leads do quiz" : `Filtrado por operação · ${workspace?.nome}`}
            {liveCount > 0 && ` · ${liveCount} novo${liveCount > 1 ? "s" : ""} desde a última atualização`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="yesterday">Ontem</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={onlyFb ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyFb((v) => !v)}
          >
            <Facebook className="mr-1.5 h-4 w-4" /> Só Facebook
          </Button>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardContent className="p-4 text-sm text-rose-300">
            Erro ao consultar API: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total de leads" value={stats.total.toLocaleString("pt-BR")} loading={isLoading} />
        <StatCard icon={<Facebook className="h-4 w-4" />} label="Com tracking FB" value={`${stats.withFb.toLocaleString("pt-BR")} (${stats.fbRate.toFixed(1)}%)`} loading={isLoading} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Com Google (gclid)" value={stats.withGoogle.toLocaleString("pt-BR")} loading={isLoading} />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Score alto (E/F/G)" value={stats.scoreAlto.toLocaleString("pt-BR")} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leads ({scopedLeads.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          {scopedLeads.length === 0 && !isLoading ? (
            <p className="text-sm text-muted-foreground">Nenhum lead no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>UTM</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-center">FB</TableHead>
                  <TableHead className="text-center">Google</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedLeads.slice(0, 200).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.data_criacao).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{l.nome ?? "—"}</div>
                      {l.instagram && <div className="text-[11px] text-muted-foreground">@{l.instagram.replace(/^@/, "")}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{l.email ?? "—"}</div>
                      <div className="text-muted-foreground">{l.whatsapp ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.utm_source ? <Badge variant="outline">{l.utm_source}</Badge> : <span className="text-muted-foreground">—</span>}
                      {l.utm_campaign && <div className="text-muted-foreground mt-1 max-w-[180px] truncate">{l.utm_campaign}</div>}
                    </TableCell>
                    <TableCell>
                      {l.caixa_letra ? (
                        <Badge className="font-mono">{l.caixa_letra}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {l.fbc || l.fbp ? <span className="text-emerald-400">✓</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {l.gclid ? <span className="text-emerald-400">✓</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {scopedLeads.length > 200 && (
            <p className="mt-3 text-xs text-muted-foreground">Mostrando 200 de {scopedLeads.length} — refine o filtro pra ver mais.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          {icon} {label}
        </div>
        <div className="text-2xl font-bold mt-2 tabular-nums">{loading ? "…" : value}</div>
      </CardContent>
    </Card>
  );
}
