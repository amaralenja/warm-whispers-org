import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Workflow, Plus, Trash2, Power, PowerOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listFlows, createFlow, deleteFlow, saveFlow } from "@/lib/flow-engine.functions";
import { useWorkspace } from "@/lib/workspace-context";

export const Route = createFileRoute("/_authenticated/flows")({
  component: FlowsListPage,
});

function FlowsListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { workspace, operacoes } = useWorkspace();
  const listFn = useServerFn(listFlows);
  const createFn = useServerFn(createFlow);
  const deleteFlowFn = useServerFn(deleteFlow);
  const saveFn = useServerFn(saveFlow);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [op, setOp] = useState<string>(workspace.id === "all" ? "" : workspace.id);

  const { data: flows = [] } = useQuery({
    queryKey: ["wa-flows"],
    queryFn: () => listFn(),
  });

  const createMut = useMutation({
    mutationFn: (v: { nome: string; operacao_id: string | null }) => createFn({ data: v }),
    onSuccess: (r: any) => {
      toast.success("Fluxo criado");
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
      setOpen(false);
      setName("");
      navigate({ to: "/flows/$flowId", params: { flowId: r.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFlowFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Fluxo removido");
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => saveFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-flows"] }),
  });

  const filtered = (flows as any[]).filter((f) =>
    workspace.id === "all" ? true : f.operacao_id === workspace.id
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Workflow className="h-6 w-6 text-emerald-500" /> Fluxos
          </h1>
          <p className="text-sm text-muted-foreground">
            Crie automações conectando blocos visuais. Disparadas por gatilhos (palavra-chave, nova conversa, etc).
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
              <Plus className="h-4 w-4 mr-2" /> Novo fluxo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo fluxo</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Boas-vindas" />
              </div>
              <div className="space-y-1.5">
                <Label>Operação (opcional)</Label>
                <Select value={op} onValueChange={setOp}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {operacoes.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!name.trim() || createMut.isPending}
                onClick={() => createMut.mutate({ nome: name.trim(), operacao_id: op || null })}
              >Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          Nenhum fluxo criado ainda. Clique em <strong>Novo fluxo</strong> pra começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f: any) => {
            const triggers = f.wa_flow_triggers ?? [];
            return (
              <div key={f.id} className="border border-border rounded-lg p-4 bg-card hover:border-emerald-500/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{f.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(f.nodes?.length ?? 0)} nós · {(f.edges?.length ?? 0)} conexões
                    </p>
                  </div>
                  <Badge className={f.ativo ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                    {f.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {triggers.length === 0 && <Badge variant="outline" className="text-xs">Sem gatilho</Badge>}
                  {triggers.map((t: any) => (
                    <Badge key={t.id} variant="outline" className="text-xs">
                      {t.tipo === "keyword" ? `🔑 ${t.valor}` : t.tipo === "new_conversation" ? "🆕 Nova conversa" : t.tipo === "any_message" ? "💬 Qualquer msg" : "✋ Manual"}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/flows/$flowId" params={{ flowId: f.id }}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                    </Link>
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => toggleMut.mutate({ id: f.id, ativo: !f.ativo })}
                  >
                    {f.ativo ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => { if (confirm("Remover fluxo?")) delMut.mutate(f.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
