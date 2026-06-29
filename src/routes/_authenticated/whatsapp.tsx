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
  Clock,
  XCircle,
  Loader2,
  Tag,
  MessageCircle,
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
  getWhatsappQuality,
  type EvoChannel,
  type WhatsappQuality,
} from "@/lib/evohub.functions";
import { registerWhatsappWebhook } from "@/lib/whatsapp-chat.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppPage,
});

function statusPill(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Conectado
      </span>
    );
  }
  if (s === "pending" || s === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Clock className="h-3 w-3" /> Aguardando
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
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
    <div className="min-h-full bg-background">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground tracking-tight">WhatsApp</h1>
              <p className="text-sm text-muted-foreground">
                Conecte números via EvoHub.{" "}
                {isGeral ? "Todas as operações." : `Filtrado por "${workspace.nome}".`}
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="hidden md:flex gap-4 mr-2 text-sm">
              <div className="text-center">
                <div className="font-semibold text-foreground">{connectedCount}</div>
                <div className="text-[11px] text-muted-foreground">Ativos</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-foreground">{pendingCount}</div>
                <div className="text-[11px] text-muted-foreground">Pendentes</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-foreground">{channels.length}</div>
                <div className="text-[11px] text-muted-foreground">Total</div>
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
                <Button size="sm">
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
                    onClick={() => {
                      if (!name.trim()) return toast.error("Informe o nome da conexão");
                      if (!newOp) return toast.error("Selecione uma operação");
                      createMut.mutate({ name: name.trim(), operacaoId: newOp });
                    }}
                    disabled={createMut.isPending}
                  >
                    {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>


        {quotaError && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-4">
            <button
              onClick={() => setQuotaError(false)}
              className="float-right h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-foreground text-sm">Limite EvoHub excedido</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Sua conta EvoHub atingiu o limite de conexões do plano atual. Remova uma conexão existente ou faça upgrade no painel da EvoHub.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => window.open("https://app.evohub.ai", "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir painel EvoHub
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Just-created highlight card */}
        {justCreated && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
            <button
              onClick={() => setJustCreated(null)}
              className="float-right h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-white dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-center shrink-0">
                <QrCode className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wider font-medium text-emerald-700 dark:text-emerald-400">
                  Conexão criada
                </div>
                <h3 className="text-base font-semibold text-foreground mt-0.5">{justCreated.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Abre o link da EvoHub pra fazer login no Meta e vincular o número. O status atualiza sozinho.
                </p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button
                    size="sm"
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
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {(error as Error)?.message ?? "Erro ao carregar conexões"}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-16 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-16 text-center">
            <div className="h-12 w-12 rounded-lg bg-muted mx-auto mb-4 flex items-center justify-center">
              <MessageCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              Nenhuma conexão por aqui ainda
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {isGeral
                ? 'Clica em "Nova conexão" pra começar.'
                : `Nenhum número vinculado à operação "${workspace.nome}".`}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((ch) => (
              <ChannelCard
                key={ch.id}
                ch={ch}
                opLabel={opLabel(ch.operacaoId)}
                opAccent={opAccent(ch.operacaoId)}
                operacoes={operacoes}
                onChangeOp={(v) =>
                  setOpMut.mutate({ id: ch.id, operacaoId: v, currentMetadata: ch.metadata })
                }
                onRegen={() => regenMut.mutate(ch.id)}
                regenPending={regenMut.isPending}
                onDelete={() => {
                  if (confirm(`Remover conexão "${ch.name}"?`)) deleteMut.mutate(ch.id);
                }}
                deletePending={deleteMut.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Accent = { bg: string; text: string; border: string } | null;

function ChannelCard({
  ch,
  opLabel,
  opAccent,
  operacoes,
  onChangeOp,
  onRegen,
  regenPending,
  onDelete,
  deletePending,
}: {
  ch: EvoChannel;
  opLabel: string;
  opAccent: Accent;
  operacoes: { id: string; nome: string }[];
  onChangeOp: (v: string) => void;
  onRegen: () => void;
  regenPending: boolean;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const qualityFn = useServerFn(getWhatsappQuality);
  const status = (ch.status || "").toLowerCase();
  const isActive = status === "active";
  const isPending = status === "pending" || status === "connecting";

  const { data: q } = useQuery({
    queryKey: ["wa-quality", ch.id, status],
    queryFn: () => qualityFn({ data: { id: ch.id } }),
    enabled: isActive,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const phone = q?.displayPhoneNumber ?? ch.metadata?.meta_connection?.phone_number ?? null;
  const display = q?.verifiedName ?? ch.metadata?.meta_connection?.display_name ?? null;
  const hasNumber = !!phone;

  // connection state: connected / no_number / down / pending
  let state: "connected" | "no_number" | "down" | "pending" = "down";
  if (isPending) state = "pending";
  else if (isActive && hasNumber) state = "connected";
  else if (isActive && !hasNumber) state = "no_number";
  else state = "down";

  const stateMeta = {
    connected: { label: "Conectado", dot: "bg-emerald-500", ring: "ring-emerald-500/30", text: "text-emerald-700 dark:text-emerald-400" },
    pending:   { label: "Aguardando", dot: "bg-amber-500 animate-pulse", ring: "ring-amber-500/30", text: "text-amber-700 dark:text-amber-400" },
    no_number: { label: "Sem número", dot: "bg-slate-400", ring: "ring-slate-400/30", text: "text-slate-600 dark:text-slate-400" },
    down:      { label: "Conexão caiu", dot: "bg-rose-500", ring: "ring-rose-500/30", text: "text-rose-700 dark:text-rose-400" },
  }[state];

  const quality = q?.qualityRating?.toUpperCase() ?? null;
  const qualityMeta =
    quality === "GREEN"
      ? { label: "Alta", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500" }
      : quality === "YELLOW"
        ? { label: "Média", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-500" }
        : quality === "RED"
          ? { label: "Baixa", color: "text-rose-700 dark:text-rose-400", bg: "bg-rose-500" }
          : { label: "—", color: "text-muted-foreground", bg: "bg-muted-foreground/40" };

  return (
    <div className="aspect-square flex flex-col rounded-xl border border-border bg-card p-5 transition hover:border-foreground/30 hover:shadow-sm">
      {/* Top: state + name */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full ${stateMeta.dot} ring-4 ${stateMeta.ring}`} />
          <span className={`text-[11px] font-medium uppercase tracking-wider ${stateMeta.text}`}>
            {stateMeta.label}
          </span>
        </div>
        <Badge
          variant="outline"
          className={`gap-1 font-normal text-[10px] ${
            opAccent ? `${opAccent.bg} ${opAccent.text} ${opAccent.border}` : ""
          }`}
        >
          <Tag className="h-2.5 w-2.5" /> {opLabel}
        </Badge>
      </div>

      {/* Middle: identity */}
      <div className="flex-1 mt-4 min-w-0">
        <h3 className="text-base font-semibold text-foreground truncate">{ch.name}</h3>
        {display ? (
          <p className="text-sm text-foreground/80 mt-1 truncate">{display}</p>
        ) : null}
        {phone ? (
          <p className="text-sm text-muted-foreground tabular-nums mt-0.5 truncate">{phone}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic mt-1">
            {isPending ? "Aguardando login no Meta…" : "Nenhum número vinculado"}
          </p>
        )}

        {/* Quality block */}
        {isActive && hasNumber && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-background/50 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Qualidade</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`h-2 w-2 rounded-full ${qualityMeta.bg}`} />
                <span className={`text-sm font-semibold ${qualityMeta.color}`}>{qualityMeta.label}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Verificação</div>
              <div className="text-sm font-semibold text-foreground mt-1 truncate">
                {q?.codeVerificationStatus === "VERIFIED" ? "Verificado" : (q?.codeVerificationStatus?.toLowerCase() ?? "—")}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 pt-3 border-t border-border flex items-center gap-1.5">
        <Select value={ch.operacaoId ?? ""} onValueChange={onChangeOp}>
          <SelectTrigger className="h-8 flex-1 text-xs">
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
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={() => window.open(ch.connectUrl, "_blank")}
          title="Abrir link de conexão"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={() => {
            navigator.clipboard.writeText(ch.connectUrl);
            toast.success("Link copiado");
          }}
          title="Copiar link"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={onRegen}
          disabled={regenPending}
          title="Gerar novo link"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          disabled={deletePending}
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
