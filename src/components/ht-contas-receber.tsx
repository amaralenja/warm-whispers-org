import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, DollarSign, Wallet, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const QUIZ_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";
const quizSb = createClient(QUIZ_URL, QUIZ_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Conta = {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  crm_status: string | null;
  crm_valor: number | null;
  crm_valor_recebido: number | null;
  crm_data_agendamento: string | null;
  crm_data_pagamento_restante: string | null;
  crm_notas_closer: string | null;
  updated_at: string | null;
};

const fmtBRL = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function safeText(value: unknown, fallback = "—") {
  if (value == null) return fallback;
  if (["string", "number", "boolean"].includes(typeof value)) {
    const text = String(value).trim();
    return text || fallback;
  }
  if (Array.isArray(value)) {
    const text = value.map((v) => safeText(v, "")).filter(Boolean).join(", ").trim();
    return text || fallback;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["text", "value", "label", "nome", "name", "phone", "whatsapp"]) {
      if (obj[key] != null) return safeText(obj[key], fallback);
    }
  }
  return fallback;
}

function safeNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value.replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
  return 0;
}

function sanitizeConta(row: any): Conta {
  return {
    id: String(row?.id ?? crypto.randomUUID()),
    nome: safeText(row?.nome, ""),
    whatsapp: safeText(row?.whatsapp, ""),
    crm_status: safeText(row?.crm_status, ""),
    crm_valor: safeNumber(row?.crm_valor),
    crm_valor_recebido: safeNumber(row?.crm_valor_recebido),
    crm_data_agendamento: typeof row?.crm_data_agendamento === "string" ? row.crm_data_agendamento : null,
    crm_data_pagamento_restante: typeof row?.crm_data_pagamento_restante === "string" ? row.crm_data_pagamento_restante : null,
    crm_notas_closer: safeText(row?.crm_notas_closer, ""),
    updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
  };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR");
}

export function HTContasReceber() {
  const [rows, setRows] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "aberto" | "quitado">("aberto");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Conta | null>(null);

  async function load() {
    setLoading(true);
    // Puxa fechados + followup do quiz que tenham valor
    const { data, error } = await quizSb
      .from("leads")
      .select("id,nome,whatsapp,crm_status,crm_valor,crm_valor_recebido,crm_data_agendamento,crm_data_pagamento_restante,crm_notas_closer,updated_at")
      .in("crm_status", ["fechado", "followup"])
      .gt("crm_valor", 0)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("Erro ao carregar contas");
      setRows([]);
    } else {
      setRows(((data || []) as any[]).map(sanitizeConta));
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") {
      list = list.filter((r) => {
        const total = Number(r.crm_valor || 0);
        const rec = Number(r.crm_valor_recebido || 0);
        const quitado = total > 0 && rec >= total;
        return statusFilter === "quitado" ? quitado : !quitado;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          safeText(r.nome, "").toLowerCase().includes(q) ||
          safeText(r.whatsapp, "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, statusFilter, search]);

  const kpis = useMemo(() => {
    const total = filtered.reduce((s, r) => s + Number(r.crm_valor || 0), 0);
    const recebido = filtered.reduce((s, r) => s + Number(r.crm_valor_recebido || 0), 0);
    const falta = Math.max(0, total - recebido);
    return { total, recebido, falta, qtd: filtered.length };
  }, [filtered]);

  function openEdit(c: Conta) {
    setEditing({ ...c });
    setDialogOpen(true);
  }

  async function save() {
    if (!editing) return;
    const total = Number(editing.crm_valor || 0);
    const rec = Number(editing.crm_valor_recebido || 0);
    const payload = {
      crm_valor: total,
      crm_valor_recebido: rec,
      crm_data_pagamento_restante: editing.crm_data_pagamento_restante || null,
          crm_status: total > 0 && rec >= total ? "fechado" : safeText(editing.crm_status, "fechado"),
          crm_notas_closer: safeText(editing.crm_notas_closer, "") || null,
    };
    const { error } = await quizSb.from("leads").update(payload).eq("id", editing.id);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Conta atualizada");
    setDialogOpen(false);
    setEditing(null);
    load();
  }

  return (
    <div className="px-6 md:px-10 py-8 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Faturamento Total"
          value={fmtBRL(kpis.total)} sub={`${kpis.qtd} contas`} />
        <KpiCard icon={<Wallet className="h-4 w-4" />} label="Recebido (Sinal)"
          value={fmtBRL(kpis.recebido)} accent="text-emerald-400" />
        <KpiCard icon={<AlertCircle className="h-4 w-4" />} label="Falta Receber"
          value={fmtBRL(kpis.falta)} accent="text-amber-400" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="% Recebido"
          value={`${kpis.total > 0 ? Math.round((kpis.recebido / kpis.total) * 100) : 0}%`} />
      </div>

      {/* Header + Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Contas a Receber</h2>
          <p className="text-sm text-muted-foreground">
            Fechamentos e sinais recebidos · dados do CRM do Quiz
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar nome / whatsapp"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="aberto">Em aberto</SelectItem>
              <SelectItem value="quitado">Quitados</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <Card className="border-border/50 bg-card/60 backdrop-blur overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Data Fechamento</th>
                  <th className="text-left px-4 py-3">Nome</th>
                  <th className="text-left px-4 py-3">WhatsApp</th>
                  <th className="text-right px-4 py-3">Faturamento</th>
                  <th className="text-right px-4 py-3">Recebido (Sinal)</th>
                  <th className="text-right px-4 py-3">Falta Receber</th>
                  <th className="text-left px-4 py-3">Previsão Restante</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Carregando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                    Nenhuma conta encontrada.
                  </td></tr>
                ) : (
                  filtered.map((r) => {
                    const total = Number(r.crm_valor || 0);
                    const rec = Number(r.crm_valor_recebido || 0);
                    const falta = Math.max(0, total - rec);
                    const quitado = total > 0 && rec >= total;
                    return (
                      <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDate(r.crm_data_agendamento || r.updated_at)}</td>
                         <td className="px-4 py-3 font-medium">{safeText(r.nome)}</td>
                         <td className="px-4 py-3 tabular-nums text-muted-foreground">{safeText(r.whatsapp)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtBRL(total)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-400">{fmtBRL(rec)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-400 font-semibold">{fmtBRL(falta)}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDate(r.crm_data_pagamento_restante)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                            quitado ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                          }`}>
                            {quitado ? "quitado" : "aberto"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
             <DialogTitle>Editar conta — {safeText(editing?.nome)}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Faturamento total (R$)</Label>
                <Input type="number" step="0.01" value={editing.crm_valor ?? 0}
                  onChange={(e) => setEditing({ ...editing, crm_valor: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Recebido / Sinal (R$)</Label>
                <Input type="number" step="0.01" value={editing.crm_valor_recebido ?? 0}
                  onChange={(e) => setEditing({ ...editing, crm_valor_recebido: Number(e.target.value) })} />
              </div>
              <div className="col-span-2">
                <Label>Previsão do restante</Label>
                <Input type="date"
                  value={editing.crm_data_pagamento_restante?.slice(0, 10) || ""}
                  onChange={(e) => setEditing({ ...editing, crm_data_pagamento_restante: e.target.value ? `${e.target.value}T00:00:00` : null })} />
              </div>
              <div className="col-span-2">
                <Label>Notas do Closer</Label>
                 <Textarea value={safeText(editing.crm_notas_closer, "")} rows={3}
                  onChange={(e) => setEditing({ ...editing, crm_notas_closer: e.target.value })} />
              </div>
              <div className="col-span-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-sm flex justify-between">
                <span className="text-muted-foreground">Falta receber:</span>
                <span className="font-semibold text-amber-400 tabular-nums">
                  {fmtBRL(Math.max(0, Number(editing.crm_valor || 0) - Number(editing.crm_valor_recebido || 0)))}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase tracking-[0.18em]">
          {icon}{label}
        </div>
        <div className={`text-2xl font-bold mt-2 tabular-nums ${accent || ""}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
