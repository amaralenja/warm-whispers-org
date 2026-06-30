import { useEffect, useMemo, useState } from "react";
import { Loader2, Settings2, Phone, Scale, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MENU_TREE, defaultPermissoes, type Permissoes } from "@/lib/menu-permissions";
import { BASE_WORKSPACES, type Workspace } from "@/lib/workspace-context";


type Channel = {
  id: string;
  name: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  operacao_id: string | null;
};

export function VendorPermissionsDialog({
  open,
  onOpenChange,
  vendorId,
  vendorName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendorId: number | null;
  vendorName?: string | null;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissoes, setPermissoes] = useState<Permissoes>(defaultPermissoes());
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [workspaceOptions, setWorkspaceOptions] = useState<Workspace[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [leadWeight, setLeadWeight] = useState<number>(1);
  const [pool, setPool] = useState<Array<{ id: number; nome: string | null; lead_weight: number; wa_channel_ids: string[] }>>([]);


  useEffect(() => {
    if (!open || vendorId == null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const customWorkspaces = (() => {
          try {
            const parsed = JSON.parse(localStorage.getItem("multium.workspace.list") || "[]");
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })();
        setWorkspaceOptions([
          ...BASE_WORKSPACES.filter((w) => w.id !== "all"),
          ...customWorkspaces
            .filter((w: any) => w?.id && w?.nome)
            .map((w: any) => ({ ...w, custom: true } as Workspace)),
        ]);
        const [vendRes, chanRes, poolRes] = await Promise.all([
          supabase
            .from("vendedores")
            .select("permissoes, wa_channel_ids, workspace_ids, lead_weight, expert")
            .eq("id", vendorId)
            .maybeSingle(),
          supabase
            .from("wa_channels" as any)
            .select("id, name, display_phone_number, verified_name, operacao_id")
            .order("name", { ascending: true }),
          supabase
            .from("vendedores")
            .select("id, nome, lead_weight, wa_channel_ids, ativo")
            .eq("ativo", true),
        ]);
        if (cancelled) return;
        const v = vendRes.data as any;
        const merged = { ...defaultPermissoes(), ...((v?.permissoes as Permissoes) ?? {}) };
        setPermissoes(merged);
        setChannelIds(Array.isArray(v?.wa_channel_ids) ? v.wa_channel_ids : []);
        setWorkspaceIds(Array.isArray(v?.workspace_ids) ? v.workspace_ids : (v?.expert ? [String(v.expert)] : []));
        setLeadWeight(Number(v?.lead_weight ?? 1));
        setChannels(((chanRes.data as any) ?? []) as Channel[]);
        setPool(
          (((poolRes.data as any) ?? []) as any[]).map((p) => ({
            id: p.id,
            nome: p.nome,
            lead_weight: Number(p.lead_weight ?? 1),
            wa_channel_ids: Array.isArray(p.wa_channel_ids) ? p.wa_channel_ids : [],
          })),
        );

      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao carregar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, vendorId]);

  const visibleChannels = useMemo(
    () => channels.filter((c) => c.operacao_id && workspaceIds.includes(c.operacao_id)),
    [channels, workspaceIds],
  );

  const groupedChannels = useMemo(() => {
    const m = new Map<string, Channel[]>();
    for (const c of visibleChannels) {
      const k = c.operacao_id || "Outros";
      const arr = m.get(k) ?? [];
      arr.push(c);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [visibleChannels]);

  // Sempre que um workspace é desmarcado, remove canais daquele workspace da seleção
  useEffect(() => {
    const allowed = new Set(visibleChannels.map((c) => c.id));
    setChannelIds((prev) => {
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [visibleChannels]);


  function setLeaf(groupKey: string, leafKey: string, v: boolean) {
    setPermissoes((prev) => {
      const node = prev[groupKey];
      const sub = typeof node === "object" ? { ...node } : {};
      sub[leafKey] = v;
      return { ...prev, [groupKey]: sub };
    });
  }
  function setTop(groupKey: string, v: boolean) {
    setPermissoes((prev) => {
      const node = prev[groupKey];
      if (typeof node === "object") {
        const sub: Record<string, boolean> = {};
        for (const k of Object.keys(node)) sub[k] = v;
        return { ...prev, [groupKey]: sub };
      }
      return { ...prev, [groupKey]: v };
    });
  }
  function isTopOn(groupKey: string): boolean {
    const node = permissoes[groupKey];
    if (typeof node === "boolean") return node;
    if (typeof node === "object") return Object.values(node).some((v) => v !== false);
    return true;
  }

  async function save() {
    if (vendorId == null) return;
    setSaving(true);
    const { error } = await supabase
      .from("vendedores")
      .update({
        permissoes: permissoes as any,
        wa_channel_ids: channelIds as any,
        workspace_ids: workspaceIds as any,
        lead_weight: leadWeight,
      } as any)
      .eq("id", vendorId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Distribuição e permissões salvas");
    onSaved?.();
    onOpenChange(false);
  }

  // calcula share % deste vendedor em cada canal, considerando o pool ao vivo + drafts
  function shareForChannel(channelId: string): { pct: number; total: number; meu: number } {
    const others = pool.filter((p) => p.id !== vendorId && p.wa_channel_ids.includes(channelId));
    const meIn = channelIds.includes(channelId);
    const meW = meIn ? Math.max(0, Number(leadWeight) || 0) : 0;
    const sum = others.reduce((a, p) => a + Math.max(0, p.lead_weight), 0) + meW;
    return {
      pct: sum > 0 ? (meW / sum) * 100 : 0,
      total: others.length + (meIn ? 1 : 0),
      meu: meW,
    };
  }

  async function balanceChannel(channelId: string) {
    const ids = pool
      .filter((p) => p.wa_channel_ids.includes(channelId) || (p.id === vendorId && channelIds.includes(channelId)))
      .map((p) => p.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("vendedores")
      .update({ lead_weight: 1 } as any)
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLeadWeight(1);
    setPool((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, lead_weight: 1 } : p)));
    toast.success(`Distribuído igualmente entre ${ids.length} vendedores`);
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto scrollbar-fancy">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-emerald-400" />
            Gerenciar acessos {vendorName ? `— ${vendorName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Defina quais menus o vendedor enxerga e quais números de WhatsApp ele atende.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Menus */}
            <section>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Menus visíveis
              </h4>
              <div className="space-y-2">
                {MENU_TREE.map((node) => {
                  const isGroup = "children" in node;
                  return (
                    <div key={node.key} className="rounded-lg border border-border bg-card/40 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{node.title}</div>
                        <Switch
                          checked={isTopOn(node.key)}
                          onCheckedChange={(v) => setTop(node.key, v)}
                        />
                      </div>
                      {isGroup && (
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/40 pt-3">
                          {node.children.map((c) => {
                            const sub = permissoes[node.key];
                            const checked =
                              typeof sub === "object" ? sub[c.key] !== false : !!sub;
                            return (
                              <label
                                key={c.key}
                                className="flex cursor-pointer items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => setLeaf(node.key, c.key, !!v)}
                                />
                                <span>{c.title}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Canais */}
            <section>
              <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5" /> Workspaces liberados
              </h4>
              {workspaceOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Nenhum workspace cadastrado.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card/40 p-3">
                  {workspaceOptions.map((w) => (
                    <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-accent/5">
                      <Checkbox
                        checked={workspaceIds.includes(w.id)}
                        onCheckedChange={(v) =>
                          setWorkspaceIds((prev) =>
                            v ? Array.from(new Set([...prev, w.id])) : prev.filter((x) => x !== w.id),
                          )
                        }
                      />
                      <span>{w.nome}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[0.7rem] text-muted-foreground">
                O vendedor só enxerga os workspaces marcados aqui — nada de “Geral”.
              </p>
            </section>

            <section>
              <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Phone className="h-3.5 w-3.5" /> Números de WhatsApp atendidos
              </h4>
              {channels.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Nenhum canal cadastrado.
                </div>
              ) : (
                <div className="space-y-3">
                  {groupedChannels.map(([op, list]) => (
                    <div key={op} className="rounded-lg border border-border bg-card/40 p-3">
                      <div className="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                        {op}
                      </div>
                      <div className="space-y-2">
                        {list.map((c) => {
                          const checked = channelIds.includes(c.id);
                          const s = shareForChannel(c.id);
                          return (
                            <div
                              key={c.id}
                              className="flex items-center gap-3 rounded-md p-1 hover:bg-accent/5"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  setChannelIds((prev) =>
                                    v ? Array.from(new Set([...prev, c.id])) : prev.filter((x) => x !== c.id),
                                  )
                                }
                              />
                              <div className="flex-1 text-sm">
                                <div className="font-medium">
                                  {c.verified_name || c.name || "Sem nome"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {c.display_phone_number ?? "—"}
                                </div>
                              </div>
                              {checked && (
                                <>
                                  <span
                                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-bold tabular-nums text-emerald-400"
                                    title={`Você recebe ${s.pct.toFixed(1)}% dos leads deste canal (${s.total} vendedores no pool)`}
                                  >
                                    {s.pct.toFixed(0)}%
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => balanceChannel(c.id)}
                                    title="Distribuir igualmente entre todos os vendedores deste canal"
                                    className="rounded p-1 text-muted-foreground transition hover:bg-emerald-500/10 hover:text-emerald-400"
                                  >
                                    <Scale className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Peso de distribuição */}
            <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Scale className="h-4 w-4 text-emerald-400" />
                    Peso na randomização
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Quanto maior o peso, mais leads novos caem nesse vendedor. Todos iguais (1) = divisão igual entre os do canal.
                  </p>
                </div>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={leadWeight}
                  onChange={(e) => setLeadWeight(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 text-center font-bold tabular-nums"
                />
              </div>
            </section>


          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
