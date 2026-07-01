import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, DollarSign, Wallet, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Conta = {
  id: string;
  nome: string;
  whatsapp: string | null;
  closer: string | null;
  faturamento_total: number;
  recebido: number;
  falta_receber: number;
  data_fechamento: string | null;
  previsao_pagar_restante: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
};

const fmtBRL = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
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
    const { data, error } = await supabase
      .from("ht_contas_receber")
      .select("*")
      .order("data_fechamento", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar contas");
    } else {
      setRows((data || []) as Conta[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.nome || "").toLowerCase().includes(q) ||
          (r.whatsapp || "").toLowerCase().includes(q) ||
          (r.closer || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, statusFilter, search]);

  const kpis = useMemo(() => {
    const total = filtered.reduce((s, r) => s + Number(r.faturamento_total || 0), 0);
    const recebido = filtered.reduce((s, r) => s + Number(r.recebido || 0), 0);
    const falta = filtered.reduce((s, r) => s + Number(r.falta_receber || 0), 0);
    const qtd = filtered.length;
    return { total, recebido, falta, qtd };
  }, [filtered]);

  function openNew() {
    setEditing({
      id: "",
      nome: "",
      whatsapp: "",
      closer: "",
      faturamento_total: 0,
      recebido: 0,
      falta_receber: 0,
      data_fechamento: new Date().toISOString().slice(0, 10),
      previsao_pagar_restante: null,
      status: "aberto",
      observacoes: "",
      created_at: "",
    });
    setDialogOpen(true);
  }
  function openEdit(c: Conta) {
    setEditing({ ...c });
    setDialogOpen(true);
  }

  async function save() {
    if (!editing) return;
    if (!editing.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    const payload = {
      nome: editing.nome.trim(),
      whatsapp: editing.whatsapp || null,
      closer: editing.closer || null,
      faturamento_total: Number(editing.faturamento_total || 0),
      recebido: Number(editing.recebido || 0),
      data_fechamento: editing.data_fechamento || null,
      previsao_pagar_restante: editing.previsao_pagar_restante || null,
      status:
        Number(editing.recebido || 0) >= Number(editing.faturamento_total || 0) &&
        Number(editing.faturamento_total || 0) > 0
          ? "quitado"
          : editing.status || "aberto",
      observacoes: editing.observacoes || null,
    };

    if (editing.id) {
      const { error } = await supabase
        .from("ht_contas_receber")
        .update(payload)
        .eq("id", editing.id);
      if (error) { toast.error("Erro ao salvar"); return; }
      toast.success("Conta atualizada");
    } else {
      const { error } = await supabase.from("ht_contas_receber").insert(payload);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Conta criada");
    }
    setDialogOpen(false);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remover esta conta?")) return;
    const { error } = await supabase.from("ht_contas_receber").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover"); return; }
    toast.success("Removida");
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
            Controle de pagamentos parciais e agendamentos de recebimento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar nome / whatsapp / closer"
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
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Nova conta
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
                  <th className="text-left px-4 py-3">Closer</th>
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
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Carregando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">
                    Nenhuma conta encontrada. Clique em "Nova conta" para começar.
                  </td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDate(r.data_fechamento)}</td>
                      <td className="px-4 py-3 font-medium">{r.nome}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.whatsapp || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.closer || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtBRL(r.faturamento_total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-400">{fmtBRL(r.recebido)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-400 font-semibold">{fmtBRL(r.falta_receber)}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDate(r.previsao_pagar_restante)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                          r.status === "quitado"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Edit/New */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar conta" : "Nova conta a receber"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome do cliente *</Label>
                <Input value={editing.nome}
                  onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={editing.whatsapp || ""}
                  onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })} />
              </div>
              <div>
                <Label>Closer</Label>
                <Input value={editing.closer || ""}
                  onChange={(e) => setEditing({ ...editing, closer: e.target.value })} />
              </div>
              <div>
                <Label>Faturamento total (R$)</Label>
                <Input type="number" step="0.01" value={editing.faturamento_total}
                  onChange={(e) => setEditing({ ...editing, faturamento_total: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Recebido / Sinal (R$)</Label>
                <Input type="number" step="0.01" value={editing.recebido}
                  onChange={(e) => setEditing({ ...editing, recebido: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Data de fechamento</Label>
                <Input type="date" value={editing.data_fechamento || ""}
                  onChange={(e) => setEditing({ ...editing, data_fechamento: e.target.value })} />
              </div>
              <div>
                <Label>Previsão do restante</Label>
                <Input type="date" value={editing.previsao_pagar_restante || ""}
                  onChange={(e) => setEditing({ ...editing, previsao_pagar_restante: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Observações</Label>
                <Textarea value={editing.observacoes || ""} rows={3}
                  onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} />
              </div>
              <div className="col-span-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-sm flex justify-between">
                <span className="text-muted-foreground">Falta receber:</span>
                <span className="font-semibold text-amber-400 tabular-nums">
                  {fmtBRL(Math.max(0, Number(editing.faturamento_total || 0) - Number(editing.recebido || 0)))}
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
