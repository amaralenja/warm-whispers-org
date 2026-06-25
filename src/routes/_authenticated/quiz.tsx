import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, TrendingUp, Award, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quiz")({
  component: QuizPage,
});

const QUIZ_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";

const quizClient = createClient(QUIZ_URL, QUIZ_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
});

type Lead = {
  id: string;
  data_criacao: string;
  nome: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  faturamento: string | null;
  caixa_letra: string | null;
  caixa_label: string | null;
  lead_score: number | null;
  crm_status: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  status: string | null;
};

function QuizPage() {
  const [search, setSearch] = useState("");
  const [liveCount, setLiveCount] = useState(0);

  const { data: leads = [], isLoading, refetch } = useQuery<Lead[]>({
    queryKey: ["quiz-leads"],
    queryFn: async () => {
      const { data, error } = await quizClient
        .from("leads")
        .select("id,data_criacao,nome,whatsapp,email,instagram,faturamento,caixa_letra,caixa_label,lead_score,crm_status,utm_source,utm_campaign,status")
        .order("data_criacao", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    refetchInterval: 30000,
  });

  // Realtime
  useEffect(() => {
    const ch = quizClient
      .channel("quiz-leads-stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, () => {
        setLiveCount((c) => c + 1);
        refetch();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, () => {
        refetch();
      })
      .subscribe();
    return () => {
      quizClient.removeChannel(ch);
    };
  }, [refetch]);

  const stats = useMemo(() => {
    const total = leads.length;
    const hoje = new Date().toISOString().slice(0, 10);
    const hojeCount = leads.filter((l) => (l.data_criacao ?? "").slice(0, 10) === hoje).length;
    const hot = leads.filter((l) => ["E", "F", "G"].includes((l.caixa_letra ?? "").toUpperCase())).length;
    const scoreAvg = leads.length
      ? Math.round(leads.reduce((s, l) => s + (Number(l.lead_score) || 0), 0) / leads.length)
      : 0;
    const porCaixa: Record<string, number> = {};
    leads.forEach((l) => {
      const k = (l.caixa_letra ?? "?").toUpperCase();
      porCaixa[k] = (porCaixa[k] ?? 0) + 1;
    });
    const porUtm: Record<string, number> = {};
    leads.forEach((l) => {
      const k = l.utm_source ?? "direto";
      porUtm[k] = (porUtm[k] ?? 0) + 1;
    });
    return { total, hojeCount, hot, scoreAvg, porCaixa, porUtm };
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.nome, l.email, l.whatsapp, l.instagram, l.utm_source, l.utm_campaign]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [leads, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Quiz · Leads</h1>
          <p className="text-sm text-muted-foreground">
            Dados em tempo real da API do Quiz {liveCount > 0 && <Badge variant="secondary" className="ml-2">+{liveCount} novos</Badge>}
          </p>
        </div>
        <Input
          placeholder="Buscar nome, email, whatsapp, utm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total de leads" value={stats.total} />
        <StatCard icon={<Zap className="h-4 w-4" />} label="Hoje" value={stats.hojeCount} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Hot (E/F/G)" value={stats.hot} />
        <StatCard icon={<Award className="h-4 w-4" />} label="Score médio" value={stats.scoreAvg} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Caixa</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(stats.porCaixa).sort().map(([k, v]) => (
              <Badge key={k} variant="outline" className="text-sm">
                {k}: <span className="ml-1 font-bold">{v}</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Por UTM Source</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(stats.porUtm).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => (
              <Badge key={k} variant="outline" className="text-sm">
                {k}: <span className="ml-1 font-bold">{v}</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos leads ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Caixa</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>UTM</TableHead>
                  <TableHead>CRM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 100).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {l.data_criacao ? new Date(l.data_criacao).toLocaleString("pt-BR") : "-"}
                    </TableCell>
                    <TableCell className="font-medium">{l.nome ?? "-"}</TableCell>
                    <TableCell className="text-xs">
                      <div>{l.whatsapp ?? "-"}</div>
                      <div className="text-muted-foreground">{l.email ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-xs">{l.faturamento ?? "-"}</TableCell>
                    <TableCell>
                      {l.caixa_letra && (
                        <Badge variant={["E", "F", "G"].includes(l.caixa_letra.toUpperCase()) ? "default" : "secondary"}>
                          {l.caixa_letra}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-bold">{l.lead_score ?? "-"}</TableCell>
                    <TableCell className="text-xs">
                      <div>{l.utm_source ?? "-"}</div>
                      <div className="text-muted-foreground">{l.utm_campaign ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.crm_status && <Badge variant="outline">{l.crm_status}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          {icon} {label}
        </div>
        <div className="text-2xl font-bold mt-2">{value}</div>
      </CardContent>
    </Card>
  );
}
