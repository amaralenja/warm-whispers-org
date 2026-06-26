import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, TrendingUp, DollarSign, Phone, Settings, KeyRound, RefreshCw,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quiz")({
  component: QuizPage,
});

// ---------- Types ----------
type Expert = { id: number; nome: string; ativo: boolean; quiz_api_key: string | null };
type Period = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

type Overview = {
  total_sales: number;
  total_revenue: number;
  total_leads: number;
  total_numbers: number;
  response_rate: number;
};
type NumberItem = {
  numero?: string; nome?: string; leads?: number; vendas?: number; faturamento?: number;
  [k: string]: unknown;
};
type ApiResp<T extends string, V> = { ok: boolean; period?: { from: string; to: string } } & Record<T, V>;

const API_BASE = "https://19b67e6b-8330-4b05-a7e9-34840c33d6c1.lovableproject.com/api/public/v1";

async function apiGet<T>(path: string, key: string, period: Period, customFrom?: string, customTo?: string): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (period === "custom" && customFrom && customTo) {
    url.searchParams.set("period", "custom");
    url.searchParams.set("from", customFrom);
    url.searchParams.set("to", customTo);
  } else {
    url.searchParams.set("period", period);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

const BRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n || 0);

// ---------- Page ----------
function QuizPage() {
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const isGeral = workspace?.id === "all";

  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load experts + their keys
  const { data: experts = [], isLoading: loadingExperts } = useQuery({
    queryKey: ["experts-quiz-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experts")
        .select("id, nome, ativo, quiz_api_key")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Expert[];
    },
  });

  // Decide which experts to query
  const targetExperts = useMemo(() => {
    if (isGeral) return experts.filter((e) => e.ativo && e.quiz_api_key);
    return experts.filter((e) => e.nome === workspace?.nome && e.quiz_api_key);
  }, [experts, isGeral, workspace]);

  // Per-expert overview
  const overviewQueries = useQueries({
    queries: targetExperts.map((e) => ({
      queryKey: ["quiz-overview", e.id, period, customFrom, customTo],
      queryFn: () => apiGet<ApiResp<"overview", Overview>>("/overview", e.quiz_api_key!, period, customFrom, customTo),
      enabled: !!e.quiz_api_key && (period !== "custom" || (!!customFrom && !!customTo)),
      refetchInterval: 60000,
      retry: 0,
    })),
  });

  // Per-expert numbers
  const numbersQueries = useQueries({
    queries: targetExperts.map((e) => ({
      queryKey: ["quiz-numbers", e.id, period, customFrom, customTo],
      queryFn: () => apiGet<ApiResp<"numbers", NumberItem[]>>("/numbers", e.quiz_api_key!, period, customFrom, customTo),
      enabled: !!e.quiz_api_key && (period !== "custom" || (!!customFrom && !!customTo)),
      refetchInterval: 60000,
      retry: 0,
    })),
  });

  const isLoadingData = overviewQueries.some((q) => q.isLoading) || numbersQueries.some((q) => q.isLoading);
  const anyError = overviewQueries.find((q) => q.error)?.error || numbersQueries.find((q) => q.error)?.error;

  // Aggregate
  const aggregate = useMemo(() => {
    const acc: Overview = { total_sales: 0, total_revenue: 0, total_leads: 0, total_numbers: 0, response_rate: 0 };
    let count = 0;
    overviewQueries.forEach((q) => {
      const ov = q.data?.overview;
      if (!ov) return;
      acc.total_sales += Number(ov.total_sales) || 0;
      acc.total_revenue += Number(ov.total_revenue) || 0;
      acc.total_leads += Number(ov.total_leads) || 0;
      acc.total_numbers += Number(ov.total_numbers) || 0;
      acc.response_rate += Number(ov.response_rate) || 0;
      count++;
    });
    if (count > 0) acc.response_rate = acc.response_rate / count;
    return acc;
  }, [overviewQueries]);

  const numbersFlat = useMemo(() => {
    const rows: (NumberItem & { _expert: string })[] = [];
    numbersQueries.forEach((q, i) => {
      const items = q.data?.numbers ?? [];
      const ex = targetExperts[i];
      items.forEach((n) => rows.push({ ...n, _expert: ex?.nome ?? "" }));
    });
    return rows;
  }, [numbersQueries, targetExperts]);

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["quiz-overview"] });
    qc.invalidateQueries({ queryKey: ["quiz-numbers"] });
  }

  const missingKey = !isGeral && targetExperts.length === 0 && !loadingExperts;
  const noKeysAtAll = isGeral && targetExperts.length === 0 && !loadingExperts;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quiz</h1>
          <p className="text-sm text-muted-foreground">
            {isGeral ? "Visão geral de todas as operações" : `Operação · ${workspace?.nome}`}
            {targetExperts.length > 0 && ` · ${targetExperts.length} chave${targetExperts.length > 1 ? "s" : ""} ativa${targetExperts.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="yesterday">Ontem</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-[150px]" />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-[150px]" />
            </>
          )}
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setSettingsOpen(true)}>
            <KeyRound className="mr-1.5 h-4 w-4" /> API Keys
          </Button>
        </div>
      </div>

      {/* Empty states */}
      {missingKey && (
        <EmptyState
          title="Operação sem API key"
          message={`A operação ${workspace?.nome} ainda não tem uma chave da API do Quiz cadastrada.`}
          onConfigure={() => setSettingsOpen(true)}
        />
      )}
      {noKeysAtAll && (
        <EmptyState
          title="Nenhuma API key cadastrada"
          message="Cadastre o bearer token de pelo menos uma operação para começar a ver os dados do Quiz."
          onConfigure={() => setSettingsOpen(true)}
        />
      )}
      {anyError && (
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardContent className="p-4 text-sm text-rose-300">
            Erro ao consultar API: {String((anyError as Error).message)} — verifique se a key está correta.
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {targetExperts.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard icon={<Users className="h-4 w-4" />} label="Total de leads" value={aggregate.total_leads.toLocaleString("pt-BR")} loading={isLoadingData} />
            <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Vendas" value={aggregate.total_sales.toLocaleString("pt-BR")} loading={isLoadingData} />
            <StatCard icon={<DollarSign className="h-4 w-4" />} label="Faturamento" value={BRL(aggregate.total_revenue)} loading={isLoadingData} />
            <StatCard icon={<Phone className="h-4 w-4" />} label="Números" value={aggregate.total_numbers.toLocaleString("pt-BR")} loading={isLoadingData} />
            <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Taxa de resposta" value={`${aggregate.response_rate.toFixed(1)}%`} loading={isLoadingData} />
          </div>

          {/* Per operation breakdown (geral) */}
          {isGeral && overviewQueries.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Por operação</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operação</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Números</TableHead>
                      <TableHead className="text-right">Resp.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overviewQueries.map((q, i) => {
                      const ex = targetExperts[i];
                      const ov = q.data?.overview;
                      return (
                        <TableRow key={ex.id}>
                          <TableCell className="font-medium">{ex.nome}</TableCell>
                          <TableCell className="text-right tabular-nums">{ov?.total_leads?.toLocaleString("pt-BR") ?? (q.isLoading ? "…" : "—")}</TableCell>
                          <TableCell className="text-right tabular-nums">{ov?.total_sales?.toLocaleString("pt-BR") ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{ov ? BRL(ov.total_revenue) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{ov?.total_numbers ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{ov ? `${ov.response_rate?.toFixed(1)}%` : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Numbers list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Números ({numbersFlat.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              {numbersFlat.length === 0 && !isLoadingData ? (
                <p className="text-sm text-muted-foreground">Nenhum número no período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isGeral && <TableHead>Operação</TableHead>}
                      <TableHead>Número</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {numbersFlat.map((n, i) => (
                      <TableRow key={i}>
                        {isGeral && <TableCell><Badge variant="outline">{n._expert}</Badge></TableCell>}
                        <TableCell className="font-mono text-xs">{n.numero ?? "—"}</TableCell>
                        <TableCell>{n.nome ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(n.leads ?? 0).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(n.vendas ?? 0).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right tabular-nums">{BRL(Number(n.faturamento ?? 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ApiKeysDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        experts={experts}
        onSaved={() => qc.invalidateQueries({ queryKey: ["experts-quiz-keys"] })}
      />
    </div>
  );
}

// ---------- Helpers ----------
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

function EmptyState({ title, message, onConfigure }: { title: string; message: string; onConfigure: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <Settings className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <Button onClick={onConfigure}><KeyRound className="mr-1.5 h-4 w-4" /> Configurar API Keys</Button>
      </CardContent>
    </Card>
  );
}

function ApiKeysDialog({
  open, onClose, experts, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  experts: Expert[];
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const save = useMutation({
    mutationFn: async (payload: { id: number; key: string }) => {
      const { error } = await supabase
        .from("experts")
        .update({ quiz_api_key: payload.key || null })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("API key salva");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>API Keys do Quiz</DialogTitle>
          <DialogDescription>
            Cole o bearer token de cada operação. As métricas serão puxadas usando a key correspondente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {experts.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma operação cadastrada.</p>
          )}
          {experts.map((ex) => {
            const current = drafts[ex.id] ?? ex.quiz_api_key ?? "";
            return (
              <div key={ex.id} className="grid gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {ex.nome}
                </label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Bearer token"
                    value={current}
                    onChange={(e) => setDrafts((p) => ({ ...p, [ex.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    onClick={() => save.mutate({ id: ex.id, key: current })}
                    disabled={save.isPending}
                  >
                    Salvar
                  </Button>
                </div>
                {ex.quiz_api_key && (
                  <p className="text-[10px] text-muted-foreground">
                    Atual: ••••{ex.quiz_api_key.slice(-6)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
