import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Percent, DollarSign, Users, Save } from "lucide-react";
import { getVendorSession } from "@/lib/vendor-session";
import { getComissoes, setComissaoPct } from "@/lib/comissoes.functions";

export const Route = createFileRoute("/_authenticated/comissoes")({
  component: ComissoesPage,
});

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ComissoesPage() {
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => { setIsAdmin(getVendorSession() === null); }, []);

  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());

  const fetchComissoes = useServerFn(getComissoes);
  const savePct = useServerFn(setComissaoPct);

  const q = useQuery({
    queryKey: ["comissoes", from, to],
    enabled: isAdmin === true,
    queryFn: () => fetchComissoes({ data: { from, to } }),
  });

  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const rows = q.data?.rows ?? [];

  const totals = useMemo(() => {
    let fat = 0, com = 0;
    for (const r of rows) {
      const pct = drafts[r.id] !== undefined ? Number(drafts[r.id]) || 0 : r.comissaoPct;
      fat += r.faturamento;
      com += r.faturamento * (pct / 100);
    }
    return { fat, com };
  }, [rows, drafts]);

  async function handleSave(id: number, currentPct: number) {
    const raw = drafts[id];
    const pct = raw !== undefined ? Number(raw) : currentPct;
    if (!Number.isFinite(pct)) { toast.error("% inválido"); return; }
    try {
      await savePct({ data: { id, pct } });
      toast.success("Comissão atualizada");
      setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
      qc.invalidateQueries({ queryKey: ["comissoes"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    }
  }

  if (isAdmin === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <div>
              <div className="font-semibold">Acesso restrito</div>
              <p className="text-sm text-muted-foreground">Somente administradores podem visualizar comissões.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comissões</h1>
        <p className="text-sm text-muted-foreground">Configure o % de comissão por vendedor e acompanhe os valores a pagar no período.</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
              {q.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> Vendedores</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{rows.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="h-4 w-4" /> Faturamento</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmtBRL(totals.fat)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Percent className="h-4 w-4" /> Total Comissão</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-accent">{fmtBRL(totals.com)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhum vendedor com vendas no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Vendedor</th>
                    <th className="px-3 py-2 text-left">UTM</th>
                    <th className="px-3 py-2 text-right">Vendas</th>
                    <th className="px-3 py-2 text-right">Faturamento</th>
                    <th className="px-3 py-2 text-right">%</th>
                    <th className="px-3 py-2 text-right">Comissão</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const draft = drafts[r.id];
                    const pct = draft !== undefined ? Number(draft) || 0 : r.comissaoPct;
                    const valor = r.faturamento * (pct / 100);
                    const dirty = draft !== undefined && Number(draft) !== r.comissaoPct;
                    return (
                      <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {r.fotoUrl ? (
                              <img src={r.fotoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-muted" />
                            )}
                            <div>
                              <div className="font-medium">{r.nome}</div>
                              {r.expert && <div className="text-xs text-muted-foreground">{r.expert}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{r.utm}</td>
                        <td className="px-3 py-2 text-right">{r.vendas}</td>
                        <td className="px-3 py-2 text-right">{fmtBRL(r.faturamento)}</td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            className="ml-auto h-8 w-20 text-right"
                            value={draft ?? String(r.comissaoPct)}
                            onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-accent">{fmtBRL(valor)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant={dirty ? "default" : "ghost"}
                            disabled={!dirty}
                            onClick={() => handleSave(r.id, r.comissaoPct)}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
