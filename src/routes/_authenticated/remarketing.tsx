import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Zap, Tag as TagIcon, Columns3, X, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { getVendorSession } from "@/lib/vendor-session";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  listRemarketingRules, upsertRemarketingRule, deleteRemarketingRule, toggleRemarketingRule,
  type RemarketingRule, type RemarketingCondition,
} from "@/lib/remarketing.functions";
import { listFlows } from "@/lib/flow-engine.functions";
import { listWhatsappChannels } from "@/lib/whatsapp-chat.functions";
import { listCrmExperts, listCrmStages, listCrmTags } from "@/lib/crm.functions";

export const Route = createFileRoute("/_authenticated/remarketing")({
  component: RemarketingPage,
  head: () => ({
    meta: [
      { title: "Remarketing 24h — Operação X1" },
      { name: "description", content: "Recupere leads com fluxos disparados antes da janela de 24h fechar" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">
      Erro: {(error as any)?.message ?? "desconhecido"}
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">Página não encontrada</div>,
});

function RemarketingPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRemarketingRules);
  const toggleFn = useServerFn(toggleRemarketingRule);
  const deleteFn = useServerFn(deleteRemarketingRule);

  const [editing, setEditing] = useState<RemarketingRule | null>(null);
  const [creating, setCreating] = useState(false);

  const rulesQ = useQuery({
    queryKey: ["remarketing-rules"],
    queryFn: () => listFn({ data: {} }),
  });

  const toggleMut = useMutation({
    mutationFn: async (v: { id: string; ativo: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["remarketing-rules"] }),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao alterar status"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Regra removida");
      qc.invalidateQueries({ queryKey: ["remarketing-rules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Zap className="h-6 w-6 text-primary" /> Remarketing 24h
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dispara um fluxo pra recuperar leads antes que a janela de 24h do WhatsApp feche.
            As condições (etiqueta / coluna do Kanban) precisam bater — se não bater, ninguém recebe.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova regra
        </Button>
      </div>

      {rulesQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : (rulesQ.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Zap className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhuma regra ainda</p>
            <p className="text-sm text-muted-foreground">Cria uma regra pra começar a recuperar leads automaticamente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(rulesQ.data ?? []).map((rule) => (
            <Card key={rule.id} className={rule.ativo ? "" : "opacity-60"}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="truncate">{rule.nome}</span>
                    <Badge variant="outline" className="text-[10px]">{rule.operacao}</Badge>
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dispara <b>{rule.minutes_before_close} min</b> antes da janela fechar
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.ativo}
                    onCheckedChange={(v) => toggleMut.mutate({ id: rule.id, ativo: v })}
                  />
                  <Button size="icon" variant="ghost" onClick={() => setEditing(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => {
                      if (confirm(`Remover regra "${rule.nome}"?`)) deleteMut.mutate(rule.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {rule.conditions.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">Sem condições — dispara pra todo mundo elegível</span>
                  )}
                  {rule.conditions.map((c, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {c.type === "tag" ? <TagIcon className="h-3 w-3" /> : <Columns3 className="h-3 w-3" />}
                      {c.type === "tag" ? "Etiqueta:" : "Coluna:"} {c.value}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <RuleDialog
          rule={editing}
          open
          onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }}
        />
      )}
    </div>
  );
}

function RuleDialog({
  rule, open, onOpenChange,
}: {
  rule: RemarketingRule | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertRemarketingRule);
  const listExpertsFn = useServerFn(listCrmExperts);
  const listFlowsFn = useServerFn(listFlows);
  const listChannelsFn = useServerFn(listWhatsappChannels);
  const listStagesFn = useServerFn(listCrmStages);
  const listTagsFn = useServerFn(listCrmTags);

  // Prefill do vendedor (operação + canal) — só quando é criação nova
  const vendorSession = typeof window !== "undefined" ? getVendorSession() : null;
  const isVendor = !!vendorSession;
  const vendorExpert = vendorSession?.expert ?? null;
  const vendorFirstChannel = vendorSession?.wa_channel_ids?.[0] ?? null;

  const [nome, setNome] = useState(rule?.nome ?? "");
  const [ativo, setAtivo] = useState(rule?.ativo ?? true);
  const [operacao, setOperacao] = useState(rule?.operacao ?? vendorExpert ?? "");
  const [channelId, setChannelId] = useState<string>(rule?.channel_id ?? vendorFirstChannel ?? "");
  const [flowId, setFlowId] = useState<string>(rule?.flow_id ?? "");
  const [minutesBefore, setMinutesBefore] = useState<number>(rule?.minutes_before_close ?? 30);
  const [conditions, setConditions] = useState<RemarketingCondition[]>(rule?.conditions ?? []);
  const [flowPickerOpen, setFlowPickerOpen] = useState(false);

  const expertsQ = useQuery({ queryKey: ["crm-experts-all"], queryFn: () => listExpertsFn({}) });
  const flowsQ = useQuery({ queryKey: ["flows-all"], queryFn: () => listFlowsFn({}) });
  const channelsQ = useQuery({ queryKey: ["wa-channels-all"], queryFn: () => listChannelsFn({}) });
  const stagesQ = useQuery({
    queryKey: ["crm-stages", operacao],
    queryFn: () => listStagesFn({ data: { operacao } }),
    enabled: !!operacao,
  });
  const tagsQ = useQuery({
    queryKey: ["crm-tags", operacao],
    queryFn: () => listTagsFn({ data: { operacao } }),
    enabled: !!operacao,
  });

  const availableChannels = useMemo(() => {
    const list = (channelsQ.data ?? []) as any[];
    // Vendedor: só os canais dele
    if (isVendor && Array.isArray(vendorSession?.wa_channel_ids) && vendorSession!.wa_channel_ids!.length > 0) {
      const allowed = new Set(vendorSession!.wa_channel_ids!.map(String));
      return list.filter((c) => allowed.has(String(c.id)));
    }
    return list.filter((c) => !operacao || c.operacao_id === operacao || !c.operacao_id);
  }, [channelsQ.data, operacao, isVendor, vendorSession]);

  const selectedFlow = useMemo(
    () => (flowsQ.data ?? []).find((f: any) => f.id === flowId),
    [flowsQ.data, flowId],
  );

  const upsertMut = useMutation({
    mutationFn: async () => upsertFn({
      data: {
        id: rule?.id,
        nome, ativo, operacao,
        channel_id: channelId || null,
        flow_id: flowId,
        minutes_before_close: minutesBefore,
        conditions,
      },
    }),
    onSuccess: () => {
      toast.success(rule ? "Regra atualizada" : "Regra criada");
      qc.invalidateQueries({ queryKey: ["remarketing-rules"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const [newCondType, setNewCondType] = useState<"tag" | "stage">("tag");
  const [newCondValue, setNewCondValue] = useState<string>("");

  function addCondition() {
    if (!newCondValue) return;
    setConditions((prev) => [...prev, { type: newCondType, value: newCondValue }]);
    setNewCondValue("");
  }
  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar regra" : "Nova regra de remarketing"}</DialogTitle>
          <DialogDescription>
            Configure quando disparar o fluxo antes da janela de 24h fechar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Recuperar leads sem compra" />
            </div>
            <div>
              <Label>Ativo</Label>
              <div className="flex h-10 items-center">
                <Switch checked={ativo} onCheckedChange={setAtivo} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Operação</Label>
              <Select
                value={operacao}
                onValueChange={(v) => { setOperacao(v); setChannelId(""); setConditions([]); }}
                disabled={isVendor && !!vendorExpert}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(expertsQ.data ?? []).map((e: any) => (
                    <SelectItem key={e.id} value={e.nome}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isVendor && vendorExpert && (
                <p className="mt-1 text-[11px] text-muted-foreground">Operação do seu login.</p>
              )}
            </div>
            <div>
              <Label>Canal (opcional)</Label>
              <Select value={channelId || "__all__"} onValueChange={(v) => setChannelId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Todos os canais" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os canais da operação</SelectItem>
                  {availableChannels.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name ?? c.verified_name ?? c.display_phone_number ?? c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fluxo a disparar</Label>
              <Popover open={flowPickerOpen} onOpenChange={setFlowPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn("w-full justify-between font-normal", !flowId && "text-muted-foreground")}
                  >
                    <span className="truncate">
                      {selectedFlow ? (selectedFlow.nome ?? selectedFlow.name ?? selectedFlow.id) : "Pesquisar fluxo…"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar fluxo por nome…" />
                    <CommandList>
                      <CommandEmpty>Nenhum fluxo encontrado.</CommandEmpty>
                      <CommandGroup>
                        {(flowsQ.data ?? []).map((f: any) => {
                          const label = f.nome ?? f.name ?? f.id;
                          return (
                            <CommandItem
                              key={f.id}
                              value={String(label)}
                              onSelect={() => { setFlowId(f.id); setFlowPickerOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", flowId === f.id ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{label}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Minutos antes da janela fechar</Label>
              <Input
                type="number" min={1} max={1440} step={1}
                value={minutesBefore}
                onChange={(e) => setMinutesBefore(Math.max(1, Math.min(1440, Number(e.target.value) || 30)))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ex.: 30 = dispara 30 min antes da conversa completar 24h da última mensagem do cliente.
              </p>
            </div>
          </div>

          <div>
            <Label>Condições (todas precisam bater)</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conditions.length === 0 && (
                <span className="text-xs text-muted-foreground italic">Sem condições — dispara pra todo mundo na janela</span>
              )}
              {conditions.map((c, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  {c.type === "tag" ? <TagIcon className="h-3 w-3" /> : <Columns3 className="h-3 w-3" />}
                  {c.type === "tag" ? "Etiqueta:" : "Coluna:"} {c.value}
                  <button type="button" onClick={() => removeCondition(i)} className="ml-1 rounded hover:bg-muted">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className="w-32">
                <Label className="text-xs">Tipo</Label>
                <Select value={newCondType} onValueChange={(v) => { setNewCondType(v as any); setNewCondValue(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tag">Etiqueta</SelectItem>
                    <SelectItem value="stage">Coluna Kanban</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">{newCondType === "tag" ? "Etiqueta" : "Coluna"}</Label>
                <Select value={newCondValue} onValueChange={setNewCondValue} disabled={!operacao}>
                  <SelectTrigger>
                    <SelectValue placeholder={operacao ? "Selecione" : "Escolha a operação antes"} />
                  </SelectTrigger>
                  <SelectContent>
                    {newCondType === "tag"
                      ? (tagsQ.data ?? []).map((t: any) => (
                          <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>
                        ))
                      : (stagesQ.data ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={addCondition} disabled={!newCondValue}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => upsertMut.mutate()}
            disabled={!nome || !operacao || !flowId || upsertMut.isPending}
          >
            {upsertMut.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
