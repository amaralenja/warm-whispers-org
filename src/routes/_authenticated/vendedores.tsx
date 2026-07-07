import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Copy, KeyRound, Pencil, Plus, RefreshCw, Search, Settings2, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { VendorPermissionsDialog } from "@/components/vendor-permissions-dialog";
import { VendorEditDialog } from "@/components/vendor-edit-dialog";


export const Route = createFileRoute("/_authenticated/vendedores")({
  component: VendedoresPage,
  head: () => ({ meta: [{ title: "Vendedores · Operação X1" }] }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Não encontrado</div>,
});

type Vendedor = {
  id: number;
  utm: string | null;
  nome: string | null;
  expert: string | null;
  ativo: boolean | null;
  foto_url: string | null;
  meta: number | null;
  genero: string | null;
  codigo: string | null;
};

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function initials(s: string | null) {
  if (!s) return "?";
  const parts = s.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function VendedoresPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"todos" | "ativos" | "inativos">("ativos");
  const [permVendor, setPermVendor] = useState<Vendedor | null>(null);
  const [editVendor, setEditVendor] = useState<Vendedor | null>(null);
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["vendedores-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, utm, nome, expert, ativo, foto_url, meta, genero, codigo")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Vendedor[];
    },
  });

  async function regenerateCode(id: number) {
    const { data: newCode, error: rpcErr } = await supabase.rpc("generate_vendedor_codigo");
    if (rpcErr || !newCode) {
      toast.error("Falha ao gerar código");
      return;
    }
    const { error } = await supabase.from("vendedores").update({ codigo: newCode }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Novo código: ${newCode}`);
    qc.invalidateQueries({ queryKey: ["vendedores-list"] });
  }

  async function copyCode(code: string) {
    const text = String(code ?? "");
    if (!text) {
      toast.error("Vendedor sem código");
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(`Código ${text} copiado`);
    } catch (err) {
      console.error("[copyCode] falhou", err);
      toast.error(`Não deu pra copiar. Código: ${text}`);
    }
  }


  const filtered = useMemo(() => {
    const list = data ?? [];
    return list.filter((v) => {
      if (filter === "ativos" && !v.ativo) return false;
      if (filter === "inativos" && v.ativo) return false;
      if (!q.trim()) return true;
      const needle = q.toLowerCase();
      return (
        (v.nome ?? "").toLowerCase().includes(needle) ||
        (v.utm ?? "").toLowerCase().includes(needle) ||
        (v.expert ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, q, filter]);

  const totals = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      ativos: list.filter((v) => v.ativo).length,
      experts: new Set(list.map((v) => v.expert).filter(Boolean)).size,
    };
  }, [data]);

  return (
    <div className="space-y-6 p-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-500/15 via-card to-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Vendedores</h1>
            <p className="text-sm text-muted-foreground">Equipe da Operação X1</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: totals.total },
            { label: "Ativos", value: totals.ativos },
            { label: "Experts", value: totals.experts },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">{s.label}</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, UTM ou expert..."
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg border border-border bg-card p-1">
          {(["ativos", "todos", "inativos"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filter === k ? "bg-emerald-500/15 text-emerald-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600">
          <Plus className="h-4 w-4" /> Novo vendedor
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-secondary/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhum vendedor encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => (
            <div
              key={v.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5"
            >
              <div className="flex items-start gap-3">
                {v.foto_url ? (
                  <img
                    src={v.foto_url}
                    alt={v.nome ?? ""}
                    className="h-12 w-12 rounded-full border border-border/60 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-bold text-white">
                    {initials(v.nome)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">{v.nome ?? "—"}</h3>
                    {v.ativo ? (
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {v.utm && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[0.6rem] font-mono">
                        {v.utm}
                      </Badge>
                    )}
                    {v.expert && <span className="truncate">· {v.expert}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-2 border-t border-border/40 pt-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Target className="h-3.5 w-3.5" />
                    Meta
                  </div>
                  <div className="font-display font-semibold tabular-nums text-emerald-400">
                    {BRL(Number(v.meta ?? 0))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="font-mono text-sm font-bold tracking-widest text-foreground">
                      {v.codigo ?? "——————"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {v.codigo && (
                      <button
                        onClick={() => copyCode(v.codigo!)}
                        title="Copiar código"
                        className="rounded p-1 text-muted-foreground transition hover:bg-emerald-500/10 hover:text-emerald-400"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => regenerateCode(v.id)}
                      title="Gerar novo código"
                      className="rounded p-1 text-muted-foreground transition hover:bg-emerald-500/10 hover:text-emerald-400"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setEditVendor(v)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-[0.7rem] font-medium text-muted-foreground transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => setPermVendor(v)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-[0.7rem] font-medium text-muted-foreground transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Acessos
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <VendorPermissionsDialog
        open={!!permVendor}
        onOpenChange={(v) => !v && setPermVendor(null)}
        vendorId={permVendor?.id ?? null}
        vendorName={permVendor?.nome ?? null}
      />
      <VendorEditDialog
        open={!!editVendor || creating}
        onOpenChange={(v) => {
          if (!v) {
            setEditVendor(null);
            setCreating(false);
          }
        }}
        vendor={editVendor}
        onSaved={() => qc.invalidateQueries({ queryKey: ["vendedores-list"] })}
      />
    </div>
  );
}
