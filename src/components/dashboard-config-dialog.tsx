import { useEffect, useState } from "react";
import { Settings, Sparkles, Eye, Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useDashboardConfig, type DashboardConfig } from "@/lib/dashboard-config";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Lista de experts a configurar. Se vazia, esconde a seção. */
  experts: { id: number | string; nome: string }[];
  /** Quando true, mostra apenas o único expert do workspace ativo. */
  scoped?: boolean;
  scopedName?: string;
};

export function DashboardConfigDialog({ open, onOpenChange, experts, scoped, scopedName }: Props) {
  const { config, getShare, update, setShare } = useDashboardConfig();

  // estado local — só persiste no clique de Salvar
  const [draft, setDraft] = useState<DashboardConfig>(config);

  useEffect(() => {
    if (open) setDraft(config);
  }, [open, config]);

  const list = scoped && scopedName
    ? experts.filter((e) => e.nome === scopedName)
    : experts;

  function patchShare(name: string, val: number) {
    const v = Math.max(0, Math.min(100, Math.round(val)));
    setDraft((d) => ({ ...d, sharePct: { ...d.sharePct, [name]: v } }));
  }

  function handleSave() {
    // aplica deltas
    for (const e of list) {
      const desired = draft.sharePct[e.nome] ?? getShare(e.nome);
      setShare(e.nome, desired);
    }
    update({
      includeHighTicket: draft.includeHighTicket,
      showFinanceiro: draft.showFinanceiro,
      showGastosCard: draft.showGastosCard,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-popover">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-accent" />
            Configurar Dashboard
          </DialogTitle>
          <DialogDescription>
            {scoped
              ? `Personalize a operação ${scopedName}.`
              : "Personalize o que você quer ver na Visão Geral."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Nossa parte */}
          {list.length > 0 && (
            <section>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                <Sparkles className="h-3.5 w-3.5" />
                Nossa parte por operação (%)
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Defina qual % do faturamento bruto líquido fica pra nós. Ex: Gu = 50% significa que recebemos metade do que ele fatura.
              </p>
              <div className="space-y-4">
                {list.map((e) => {
                  const v = draft.sharePct[e.nome] ?? getShare(e.nome);
                  return (
                    <div key={e.id}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{e.nome}</span>
                        <span className="text-sm font-bold text-emerald-400 tabular-nums">{v}%</span>
                      </div>
                      <Slider
                        value={[v]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={([val]) => patchShare(e.nome, val)}
                      />
                      <p className="mt-1 text-[0.65rem] text-muted-foreground">
                        {v}% de R$ — bruto = nossa parte calculada em tempo real
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* High Ticket */}
          {!scoped && (
            <section className="border-t border-border pt-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-400">
                🎯 High Ticket
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={draft.includeHighTicket}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, includeHighTicket: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-foreground">Incluir High Ticket no Total Geral + Saldo</div>
                  <p className="text-xs text-muted-foreground">
                    Soma o faturamento de ht_vendas aos KPIs de Low Ticket para uma visão consolidada da operação.
                  </p>
                </div>
              </label>
            </section>
          )}

          {/* Visibilidade */}
          <section className="border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              Visibilidade
            </div>
            <div className="space-y-2.5">
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={draft.showFinanceiro}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, showFinanceiro: !!v }))}
                />
                <span className="text-sm text-foreground">Mostrar seção KPIs Financeiros (Lucro + Gastos + Saldo)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={draft.showGastosCard}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, showGastosCard: !!v }))}
                />
                <span className="text-sm text-foreground">Mostrar card de Gastos do Mês</span>
              </label>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary/50"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            <Save className="h-4 w-4" />
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
