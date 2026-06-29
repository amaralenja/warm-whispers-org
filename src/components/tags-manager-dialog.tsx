import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Tag as TagIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type CrmTag = { id: string; nome: string; cor: string; operacao: string };

const PRESET_COLORS = [
  "#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#a855f7",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b",
];

export function useCrmTags(operacao: string | undefined) {
  return useQuery({
    queryKey: ["crm-tags", operacao ?? "all"],
    queryFn: async () => {
      let q = supabase.from("crm_tags").select("*").order("nome");
      if (operacao && operacao !== "all") q = q.eq("operacao", operacao);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CrmTag[];
    },
  });
}

export function TagsManagerDialog({
  open, onOpenChange, operacao,
}: { open: boolean; onOpenChange: (v: boolean) => void; operacao: string }) {
  const qc = useQueryClient();
  const { data: tags = [], isLoading } = useCrmTags(operacao);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(PRESET_COLORS[0]);

  useEffect(() => { if (!open) { setNome(""); setCor(PRESET_COLORS[0]); } }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (!n) throw new Error("Nome obrigatório");
      const { error } = await supabase.from("crm_tags").insert({ nome: n, cor, operacao });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etiqueta criada");
      setNome("");
      qc.invalidateQueries({ queryKey: ["crm-tags"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_tags").delete().eq("id", id);
      if (error) throw error;
    },
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
          <DialogDescription>Crie etiquetas pra usar no CRM e em blocos de fluxo.</DialogDescription>
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
          </div>

          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
            {!isLoading && tags.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma etiqueta ainda.</p>
            )}
            {tags.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border p-2">
                <Badge style={{ backgroundColor: t.cor, color: "white" }}>{t.nome}</Badge>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={() => remove.mutate(t.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
