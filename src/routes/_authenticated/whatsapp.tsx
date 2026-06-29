import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Copy,
  ExternalLink,
  Trash2,
  RotateCw,
  CheckCircle2,
  Clock,
  XCircle,
  Phone,
  Loader2,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/lib/workspace-context";
import {
  listWhatsappChannels,
  createWhatsappChannel,
  setChannelOperacao,
  deleteWhatsappChannel,
  regenerateWhatsappToken,
  type EvoChannel,
} from "@/lib/evohub.functions";
import { registerWhatsappWebhook } from "@/lib/whatsapp-chat.functions";


export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppPage,
});

function statusBadge(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "active") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Conectado
      </Badge>
    );
  }
  if (s === "pending" || s === "connecting") {
    return (
      <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 gap-1">
        <Clock className="h-3 w-3" /> Aguardando
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <XCircle className="h-3 w-3" /> Inativo
    </Badge>
  );
}

function WhatsAppPage() {
  const qc = useQueryClient();
  const { workspace, workspaces } = useWorkspace();
  const listFn = useServerFn(listWhatsappChannels);
  const createFn = useServerFn(createWhatsappChannel);
  const deleteFn = useServerFn(deleteWhatsappChannel);
  const regenFn = useServerFn(regenerateWhatsappToken);
  const setOpFn = useServerFn(setChannelOperacao);

  const isGeral = workspace.id === "all";
  const operacoes = useMemo(() => workspaces.filter((w) => w.id !== "all"), [workspaces]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [newOp, setNewOp] = useState<string>(isGeral ? "" : workspace.id);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: () => listFn(),
    refetchInterval: 15000,
  });

  const createMut = useMutation({
    mutationFn: (vars: { name: string; operacaoId: string }) =>
      createFn({ data: vars }),
    onSuccess: (ch) => {
      toast.success("Conexão criada! Abrindo link da EvoHub…");
      setName("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
      if (ch?.connectUrl) {
        window.open(ch.connectUrl, "_blank", "noopener,noreferrer");
      }
    },
    onError: (e: any) => {
      console.error("[whatsapp:create]", e);
      toast.error(e?.message ?? "Erro ao criar conexão");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Conexão removida");
      qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  const regenMut = useMutation({
    mutationFn: (id: string) => regenFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Novo link gerado");
      qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao regenerar"),
  });

  const setOpMut = useMutation({
    mutationFn: (vars: { id: string; operacaoId: string; currentMetadata: any }) =>
      setOpFn({ data: vars }),
    onSuccess: () => {
      toast.success("Operação atualizada");
      qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar operação"),
  });

  const allChannels = (data ?? []) as EvoChannel[];
  const channels = isGeral
    ? allChannels
    : allChannels.filter((c) => c.operacaoId === workspace.id);

  function opLabel(id: string | null) {
    if (!id) return "Sem operação";
    return operacoes.find((o) => o.id === id)?.nome ?? id;
  }
  function opAccent(id: string | null) {
    if (!id) return null;
    return operacoes.find((o) => o.id === id)?.accent ?? null;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Phone className="h-6 w-6 text-emerald-500" /> WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">
            Conecte números via EvoHub (WhatsApp Business Cloud API).{" "}
            {isGeral
              ? "Mostrando todos os números de todas as operações."
              : `Mostrando apenas números da operação "${workspace.nome}".`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const url = `${window.location.origin}/api/public/whatsapp/webhook`;
                const res = await registerWhatsappWebhook({ data: { webhookUrl: url } });
                toast.success(res.message ?? "Webhook configurado");
              } catch (e: any) {
                toast.error(e?.message ?? "Erro ao configurar webhook");
              }
            }}
          >
            <RotateCw className="h-4 w-4 mr-2" /> Configurar Webhook
          </Button>

          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (v) setNewOp(isGeral ? "" : workspace.id);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                <Plus className="h-4 w-4 mr-2" /> Nova conexão
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova conexão WhatsApp</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="ch-name">Nome da conexão</Label>
                  <Input
                    id="ch-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Atendimento Principal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Operação</Label>
                  <Select value={newOp} onValueChange={setNewOp}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a operação" />
                    </SelectTrigger>
                    <SelectContent>
                      {operacoes.map((op) => (
                        <SelectItem key={op.id} value={op.id}>
                          {op.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Esse número vai ficar vinculado à operação selecionada.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => createMut.mutate({ name, operacaoId: newOp })}
                  disabled={!name.trim() || !newOp || createMut.isPending}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error)?.message ?? "Erro ao carregar conexões"}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <Phone className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {isGeral
              ? 'Nenhuma conexão ainda. Clica em "Nova conexão" pra começar.'
              : `Nenhum número vinculado à operação "${workspace.nome}".`}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {channels.map((ch) => {
            const phone = ch.metadata?.meta_connection?.phone_number;
            const display = ch.metadata?.meta_connection?.display_name;
            const accent = opAccent(ch.operacaoId);
            return (
              <div
                key={ch.id}
                className="rounded-lg border border-border bg-card p-4 flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate">{ch.name}</h3>
                    {statusBadge(ch.status)}
                    <Badge
                      variant="outline"
                      className={`gap-1 ${accent ? `${accent.bg} ${accent.text} ${accent.border}` : ""}`}
                    >
                      <Tag className="h-3 w-3" /> {opLabel(ch.operacaoId)}
                    </Badge>
                  </div>
                  {phone && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {display ? `${display} · ` : ""}
                      {phone}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[420px] inline-block">
                      {ch.connectUrl}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(ch.connectUrl);
                        toast.success("Link copiado");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(ch.connectUrl, "_blank")}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <Select
                    value={ch.operacaoId ?? ""}
                    onValueChange={(v) =>
                      setOpMut.mutate({ id: ch.id, operacaoId: v, currentMetadata: ch.metadata })
                    }
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <SelectValue placeholder="Operação" />
                    </SelectTrigger>
                    <SelectContent>
                      {operacoes.map((op) => (
                        <SelectItem key={op.id} value={op.id}>
                          {op.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => regenMut.mutate(ch.id)}
                    disabled={regenMut.isPending}
                    title="Gerar novo link (invalida o anterior)"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Remover conexão "${ch.name}"?`)) deleteMut.mutate(ch.id);
                    }}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
