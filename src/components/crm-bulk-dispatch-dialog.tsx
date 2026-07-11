import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Rocket, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  previewCrmBulkDispatch,
  startCrmBulkDispatch,
  listActiveCrmBulkDispatches,
  cancelCrmBulkDispatch,
} from "@/lib/crm-bulk-dispatch.functions";
import { listFlows } from "@/lib/flow-engine.functions";
import { listWhatsappChannels } from "@/lib/whatsapp-chat.functions";

type Props = {
  operacao: string;
  stageId: string;
  stageLabel: string;
  stageColor: string;
  leadCount: number;
};

export function BulkDispatchButton({ operacao, stageId, stageLabel, stageColor, leadCount }: Props) {
  const [open, setOpen] = useState(false);
  const activeQ = useQuery({
    queryKey: ["crm-bulk-active", operacao, stageId],
    queryFn: () => listActiveCrmBulkDispatches({ data: { operacao } }),
    refetchInterval: 5000,
  });
  const activeForStage = useMemo(
    () => (activeQ.data ?? []).find((d: any) => String(d.stage_id) === stageId),
    [activeQ.data, stageId],
  );

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={activeForStage ? "Disparo em andamento — clique para ver" : "Disparar fluxo em massa"}
        className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        style={activeForStage ? { color: stageColor } : undefined}
      >
        {activeForStage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <BulkDispatchDialog
          open={open}
          onOpenChange={setOpen}
          operacao={operacao}
          stageId={stageId}
          stageLabel={stageLabel}
          leadCount={leadCount}
          active={activeForStage ?? null}
        />
      )}
    </>
  );
}

function BulkDispatchDialog({
  open, onOpenChange, operacao, stageId, stageLabel, leadCount, active,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  operacao: string;
  stageId: string;
  stageLabel: string;
  leadCount: number;
  active: any | null;
}) {
  const qc = useQueryClient();
  const listFlowsFn = useServerFn(listFlows);
  const listChannelsFn = useServerFn(listWhatsappChannels);
  const previewFn = useServerFn(previewCrmBulkDispatch);
  const startFn = useServerFn(startCrmBulkDispatch);
  const cancelFn = useServerFn(cancelCrmBulkDispatch);

  const flowsQ = useQuery({ queryKey: ["flows-all"], queryFn: () => listFlowsFn({}) });
  const channelsQ = useQuery({ queryKey: ["wa-channels-all"], queryFn: () => listChannelsFn({}) });

  const [flowId, setFlowId] = useState<string>("");
  const [channelId, setChannelId] = useState<string>("");
  const [delayMin, setDelayMin] = useState<number>(1);

  const previewQ = useQuery({
    queryKey: ["crm-bulk-preview", operacao, stageId, channelId],
    queryFn: () => previewFn({ data: { operacao, stage_id: stageId, channel_id: channelId } }),
    enabled: !!channelId,
  });

  const startMut = useMutation({
    mutationFn: async () => startFn({
      data: {
        operacao, stage_id: stageId, channel_id: channelId, flow_id: flowId,
        delay_seconds: Math.max(60, Math.floor(delayMin * 60)),
      },
    }),
    onSuccess: (r: any) => {
      toast.success(`Disparo iniciado: ${r.eligible} leads na fila`);
      qc.invalidateQueries({ queryKey: ["crm-bulk-active"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao iniciar disparo"),
  });

  const cancelMut = useMutation({
    mutationFn: async () => cancelFn({ data: { id: active?.id } }),
    onSuccess: () => {
      toast.success("Disparo cancelado");
      qc.invalidateQueries({ queryKey: ["crm-bulk-active"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao cancelar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Disparo em massa — {stageLabel}</DialogTitle>
          <DialogDescription>
            {active
              ? "Existe um disparo em andamento nesta coluna."
              : `${leadCount} leads nessa coluna. Só quem tiver janela de 24h aberta receberá.`}
          </DialogDescription>
        </DialogHeader>

        {active ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
              <Stat label="Elegíveis" value={active.eligible_leads} />
              <Stat label="Enviados" value={active.sent_count} />
              <Stat label="Falhados" value={active.failed_count} />
              <Stat label="Delay (s)" value={active.delay_seconds} />
            </div>
            <p className="text-xs text-muted-foreground">
              O disparo continua no servidor mesmo se você fechar essa janela.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Fluxo</Label>
              <Select value={flowId} onValueChange={setFlowId}>
                <SelectTrigger><SelectValue placeholder="Selecione o fluxo" /></SelectTrigger>
                <SelectContent>
                  {(flowsQ.data ?? []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome ?? f.name ?? f.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canal WhatsApp</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger><SelectValue placeholder="Selecione o canal" /></SelectTrigger>
                <SelectContent>
                  {(channelsQ.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name ?? c.verified_name ?? c.display_phone_number ?? c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Delay entre envios (minutos, mínimo 1)</Label>
              <Input
                type="number" min={1} step={1}
                value={delayMin}
                onChange={(e) => setDelayMin(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm">
              <Stat label="Total na coluna" value={previewQ.data?.total ?? leadCount} />
              <Stat label="Janela aberta" value={previewQ.data?.eligible ?? "—"} accent />
              <Stat label="Sem janela" value={previewQ.data?.noWindow ?? "—"} />
              <Stat label="Sem telefone" value={previewQ.data?.noPhone ?? "—"} />
            </div>
            {!channelId && (
              <p className="text-xs text-muted-foreground">Escolha o canal pra ver quantos estão elegíveis.</p>
            )}
          </div>
        )}

        <DialogFooter>
          {active ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button variant="destructive" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                {cancelMut.isPending ? "Cancelando…" : "Cancelar disparo"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                disabled={!flowId || !channelId || !(previewQ.data?.eligible ?? 0) || startMut.isPending}
                onClick={() => startMut.mutate()}
              >
                {startMut.isPending
                  ? "Iniciando…"
                  : `Disparar pra ${previewQ.data?.eligible ?? 0} leads`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${accent ? "text-primary" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}
