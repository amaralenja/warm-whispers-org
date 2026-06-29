import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  listWhatsappChannels,
  createWhatsappChannel,
  deleteWhatsappChannel,
  regenerateWhatsappToken,
  type EvoChannel,
} from "@/lib/evohub.functions";

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
  const listFn = useServerFn(listWhatsappChannels);
  const createFn = useServerFn(createWhatsappChannel);
  const deleteFn = useServerFn(deleteWhatsappChannel);
  const regenFn = useServerFn(regenerateWhatsappToken);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: () => listFn(),
    refetchInterval: 15000,
  });

  const createMut = useMutation({
    mutationFn: (n: string) => createFn({ data: { name: n } }),
    onSuccess: () => {
      toast.success("Conexão criada! Compartilhe o link pra ativar.");
      setName("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-channels"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar conexão"),
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

  const channels = (data ?? []) as EvoChannel[];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Phone className="h-6 w-6 text-emerald-500" /> WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">
            Conecte números via EvoHub (WhatsApp Business Cloud API). Crie uma conexão e compartilhe o link pra ativar o número.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                <Plus className="h-4 w-4 mr-2" /> Nova conexão
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova conexão WhatsApp</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 pt-2">
                <Label htmlFor="ch-name">Nome da conexão</Label>
                <Input
                  id="ch-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Atendimento Principal"
                />
                <p className="text-xs text-muted-foreground">
                  Após criar, copie o link e abra no navegador onde o WhatsApp Business tá logado.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => createMut.mutate(name)}
                  disabled={!name.trim() || createMut.isPending}
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
          <p className="text-muted-foreground">Nenhuma conexão ainda. Clica em "Nova conexão" pra começar.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {channels.map((ch) => {
            const phone = ch.metadata?.meta_connection?.phone_number;
            const display = ch.metadata?.meta_connection?.display_name;
            return (
              <div
                key={ch.id}
                className="rounded-lg border border-border bg-card p-4 flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate">{ch.name}</h3>
                    {statusBadge(ch.status)}
                  </div>
                  {phone && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {display ? `${display} · ` : ""}{phone}
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
                <div className="flex gap-2">
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
