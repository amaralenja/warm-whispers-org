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
  setChannelOperacao,
  deleteWhatsappChannel,
  regenerateWhatsappToken,
  getWhatsappQuality,
  type EvoChannel,
} from "@/lib/evohub.functions";
import { registerWhatsappWebhook } from "@/lib/whatsapp-chat.functions";

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
  const deleteFn = useServerFn(deleteWhatsappChannel);
  const regenFn = useServerFn(regenerateWhatsappToken);
  const setOpFn = useServerFn(setChannelOperacao);

  const isGeral = workspace.id === "all";
  const operacoes = useMemo(() => workspaces.filter((w) => w.id !== "all"), [workspaces]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [newOp, setNewOp] = useState<string>(isGeral ? "" : workspace.id);
  const [justCreated, setJustCreated] = useState<EvoChannel | null>(null);
  const [quotaError, setQuotaError] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: () => listFn(),
    refetchInterval: 15000,
  });

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
                  <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-semibold">
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
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button
                      onClick={() => {
                        if (!name.trim()) return toast.error("Informe o nome da conexão");
                        if (!newOp) return toast.error("Selecione uma operação");
                        createMut.mutate({ name: name.trim(), operacaoId: newOp });
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

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {(error as Error)?.message ?? "Erro ao carregar conexões"}
          </div>
        )}

        {/* Channel grid */}
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-16 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/30 p-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mx-auto mb-4 flex items-center justify-center">
              <WhatsappIcon className="h-7 w-7 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
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
      <div className="mt-4 px-5 py-3 border-t border-border flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{stateMeta.footer}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => window.open(ch.connectUrl, "_blank")}
            className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted transition"
            title="Abrir link"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(ch.connectUrl); toast.success("Link copiado"); }}
            className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted transition"
            title="Copiar link"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRegen}
            disabled={regenPending}
            className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted transition disabled:opacity-50"
            title="Gerar novo link"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={deletePending}
            className="h-7 w-7 rounded flex items-center justify-center hover:bg-rose-500/10 hover:text-rose-400 transition disabled:opacity-50"
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
