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
  Loader2,
  Tag,
  MessageCircle,
  Sparkles,
  X,
  QrCode,
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

function statusPill(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500 ring-1 ring-emerald-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Conectado
      </span>
    );
  }
  if (s === "pending" || s === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500 ring-1 ring-amber-500/30">
        <Clock className="h-3 w-3" /> Aguardando conexão
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
      <XCircle className="h-3 w-3" /> Inativo
    </span>
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
  const [justCreated, setJustCreated] = useState<EvoChannel | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: () => listFn(),
    refetchInterval: 15000,
  });

  const [quotaError, setQuotaError] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: { name: string; operacaoId: string }) => createFn({ data: vars }),
    onSuccess: (ch) => {
      toast.success("Conexão criada!");
      setName("");
      setOpen(false);
      setJustCreated(ch);
      setQuotaError(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
    onError: (e: any) => {
      console.error("[whatsapp:create]", e);
      if (e?.message === "EVOHUB_QUOTA_EXCEEDED") {
        setQuotaError(true);
        setOpen(false);
        toast.error("Limite de conexões da EvoHub atingido");
        return;
      }
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

  const connectedCount = channels.filter((c) => (c.status || "").toLowerCase() === "active").length;
  const pendingCount = channels.filter((c) => {
    const s = (c.status || "").toLowerCase();
    return s === "pending" || s === "connecting";
  }).length;

  function opLabel(id: string | null) {
    if (!id) return "Sem operação";
    return operacoes.find((o) => o.id === id)?.nome ?? id;
  }
  function opAccent(id: string | null) {
    if (!id) return null;
    return operacoes.find((o) => o.id === id)?.accent ?? null;
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-500/5 via-background to-background">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-6">
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <MessageCircle className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Conecte números via EvoHub (WhatsApp Business Cloud API).{" "}
                  {isGeral
                    ? "Mostrando todas as operações."
                    : `Filtrado por "${workspace.nome}".`}
                </p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div className="hidden md:flex gap-2 mr-2">
                <div className="rounded-xl bg-card border border-border px-3 py-2 text-center min-w-[80px]">
                  <div className="text-lg font-bold text-emerald-500">{connectedCount}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ativos</div>
                </div>
                <div className="rounded-xl bg-card border border-border px-3 py-2 text-center min-w-[80px]">
                  <div className="text-lg font-bold text-amber-500">{pendingCount}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Pendentes</div>
                </div>
                <div className="rounded-xl bg-card border border-border px-3 py-2 text-center min-w-[80px]">
                  <div className="text-lg font-bold text-foreground">{channels.length}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
                </div>
              </div>
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
                <RotateCw className="h-4 w-4 mr-2" /> Webhook
              </Button>

              <Dialog
                open={open}
                onOpenChange={(v) => {
                  setOpen(v);
                  if (v) {
                    const fallback = isGeral ? operacoes[0]?.id ?? "" : workspace.id;
                    setNewOp(fallback);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-md shadow-emerald-500/30"
                  >
                    <Plus className="h-4 w-4 mr-2" /> Nova conexão
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      Nova conexão WhatsApp
                    </DialogTitle>
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
                      onClick={() => {
                        if (!name.trim()) return toast.error("Informe o nome da conexão");
                        if (!newOp) return toast.error("Selecione uma operação");
                        createMut.mutate({ name: name.trim(), operacaoId: newOp });
                      }}
                      disabled={createMut.isPending}
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
        </div>

        {quotaError && (
          <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-background p-5 shadow-lg shadow-amber-500/10 animate-in fade-in slide-in-from-top-2">
            <button
              onClick={() => setQuotaError(false)}
              className="absolute top-3 right-3 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3 pr-8">
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 ring-2 ring-amber-500/40 flex items-center justify-center shrink-0">
                <XCircle className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground">Limite EvoHub excedido</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Sua conta EvoHub atingiu o limite de conexões WhatsApp do plano atual. Pra criar uma nova, libere um slot removendo uma conexão existente, ou faça upgrade do plano no painel da EvoHub.
                </p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open("https://app.evohub.ai", "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir painel EvoHub
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Just-created highlight card */}
        {justCreated && (
          <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-background p-6 shadow-xl shadow-emerald-500/10 animate-in fade-in slide-in-from-top-4">
            <button
              onClick={() => setJustCreated(null)}
              className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 ring-2 ring-emerald-500/40 flex items-center justify-center shrink-0">
                <QrCode className="h-7 w-7 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-[280px]">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs uppercase tracking-wider font-semibold text-emerald-500">
                    Conexão criada
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mt-1">{justCreated.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Abre o link da EvoHub pra fazer login no Meta e vincular o número. Depois volta aqui — o status atualiza sozinho.
                </p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className="bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/30"
                    onClick={() => window.open(justCreated.connectUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" /> Abrir link de conexão
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(justCreated.connectUrl);
                      toast.success("Link copiado");
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Copiar link
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error)?.message ?? "Erro ao carregar conexões"}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-16 text-center text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin mx-auto" />
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-emerald-500/30 bg-card/50 p-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 mx-auto mb-4 flex items-center justify-center">
              <MessageCircle className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Nenhuma conexão por aqui ainda
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {isGeral
                ? 'Clica em "Nova conexão" pra começar a receber e mandar mensagens.'
                : `Nenhum número vinculado à operação "${workspace.nome}".`}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {channels.map((ch) => {
              const phone = ch.metadata?.meta_connection?.phone_number;
              const display = ch.metadata?.meta_connection?.display_name;
              const accent = opAccent(ch.operacaoId);
              const isActive = (ch.status || "").toLowerCase() === "active";
              return (
                <div
                  key={ch.id}
                  className={`group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:shadow-lg ${
                    isActive
                      ? "border-emerald-500/30 hover:border-emerald-500/60 hover:shadow-emerald-500/10"
                      : "border-border hover:border-foreground/20"
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
                  )}
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center ${
                        isActive
                          ? "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-500/30"
                          : "bg-muted"
                      }`}
                    >
                      <MessageCircle
                        className={`h-6 w-6 ${isActive ? "text-white" : "text-muted-foreground"}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-foreground truncate">{ch.name}</h3>
                        {statusPill(ch.status)}
                      </div>
                      {phone ? (
                        <p className="text-sm text-foreground/80 mt-1 font-medium">
                          {display ? `${display} · ` : ""}
                          {phone}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1 italic">
                          Aguardando login no Meta…
                        </p>
                      )}
                      <div className="mt-2">
                        <Badge
                          variant="outline"
                          className={`gap-1 ${
                            accent ? `${accent.bg} ${accent.text} ${accent.border}` : ""
                          }`}
                        >
                          <Tag className="h-3 w-3" /> {opLabel(ch.operacaoId)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border/60 flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => window.open(ch.connectUrl, "_blank")}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(ch.connectUrl);
                        toast.success("Link copiado");
                      }}
                      title="Copiar link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Select
                      value={ch.operacaoId ?? ""}
                      onValueChange={(v) =>
                        setOpMut.mutate({ id: ch.id, operacaoId: v, currentMetadata: ch.metadata })
                      }
                    >
                      <SelectTrigger className="h-9 w-[130px] text-xs">
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
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(`Remover conexão "${ch.name}"?`)) deleteMut.mutate(ch.id);
                      }}
                      disabled={deleteMut.isPending}
                      title="Remover"
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
    </div>
  );
}
