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
  Loader2,
  Zap,
  Link2,
  CheckCircle2,
  Activity,
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
import { useWorkspace } from "@/lib/workspace-context";
import {
  listWhatsappChannels,
  createWhatsappChannel,
  syncWhatsappChannelByName,
  setChannelOperacao,
  deleteWhatsappChannel,
  regenerateWhatsappToken,
  getWhatsappQuality,
  type EvoChannel,
} from "@/lib/evohub.functions";
import { registerWhatsappWebhook } from "@/lib/whatsapp-chat.functions";
import {
  addTemplateRecipient,
  listNotificationDispatchLogs,
  listRecipientCandidates,
  listTemplateRecipients,
  removeTemplateRecipient,
  sendCallAnalytics,
} from "@/lib/call-analytics.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppPage,
});

function WhatsappIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden>
      <path d="M16 3C8.82 3 3 8.82 3 16c0 2.29.6 4.43 1.65 6.29L3 29l6.89-1.8A12.94 12.94 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm7.6 18.36c-.32.9-1.87 1.7-2.59 1.77-.66.07-1.5.1-2.42-.15-.56-.16-1.28-.4-2.2-.79-3.86-1.66-6.39-5.56-6.58-5.82-.19-.26-1.57-2.08-1.57-3.97 0-1.89.99-2.82 1.34-3.21.35-.39.77-.49 1.02-.49h.74c.24 0 .56-.09.88.67.32.78 1.09 2.68 1.18 2.87.1.19.16.42.03.68-.13.26-.19.42-.39.65-.19.23-.41.51-.59.68-.19.19-.4.4-.17.78.23.39 1.02 1.68 2.19 2.72 1.5 1.34 2.77 1.75 3.16 1.94.39.19.62.16.85-.1.23-.26.99-1.15 1.25-1.55.26-.39.52-.32.88-.19.36.13 2.26 1.07 2.65 1.26.39.19.65.29.74.45.1.16.1.93-.22 1.83z"/>
    </svg>
  );
}

function WhatsAppPage() {
  const qc = useQueryClient();
  const { workspace, workspaces } = useWorkspace();
  const listFn = useServerFn(listWhatsappChannels);
  const createFn = useServerFn(createWhatsappChannel);
  const syncByNameFn = useServerFn(syncWhatsappChannelByName);
  const deleteFn = useServerFn(deleteWhatsappChannel);
  const regenFn = useServerFn(regenerateWhatsappToken);
  const setOpFn = useServerFn(setChannelOperacao);
  const registerWebhookFn = useServerFn(registerWhatsappWebhook);

  const isGeral = workspace.id === "all";
  const operacoes = useMemo(() => workspaces.filter((w) => w.id !== "all"), [workspaces]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [newOp, setNewOp] = useState<string>(isGeral ? "" : workspace.id);
  const [tab, setTab] = useState<"chat" | "notification" | "logs">("chat");
  const connectionKind: "chat" | "notification" = tab === "notification" ? "notification" : "chat";

  const [justCreated, setJustCreated] = useState<EvoChannel | null>(null);
  const [quotaError, setQuotaError] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: () => listFn(),
    refetchInterval: 15000,
  });

  const createMut = useMutation({
    mutationFn: (vars: { name: string; operacaoId: string; kind: "chat" | "notification" }) => createFn({ data: vars }),

    onSuccess: (ch) => {
      toast.success("Conexão criada!");
      setName("");
      setOpen(false);
      setJustCreated(ch);
      setQuotaError(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
    onError: (e: any) => {
      if (e?.message === "EVOHUB_QUOTA_EXCEEDED") {
        setQuotaError(true);
        setOpen(false);
        toast.error("Limite de conexões da EvoHub atingido");
        return;
      }
      toast.error(e?.message ?? "Erro ao criar conexão");
    },
  });

  const syncAmaralMut = useMutation({
    mutationFn: () => syncByNameFn({ data: { name: "Amaral", operacaoId: isGeral ? operacoes[0]?.id ?? null : workspace.id } }),
    onSuccess: (ch) => {
      toast.success(`Conexão "${ch.name}" puxada da EvoHub`);
      qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não consegui puxar a conexão Amaral"),
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
  // Notification channels are global (operacao = __notificador__) — never filter by workspace.
  const scoped = allChannels.filter((c) => {
    const kind = c.kind ?? "chat";
    if (kind === "notification") return true;
    return isGeral || c.operacaoId === workspace.id;
  });
  const channels = scoped.filter((c) => (c.kind ?? "chat") === tab);


  const connectedCount = channels.filter((c) => (c.status || "").toLowerCase() === "active").length;
  const pendingCount = channels.filter((c) => {
    const s = (c.status || "").toLowerCase();
    return s === "pending" || s === "connecting";
  }).length;

  function opLabel(id: string | null) {
    if (!id) return "Sem operação";
    return operacoes.find((o) => o.id === id)?.nome ?? id;
  }

  return (
    <div className="min-h-full bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Hero — gradient panel */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/60 via-background to-background p-6 md:p-8">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-6 flex-wrap">
            <div className="space-y-3 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-[11px] font-medium text-emerald-400">
                <Zap className="h-3 w-3" /> Central de canais
              </span>
              <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                Integrações
              </h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-md">
                Conecte WhatsApp em um só lugar e centralize todas as conversas.
                {isGeral ? "" : ` Filtrado por "${workspace.nome}".`}
              </p>

              {/* Stat tiles */}
              <div className="grid grid-cols-3 gap-3 pt-3 max-w-2xl">
                <StatTile icon={<Link2 className="h-4 w-4" />} value={channels.length} label="Total" tone="neutral" />
                <StatTile icon={<CheckCircle2 className="h-4 w-4" />} value={connectedCount} label="Ativas" tone="emerald" />
                <StatTile icon={<Activity className="h-4 w-4" />} value={pendingCount} label="Aguardando" tone="amber" />
              </div>
            </div>

            <div className="flex gap-2 items-center">
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
                    const res = await registerWebhookFn({ data: { webhookUrl: url } });
                    toast.success(res.message ?? "Webhook configurado");
                  } catch (e: any) {
                    toast.error(e?.message ?? "Erro ao configurar webhook");
                  }
                }}
              >
                <RotateCw className="h-4 w-4 mr-2" /> Webhook
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncAmaralMut.mutate()}
                disabled={syncAmaralMut.isPending}
              >
                {syncAmaralMut.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Puxar Amaral
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
                  <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-semibold">
                    <Plus className="h-4 w-4 mr-2" /> Nova conexão
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      Nova conexão {connectionKind === "notification" ? "(Notificador)" : "WhatsApp"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="ch-name">Nome da conexão</Label>
                      <Input
                        id="ch-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={connectionKind === "notification" ? "Ex.: Notificador Calls" : "Ex.: Atendimento Principal"}
                      />
                    </div>
                    {connectionKind === "notification" ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                        Este número será marcado como <strong>Notificador</strong> e não fica vinculado a nenhuma operação — usado só para disparos automáticos (lembretes de call, templates, etc).
                      </div>
                    ) : (
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
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button
                      onClick={() => {
                        if (!name.trim()) return toast.error("Informe o nome da conexão");
                        if (connectionKind === "chat" && !newOp) return toast.error("Selecione uma operação");
                        createMut.mutate({
                          name: name.trim(),
                          operacaoId: connectionKind === "notification" ? "" : newOp,
                          kind: connectionKind,
                        });
                      }}
                      disabled={createMut.isPending}
                      className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-semibold"
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

        {/* Quota error */}
        {quotaError && (
          <Banner
            tone="amber"
            title="Limite EvoHub excedido"
            description="Sua conta EvoHub atingiu o limite de conexões. Remova uma conexão existente ou faça upgrade."
            onClose={() => setQuotaError(false)}
            action={
              <Button size="sm" variant="outline" onClick={() => window.open("https://app.evohub.ai", "_blank", "noopener,noreferrer")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir painel EvoHub
              </Button>
            }
          />
        )}

        {/* Just created */}
        {justCreated && (
          <Banner
            tone="emerald"
            title={`Conexão "${justCreated.name}" criada`}
            description="Abra o link da EvoHub pra fazer login no Meta e vincular o número. O status atualiza sozinho."
            onClose={() => setJustCreated(null)}
            icon={<QrCode className="h-5 w-5 text-emerald-400" />}
            action={
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950"
                  onClick={() => window.open(justCreated.connectUrl, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="h-4 w-4 mr-2" /> Abrir link
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => { navigator.clipboard.writeText(justCreated.connectUrl); toast.success("Link copiado"); }}>
                  <Copy className="h-4 w-4 mr-2" /> Copiar
                </Button>
              </div>
            }
          />
        )}

        {/* Tabs: Atendimento vs Notificações */}
        <div className="flex items-center gap-2 border-b border-border">
          {([
            { id: "chat" as const, label: "Atendimento" },
            { id: "notification" as const, label: "Notificações" },
            { id: "logs" as const, label: "Logs de disparo" },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                tab === t.id
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "notification" && (
          <div className="space-y-4">
            <TemplatesPanel />
          </div>
        )}

        {tab === "logs" && <DispatchLogsPanel />}



        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {(error as Error)?.message ?? "Erro ao carregar conexões"}
          </div>
        )}

        {tab !== "logs" && (
          isLoading ? (
            <div className="rounded-2xl border border-border bg-card p-16 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </div>
          ) : channels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/30 p-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mx-auto mb-4 flex items-center justify-center">
                <WhatsappIcon className="h-7 w-7 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma conexão por aqui ainda</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {isGeral ? 'Clica em "Nova conexão" pra começar.' : `Nenhum número vinculado à operação "${workspace.nome}".`}
              </p>
              <Button variant="outline" className="mt-5" onClick={() => syncAmaralMut.mutate()} disabled={syncAmaralMut.isPending}>
                {syncAmaralMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Puxar conexão Amaral da EvoHub
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {channels.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  ch={ch}
                  opLabel={opLabel(ch.operacaoId)}
                  operacoes={operacoes}
                  onChangeOp={(v) => setOpMut.mutate({ id: ch.id, operacaoId: v, currentMetadata: ch.metadata })}
                  onRegen={() => regenMut.mutate(ch.id)}
                  regenPending={regenMut.isPending}
                  onDelete={() => {
                    if (confirm(`Remover conexão "${ch.name}"?`)) deleteMut.mutate(ch.id);
                  }}
                  deletePending={deleteMut.isPending}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function StatTile({
  icon, value, label, tone,
}: { icon: React.ReactNode; value: number; label: string; tone: "neutral" | "emerald" | "amber" }) {
  const tones = {
    neutral: { border: "border-border", icon: "text-muted-foreground", value: "text-foreground", bg: "bg-card/40" },
    emerald: { border: "border-emerald-500/30", icon: "text-emerald-400", value: "text-emerald-400", bg: "bg-emerald-500/5" },
    amber:   { border: "border-amber-500/30",   icon: "text-amber-400",   value: "text-amber-400",   bg: "bg-amber-500/5" },
  }[tone];
  return (
    <div className={`rounded-xl border ${tones.border} ${tones.bg} px-4 py-3 flex items-center gap-3`}>
      <span className={tones.icon}>{icon}</span>
      <div>
        <div className={`text-xl font-bold leading-none ${tones.value}`}>{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}

function Banner({
  tone, title, description, icon, action, onClose,
}: {
  tone: "emerald" | "amber";
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  onClose?: () => void;
}) {
  const cls = tone === "emerald"
    ? "border-emerald-500/30 bg-emerald-500/5"
    : "border-amber-500/30 bg-amber-500/5";
  return (
    <div className={`relative rounded-xl border ${cls} p-4`}>
      {onClose && (
        <button onClick={onClose}
          className="absolute top-3 right-3 h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition"
          aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex items-start gap-3 pr-8">
        {icon ?? <CheckCircle2 className={`h-5 w-5 ${tone === "emerald" ? "text-emerald-400" : "text-amber-400"} shrink-0 mt-0.5`} />}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

function ChannelCard({
  ch, opLabel, operacoes, onChangeOp, onRegen, regenPending, onDelete, deletePending,
}: {
  ch: EvoChannel;
  opLabel: string;
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
    queryKey: ["wa-quality", ch.id],
    queryFn: () => qualityFn({ data: { id: ch.id } }),
    enabled: isActive,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const phone = q?.displayPhoneNumber ?? ch.metadata?.meta_connection?.phone_number ?? null;
  const display = q?.verifiedName ?? ch.metadata?.meta_connection?.display_name ?? ch.name;

  // Simplified state: if active → conectado; pending → aguardando; else → caiu
  const state: "conectado" | "aguardando" | "caiu" =
    isActive ? "conectado" : isPending ? "aguardando" : "caiu";

  const stateMeta = {
    conectado: { label: "Conectado",   pill: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400", footer: "Canal ativo e recebendo mensagens", footerDot: "bg-emerald-400" },
    aguardando:{ label: "Aguardando",  pill: "bg-amber-500/15 text-amber-400 border-amber-500/30",       dot: "bg-amber-400 animate-pulse", footer: "Aguardando login no Meta", footerDot: "bg-amber-400" },
    caiu:      { label: "Conexão caiu",pill: "bg-rose-500/15 text-rose-400 border-rose-500/30",          dot: "bg-rose-400",    footer: "Conexão inativa — reconecte", footerDot: "bg-rose-400" },
  }[state];

  const quality = q?.qualityRating?.toUpperCase() ?? null;
  const qPill =
    quality === "GREEN"  ? { label: "Alta",  cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" } :
    quality === "YELLOW" ? { label: "Média", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" } :
    quality === "RED"    ? { label: "Baixa", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" } : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col transition hover:border-emerald-500/40">
      {/* Header: icon + status pill */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <WhatsappIcon className="h-7 w-7 text-white" />
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${stateMeta.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${stateMeta.dot}`} />
            {stateMeta.label}
          </span>
        </div>

        <h3 className="mt-4 text-lg font-bold text-foreground truncate">{ch.name}</h3>
        <p className="text-sm text-muted-foreground">WhatsApp Business</p>
      </div>

      {/* Sub-card: phone */}
      <div className="px-5">
        <div className="rounded-xl bg-background/60 border border-border p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <WhatsappIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{display}</div>
            <div className="text-xs text-muted-foreground tabular-nums truncate">
              {phone ?? (isActive ? "Sincronizando número…" : "—")}
            </div>
          </div>
          {isActive && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
        </div>
      </div>

      {/* Status pill row */}
      <div className="px-5 pt-3">
        <div className={`rounded-lg border ${stateMeta.pill.includes("emerald") ? "border-emerald-500/20 bg-emerald-500/5" : stateMeta.pill.includes("amber") ? "border-amber-500/20 bg-amber-500/5" : "border-rose-500/20 bg-rose-500/5"} px-3 py-2 flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className={`h-1.5 w-1.5 rounded-full ${stateMeta.footerDot}`} />
            <span className="text-foreground/90">
              WhatsApp {state === "conectado" ? "conectado" : state === "aguardando" ? "aguardando" : "desconectado"}
            </span>
          </div>
          {qPill && (
            <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 ${qPill.cls}`}>
              Qualidade {qPill.label}
            </span>
          )}
        </div>
      </div>

      {/* Operation select */}
      <div className="px-5 pt-3">
        <Select value={ch.operacaoId ?? ""} onValueChange={onChangeOp}>
          <SelectTrigger className="h-8 text-xs bg-background/60">
            <SelectValue placeholder={opLabel} />
          </SelectTrigger>
          <SelectContent>
            {operacoes.map((op) => (
              <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Footer */}
      <div className="mt-4 px-5 py-3 border-t border-border space-y-2">
        <div className="text-[11px] text-muted-foreground truncate">{stateMeta.footer}</div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs"
            onClick={() => window.open(ch.connectUrl, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            title="Copiar link"
            onClick={() => { navigator.clipboard.writeText(ch.connectUrl); toast.success("Link copiado"); }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            title="Gerar novo link"
            onClick={onRegen}
            disabled={regenPending}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-8 px-3 text-xs"
            onClick={onDelete}
            disabled={deletePending}
          >
            {deletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplatesPanel() {
  const qc = useQueryClient();
  const listRecipientsFn = useServerFn(listTemplateRecipients);
  const addRecipientFn = useServerFn(addTemplateRecipient);
  const removeRecipientFn = useServerFn(removeTemplateRecipient);
  const listCandidatesFn = useServerFn(listRecipientCandidates);
  const sendAnalyticsFn = useServerFn(sendCallAnalytics);
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["wa_templates"],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.from("wa_templates" as any).select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 15000,
  });

  const [editing, setEditing] = useState<any | null>(null);
  const [conteudo, setConteudo] = useState("");
  const [buttonsDraft, setButtonsDraft] = useState<Array<{ id: string; label: string }>>([]);
  const [testOpen, setTestOpen] = useState<any | null>(null);
  const [testForm, setTestForm] = useState({ to: "", nome: "", hora: "", convidados: "" });
  const [testSending, setTestSending] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState<any | null>(null);
  const [approvalChannelId, setApprovalChannelId] = useState<string>("");
  const [approvalSending, setApprovalSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [recipientsOpen, setRecipientsOpen] = useState<any | null>(null);
  const [newRecipientPhone, setNewRecipientPhone] = useState("");
  const [newRecipientNome, setNewRecipientNome] = useState("");
  const [analyticsSending, setAnalyticsSending] = useState(false);

  const { data: recipientsList = [], refetch: refetchRecipients } = useQuery({
    queryKey: ["wa_template_recipients", recipientsOpen?.id],
    queryFn: async () => {
      return await listRecipientsFn({ data: { templateId: recipientsOpen!.id } });
    },
    enabled: !!recipientsOpen,
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["wa_recipient_candidates"],
    queryFn: async () => {
      return await listCandidatesFn();
    },
    enabled: !!recipientsOpen,
  });


  const { data: notifChannels = [] } = useQuery({
    queryKey: ["wa_notification_channels"],
    queryFn: async () => {
      const { listNotificationChannels } = await import("@/lib/wa-templates.functions");
      return await listNotificationChannels();
    },
    enabled: !!approvalOpen,
  });

  const saveMut = useMutation({
    mutationFn: async (vars: { id: string; conteudo: string; buttons: Array<{ id: string; label: string }> }) => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase
        .from("wa_templates" as any)
        .update({ conteudo: vars.conteudo, buttons: vars.buttons })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template salvo");
      qc.invalidateQueries({ queryKey: ["wa_templates"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const statusBadge = (s: string | null | undefined) => {
    const v = String(s ?? "").toUpperCase();
    if (v === "APPROVED") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    if (v === "REJECTED" || v === "DISABLED") return "bg-red-500/15 text-red-300 border-red-500/40";
    if (v === "PENDING" || v === "IN_REVIEW" || v === "IN_APPEAL") return "bg-amber-500/15 text-amber-300 border-amber-500/40";
    return "bg-muted/40 text-muted-foreground border-border";
  };
  const statusLabel = (s: string | null | undefined) => {
    const v = String(s ?? "").toUpperCase();
    if (!v) return "Não enviado";
    if (v === "APPROVED") return "Aprovado";
    if (v === "REJECTED") return "Rejeitado";
    if (v === "PENDING" || v === "IN_REVIEW") return "Em análise";
    if (v === "IN_APPEAL") return "Em recurso";
    if (v === "DISABLED") return "Desativado";
    return v;
  };

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Templates de notificação</h3>
          <p className="text-xs text-muted-foreground">Mensagens pré-aprovadas usadas pelos gatilhos automáticos.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            try {
              const { syncMetaTemplates } = await import("@/lib/wa-templates.functions");
              const res = await syncMetaTemplates();
              toast.success(`Sincronizado · ${res.updated}/${res.total}`);
              qc.invalidateQueries({ queryKey: ["wa_templates"] });
            } catch (e: any) {
              toast.error(e?.message ?? "Falha ao sincronizar");
            } finally {
              setSyncing(false);
            }
          }}
        >
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Atualizar status
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 inline animate-spin mr-2" /> Carregando…</div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhum template ainda.</div>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-foreground">{t.nome}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusBadge(t.meta_status)}`}>
                      {statusLabel(t.meta_status)}
                    </span>
                    {t.meta_category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{t.meta_category}</span>
                    )}
                  </div>
                  {t.descricao && <div className="text-xs text-muted-foreground mt-0.5">{t.descricao}</div>}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{t.slug}</span>
                    {(t.vars ?? []).map((v: string) => (
                      <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">{`{{${v}}}`}</span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  {(t.slug === "lembrete_call_v2" || t.slug === "comparecimento_call") && (
                    <Button size="sm" variant="outline" onClick={() => { setTestOpen(t); setTestForm({ to: "", nome: "", hora: "", convidados: "" }); }}>Testar envio</Button>
                  )}
                  {t.slug === "analytics_call" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                      disabled={analyticsSending}
                      onClick={async () => {
                        setAnalyticsSending(true);
                        try {
                          const r = await sendAnalyticsFn({ data: {} });
                          toast.success(r.sent ? `Analytics enviado p/ ${r.sent} contato(s)` : `Sem envio: ${r.skipped ?? "ok"}`);
                        } catch (e: any) {
                          toast.error(e?.message ?? "Falha");
                        } finally {
                          setAnalyticsSending(false);
                        }
                      }}
                    >
                      {analyticsSending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                      Enviar agora
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setRecipientsOpen(t)}>Destinatários</Button>
                  <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" onClick={() => { setApprovalOpen(t); setApprovalChannelId(""); }}>Enviar p/ Meta</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(t); setConteudo(t.conteudo); setButtonsDraft(Array.isArray(t.buttons) ? t.buttons : []); }}>Editar</Button>
                </div>
              </div>
              <pre className="mt-3 whitespace-pre-wrap text-sm text-foreground/90 bg-background/60 rounded-lg p-3 border border-border">{t.conteudo}</pre>
              {Array.isArray(t.buttons) && t.buttons.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.buttons.map((b: any) => (
                    <span key={b.id} className="text-[11px] px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-medium">
                      {b.label} <span className="opacity-60 font-mono">[{b.id}]</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar template {editing?.nome}</DialogTitle>
          </DialogHeader>
          <textarea
            className="w-full min-h-[180px] rounded-lg border border-border bg-background p-3 text-sm font-mono"
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Use {`{{nome}}`}, {`{{hora}}`} e {`{{convidados}}`} para inserir variáveis.</p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Botões interativos (máx. 3)</p>
              {buttonsDraft.length < 3 && (
                <Button size="sm" variant="outline" onClick={() => setButtonsDraft([...buttonsDraft, { id: `btn${buttonsDraft.length + 1}`, label: "Novo botão" }])}>
                  + Adicionar botão
                </Button>
              )}
            </div>
            {buttonsDraft.map((b, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className="w-28 rounded-md border border-border bg-background px-2 py-1 text-xs font-mono"
                  placeholder="id"
                  value={b.id}
                  onChange={(e) => { const next = [...buttonsDraft]; next[idx] = { ...b, id: e.target.value }; setButtonsDraft(next); }}
                />
                <input
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  placeholder="Texto do botão (máx. 20)"
                  maxLength={20}
                  value={b.label}
                  onChange={(e) => { const next = [...buttonsDraft]; next[idx] = { ...b, label: e.target.value }; setButtonsDraft(next); }}
                />
                <Button size="sm" variant="ghost" onClick={() => setButtonsDraft(buttonsDraft.filter((_, i) => i !== idx))}>×</Button>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">Para o lembrete de call use ids <code>showup</code> e <code>noshow</code> para acionar a marcação automática.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-semibold"
              onClick={() => editing && saveMut.mutate({ id: editing.id, conteudo, buttons: buttonsDraft })}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testOpen} onOpenChange={(v) => !v && setTestOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Testar {testOpen?.slug === "comparecimento_call" ? "comparecimento" : "lembrete"} de call</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Telefone com DDD (ex: 11999999999)" value={testForm.to} onChange={(e) => setTestForm({ ...testForm, to: e.target.value })} />
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Nome do convidado" value={testForm.nome} onChange={(e) => setTestForm({ ...testForm, nome: e.target.value })} />
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Horário (ex: 11:00)" value={testForm.hora} onChange={(e) => setTestForm({ ...testForm, hora: e.target.value })} />
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Outros convidados (opcional)" value={testForm.convidados} onChange={(e) => setTestForm({ ...testForm, convidados: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(null)}>Cancelar</Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-semibold"
              disabled={testSending || !testForm.to.trim() || !testForm.nome.trim() || !testForm.hora.trim()}
              onClick={async () => {
                setTestSending(true);
                try {
                  const mod = await import("@/lib/call-reminders.functions");
                  const fn = testOpen?.slug === "comparecimento_call" ? mod.sendCallAttendance : mod.sendCallReminder;
                  const res = await fn({ data: { eventId: `test-${Date.now()}`, to: testForm.to, nome: testForm.nome, hora: testForm.hora, convidados: testForm.convidados } });
                  toast.success(res.skipped ? "Já enviado recentemente" : "Enviado ✓");
                  setTestOpen(null);
                } catch (e: any) {
                  toast.error(e?.message ?? "Falha ao enviar");
                } finally {
                  setTestSending(false);
                }
              }}
            >
              {testSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approvalOpen} onOpenChange={(v) => !v && setApprovalOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar template para aprovação da Meta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Será enviado como <strong className="text-emerald-400">UTILIDADE</strong> (maior taxa de aprovação). Se a Meta exigir outra categoria, tentamos como Marketing automaticamente.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Número conectado (WABA)</Label>
              <Select value={approvalChannelId} onValueChange={setApprovalChannelId}>
                <SelectTrigger><SelectValue placeholder="Selecione um número notificador" /></SelectTrigger>
                <SelectContent>
                  {notifChannels.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum número notificador conectado.</div>
                  )}
                  {notifChannels.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.displayPhone ? `· ${c.displayPhone}` : ""} {!c.hasWaba ? "· (WABA não detectada)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Vamos tentar enviar mesmo se a WABA não for detectada automaticamente.</p>
            </div>
            {approvalOpen && (
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <div className="text-[11px] text-muted-foreground mb-1">Prévia do conteúdo</div>
                <pre className="whitespace-pre-wrap text-xs text-foreground/90">{approvalOpen.conteudo}</pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalOpen(null)}>Cancelar</Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-semibold"
              disabled={approvalSending || !approvalChannelId}
              onClick={async () => {
                setApprovalSending(true);
                try {
                  const { submitWhatsappTemplate } = await import("@/lib/wa-templates.functions");
                  const res = await submitWhatsappTemplate({ data: { templateId: approvalOpen.id, channelId: approvalChannelId, language: "pt_BR" } });
                  toast.success(`Enviado como ${res.category} · status ${res.status}`);
                  qc.invalidateQueries({ queryKey: ["wa_templates"] });
                  setApprovalOpen(null);
                } catch (e: any) {
                  toast.error(e?.message ?? "Falha ao enviar para a Meta");
                } finally {
                  setApprovalSending(false);
                }
              }}
            >
              {approvalSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar para aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!recipientsOpen} onOpenChange={(v) => { if (!v) { setRecipientsOpen(null); setNewRecipientPhone(""); setNewRecipientNome(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Destinatários · {recipientsOpen?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Números que vão receber este template. {recipientsOpen?.slug === "analytics_call" && "O diagnóstico do dia é enviado todo dia às 22h."}
            </p>
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {recipientsList.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
                  Nenhum destinatário cadastrado.
                </div>
              ) : recipientsList.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{r.nome || "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground font-mono">+{r.telefone}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                    onClick={async () => {
                      try {
                        await removeRecipientFn({ data: { id: r.id } });
                        refetchRecipients();
                      } catch (e: any) {
                        toast.error(e?.message ?? "Erro");
                      }
                    }}
                  >Remover</Button>
                </div>
              ))}
            </div>
            <div className="space-y-3 pt-3 border-t border-border">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Adicionar do time</div>
                {candidates.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">Nenhum vendedor ou membro da equipe com telefone cadastrado.</div>
                ) : (
                  <div className="max-h-[180px] overflow-y-auto space-y-1 pr-1">
                    {candidates.map((c: any) => {
                      const alreadyAdded = recipientsList.some((r: any) => r.telefone === c.telefone);
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/30 px-2.5 py-1.5">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${c.origem === "vendedor" ? "bg-blue-500/15 text-blue-300" : "bg-purple-500/15 text-purple-300"}`}>
                              {c.origem === "vendedor" ? "Vendedor" : "Equipe"}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm text-foreground truncate">{c.nome}</div>
                              <div className="text-[11px] text-muted-foreground font-mono">+{c.telefone}</div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={alreadyAdded}
                            className="shrink-0 h-7 text-xs"
                            onClick={async () => {
                              try {
                                await addRecipientFn({ data: { templateId: recipientsOpen.id, telefone: c.telefone, nome: c.nome } });
                                refetchRecipients();
                              } catch (e: any) {
                                toast.error(e?.message ?? "Erro");
                              }
                            }}
                          >{alreadyAdded ? "Adicionado" : "Adicionar"}</Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ou adicionar manualmente</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Nome (opcional)" value={newRecipientNome} onChange={(e) => setNewRecipientNome(e.target.value)} />
                  <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Telefone com DDD" value={newRecipientPhone} onChange={(e) => setNewRecipientPhone(e.target.value)} />
                </div>
                <Button
                  className="w-full mt-2 bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-semibold"
                  disabled={!newRecipientPhone.trim()}
                  onClick={async () => {
                    try {
                      await addRecipientFn({ data: { templateId: recipientsOpen.id, telefone: newRecipientPhone, nome: newRecipientNome || undefined } });
                      setNewRecipientPhone("");
                      setNewRecipientNome("");
                      refetchRecipients();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Erro");
                    }
                  }}
                >Adicionar destinatário</Button>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function DispatchLogsPanel() {
  const listLogsFn = useServerFn(listNotificationDispatchLogs);
  const { data: logs = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["wa_notification_dispatch_logs"],
    queryFn: async () => {
      return await listLogsFn({ data: { limit: 120 } });
    },
    refetchInterval: 10000,
  });

  const fmt = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    } catch {
      return String(iso);
    }
  };

  const statusInfo = (status: string | null | undefined) => {
    const s = String(status ?? "pending").toLowerCase();
    if (["read", "delivered", "showup", "noshow", "remarcada"].includes(s)) {
      return { label: s === "read" ? "Lido" : s === "delivered" ? "Entregue" : s === "showup" ? "Show up" : s === "noshow" ? "No show" : "Remarcada", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" };
    }
    if (s === "sent") return { label: "Enviado", cls: "border-blue-500/40 bg-blue-500/10 text-blue-300" };
    if (s === "failed" || s === "undelivered") return { label: "Falhou", cls: "border-red-500/40 bg-red-500/10 text-red-300" };
    return { label: "Pendente", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
  };

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" /> Logs de disparo
          </h3>
          <p className="text-xs text-muted-foreground">Acompanhamento dos lembretes, comparecimentos e tarefas enviados pelo número notificador.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 inline animate-spin mr-2" /> Carregando logs…</div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Nenhum disparo registrado ainda.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background/70 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Quando</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">Destinatário</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">ID WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background/30">
              {logs.map((log: any) => {
                const st = statusInfo(log.status);
                return (
                  <tr key={log.id} className="align-top">
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{fmt(log.sentAt ?? log.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-foreground">{log.type}</div>
                      {log.details && <div className="text-xs text-muted-foreground mt-0.5">{log.details}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-foreground">{log.recipientName || "Sem nome"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{log.phone ? `+${log.phone}` : "—"}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                      {log.errorMessage && (
                        <div className="mt-1 max-w-[260px] text-[11px] text-red-300/90 leading-snug break-words" title={log.errorMessage}>
                          {log.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[260px]">
                      <div className="truncate font-mono text-xs text-muted-foreground" title={log.waMessageId || ""}>{log.waMessageId || "—"}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

