import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Tag as TagIcon, Loader2, Columns3, Pencil, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  createCrmTag, deleteCrmTag, listCrmTags, updateCrmTag,
  listCrmStages, upsertCrmStage, deleteCrmStage,
} from "@/lib/crm.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type CrmTag = { id: string; nome: string; cor: string; operacao: string; stage_id: string | null };
export type CrmStage = { id: string; operacao: string; nome: string; cor: string; ordem: number };

const PRESET_COLORS = [
  "#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#a855f7",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b",
];

// Default stage IDs (also accepted by the trigger as text)
export const DEFAULT_STAGES: { id: string; nome: string; cor: string }[] = [
  { id: "novo", nome: "Novo", cor: "#3b82f6" },
  { id: "contato", nome: "Em contato", cor: "#f59e0b" },
  { id: "qualificado", nome: "Qualificado", cor: "#a855f7" },
  { id: "negociacao", nome: "Negociação", cor: "#f97316" },
  { id: "ganho", nome: "Ganho", cor: "#22c55e" },
  { id: "perdido", nome: "Perdido", cor: "#ef4444" },
];

// LocalStorage-persisted hidden default stages per operação.
const HIDDEN_KEY = (op: string) => `crm-hidden-stages:${op || "all"}`;
export function getHiddenDefaultStages(operacao: string | undefined): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY(operacao ?? "all"));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}
export function setHiddenDefaultStages(operacao: string | undefined, ids: string[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(HIDDEN_KEY(operacao ?? "all"), JSON.stringify(ids)); } catch {}
  try { window.dispatchEvent(new CustomEvent("crm-hidden-stages-changed")); } catch {}
}
export function useHiddenDefaultStages(operacao: string | undefined): [string[], (ids: string[]) => void] {
  const [hidden, setHidden] = useState<string[]>(() => getHiddenDefaultStages(operacao));
  useEffect(() => { setHidden(getHiddenDefaultStages(operacao)); }, [operacao]);
  useEffect(() => {
    const on = () => setHidden(getHiddenDefaultStages(operacao));
    window.addEventListener("crm-hidden-stages-changed", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("crm-hidden-stages-changed", on);
      window.removeEventListener("storage", on);
    };
  }, [operacao]);
  const update = (ids: string[]) => { setHiddenDefaultStages(operacao, ids); setHidden(ids); };
  return [hidden, update];
}

export function useCrmTags(operacao: string | undefined) {
  const listTagsFn = useServerFn(listCrmTags);
  return useQuery({
    queryKey: ["crm-tags", operacao ?? "all"],
    queryFn: async () => (await listTagsFn({ data: { operacao: operacao ?? "all" } })) as CrmTag[],
  });
}

export function useCrmStages(operacao: string | undefined) {
  const listStagesFn = useServerFn(listCrmStages);
  return useQuery({
    queryKey: ["crm-stages", operacao ?? "all"],
    queryFn: async () => (await listStagesFn({ data: { operacao: operacao ?? "all" } })) as CrmStage[],
  });
}

export function TagsManagerDialog({
  open, onOpenChange, operacao,
}: { open: boolean; onOpenChange: (v: boolean) => void; operacao: string }) {
  const qc = useQueryClient();
  const createTagFn = useServerFn(createCrmTag);
  const updateTagFn = useServerFn(updateCrmTag);
  const deleteTagFn = useServerFn(deleteCrmTag);
  const { data: tags = [], isLoading } = useCrmTags(operacao);
  const { data: customStages = [] } = useCrmStages(operacao);

  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(PRESET_COLORS[0]);
  const [stageId, setStageId] = useState<string>("none");

  useEffect(() => {
    if (!open) { setNome(""); setCor(PRESET_COLORS[0]); setStageId("none"); }
  }, [open]);

  const stageOptions = [
    ...DEFAULT_STAGES.map((s) => ({ id: s.id, label: s.nome, cor: s.cor })),
    ...customStages.map((s) => ({ id: s.id, label: s.nome, cor: s.cor })),
  ];

  const create = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (!n) throw new Error("Nome obrigatório");
      await createTagFn({ data: { nome: n, cor, operacao, stage_id: stageId === "none" ? null : stageId } });
    },
    onSuccess: () => {
      toast.success("Etiqueta criada");
      setNome(""); setStageId("none");
      qc.invalidateQueries({ queryKey: ["crm-tags"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string | null }) =>
      updateTagFn({ data: { id, stage_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-tags"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteTagFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Etiqueta removida");
      qc.invalidateQueries({ queryKey: ["crm-tags"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><TagIcon className="h-5 w-5" /> Etiquetas — {operacao}</DialogTitle>
          <DialogDescription>Crie etiquetas e vincule a uma coluna. Quando a etiqueta for aplicada no lead, ele move automaticamente pra coluna ligada.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-medium">Nova etiqueta</p>
            <div className="flex gap-2">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create.mutate()}
                placeholder="Ex: Quente, VIP, Sem resposta…"
              />
              <Button onClick={() => create.mutate()} disabled={create.isPending || !nome.trim()}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  className={`h-6 w-6 rounded-full border-2 ${cor === c ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">Mover lead pra coluna ao aplicar:</p>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhuma —</SelectItem>
                  {stageOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 max-h-[300px] overflow-y-auto scrollbar-fancy">
            {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
            {!isLoading && tags.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma etiqueta ainda.</p>
            )}
            {tags.map((t) => {
              const linked = stageOptions.find((s) => s.id === t.stage_id);
              return (
                <div key={t.id} className="flex items-center gap-2 rounded-md border p-2">
                  <Badge style={{ backgroundColor: t.cor, color: "white" }}>{t.nome}</Badge>
                  <Select
                    value={t.stage_id ?? "none"}
                    onValueChange={(v) => updateStage.mutate({ id: t.id, stage_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="ml-auto h-7 w-[180px] text-[11px]">
                      <SelectValue placeholder="Sem coluna">
                        {linked ? `→ ${linked.label}` : "Sem coluna"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhuma —</SelectItem>
                      {stageOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={() => remove.mutate(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StagesManagerDialog({
  open, onOpenChange, operacao,
}: { open: boolean; onOpenChange: (v: boolean) => void; operacao: string }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertCrmStage);
  const deleteFn = useServerFn(deleteCrmStage);
  const { data: stages = [], isLoading } = useCrmStages(operacao);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");

  useEffect(() => { if (!open) { setNome(""); setCor(PRESET_COLORS[0]); setEditingId(null); } }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (!n) throw new Error("Nome obrigatório");
      await upsertFn({ data: { operacao, nome: n, cor, ordem: stages.length + 1 } });
    },
    onSuccess: () => {
      toast.success("Coluna criada");
      setNome("");
      qc.invalidateQueries({ queryKey: ["crm-stages"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const update = useMutation({
    mutationFn: async (s: CrmStage) => upsertFn({ data: { id: s.id, operacao: s.operacao, nome: s.nome, cor: s.cor, ordem: s.ordem } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-stages"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Coluna removida");
      qc.invalidateQueries({ queryKey: ["crm-stages"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Columns3 className="h-5 w-5" /> Colunas do CRM — {operacao}</DialogTitle>
          <DialogDescription>
            Personalize as colunas além das padrões (Novo, Em contato, Qualificado…). Vincule etiquetas no menu de Etiquetas pra mover leads automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-medium">Nova coluna</p>
            <div className="flex gap-2">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create.mutate()}
                placeholder="Ex: Reagendar, Esperando pagamento…"
              />
              <Button onClick={() => create.mutate()} disabled={create.isPending || !nome.trim()}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setCor(c)}
                  className={`h-6 w-6 rounded-full border-2 ${cor === c ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Colunas padrão</p>
            {DEFAULT_STAGES.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border border-dashed p-2 opacity-70">
                <span className="h-3 w-3 rounded-full" style={{ background: s.cor }} />
                <span className="text-sm">{s.nome}</span>
                <span className="ml-auto text-[10px] uppercase text-muted-foreground">padrão</span>
              </div>
            ))}
          </div>

          <div className="space-y-2 max-h-[260px] overflow-y-auto scrollbar-fancy">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Colunas customizadas</p>
            {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
            {!isLoading && stages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhuma coluna personalizada.</p>
            )}
            {stages.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border p-2">
                <span className="h-3 w-3 rounded-full" style={{ background: s.cor }} />
                {editingId === s.id ? (
                  <>
                    <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-7 flex-1" />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                      update.mutate({ ...s, nome: editNome.trim() || s.nome });
                      setEditingId(null);
                    }}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm flex-1">{s.nome}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(s.id); setEditNome(s.nome); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={() => remove.mutate(s.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
