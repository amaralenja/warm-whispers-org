import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert, DollarSign, Users, Trophy, ChevronDown, ChevronRight } from "lucide-react";
import { getVendorSession } from "@/lib/vendor-session";
import { getComissoes, TIERS } from "@/lib/comissoes.functions";

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
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

function ComissoesPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => { setIsAdmin(getVendorSession() === null); }, []);

  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const fetchComissoes = useServerFn(getComissoes);
  const q = useQuery({
    queryKey: ["comissoes", from, to],
    enabled: isAdmin === true,
    queryFn: () => fetchComissoes({ data: { from, to } }),
  });

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

  const rows = q.data?.rows ?? [];
  const totalFat = q.data?.totalFaturamento ?? 0;
  const totalCom = q.data?.totalComissao ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comissões</h1>
        <p className="text-sm text-muted-foreground">
          Cálculo automático por faixa: cada R$ 1.000 vendidos no dia paga conforme o acumulado do mês.
        </p>
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

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Faixas de comissão (por R$ 1.000 no dia)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[...TIERS].reverse().map((t) => (
            <Badge key={t.min} variant="outline" className="text-xs">
              {t.min === 0 ? "Até R$ 9.999" : `A partir de ${fmtBRL(t.min)}`} → <span className="ml-1 font-semibold text-accent">{fmtBRL(t.rate)}</span>
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> Vendedores</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{rows.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="h-4 w-4" /> Faturamento</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmtBRL(totalFat)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Trophy className="h-4 w-4" /> Total Comissão</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-accent">{fmtBRL(totalCom)}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhum vendedor com vendas no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-3 py-2 text-left">Vendedor</th>
                    <th className="px-3 py-2 text-left">UTM</th>
                    <th className="px-3 py-2 text-right">Vendas</th>
                    <th className="px-3 py-2 text-right">Faturamento</th>
                    <th className="px-3 py-2 text-right">Faixa atual</th>
                    <th className="px-3 py-2 text-right">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const open = !!expanded[r.id];
                    return (
                      <>
                        <tr
                          key={r.id}
                          className="cursor-pointer border-b hover:bg-muted/20"
                          onClick={() => setExpanded((e) => ({ ...e, [r.id]: !open }))}
                        >
                          <td className="px-2 py-2 text-muted-foreground">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {r.fotoUrl ? <img src={r.fotoUrl} alt="" className="h-7 w-7 rounded-full object-cover" /> : <div className="h-7 w-7 rounded-full bg-muted" />}
                              <div>
                                <div className="font-medium">{r.nome}</div>
                                {r.expert && <div className="text-xs text-muted-foreground">{r.expert}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{r.utm}</td>
                          <td className="px-3 py-2 text-right">{r.vendas}</td>
                          <td className="px-3 py-2 text-right">{fmtBRL(r.faturamento)}</td>
                          <td className="px-3 py-2 text-right">{fmtBRL(r.tierAtual)}<span className="text-xs text-muted-foreground">/mil</span></td>
                          <td className="px-3 py-2 text-right font-semibold text-accent">{fmtBRL(r.comissao)}</td>
                        </tr>
                        {open && (
                          <tr key={`${r.id}-detail`} className="border-b bg-muted/10">
                            <td colSpan={7} className="p-3">
                              {r.dias.length === 0 ? (
                                <div className="text-xs text-muted-foreground">Sem vendas no período.</div>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead className="text-muted-foreground">
                                    <tr>
                                      <th className="px-2 py-1 text-left">Dia</th>
                                      <th className="px-2 py-1 text-right">Vendas</th>
                                      <th className="px-2 py-1 text-right">Fat. dia</th>
                                      <th className="px-2 py-1 text-right">Acumulado mês</th>
                                      <th className="px-2 py-1 text-right">R$ / mil</th>
                                      <th className="px-2 py-1 text-right">Milhares</th>
                                      <th className="px-2 py-1 text-right">Comissão</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.dias.map((d) => (
                                      <tr key={d.data} className="border-t border-border/40">
                                        <td className="px-2 py-1">{fmtDate(d.data)}</td>
                                        <td className="px-2 py-1 text-right">{d.vendas}</td>
                                        <td className="px-2 py-1 text-right">{fmtBRL(d.faturamento)}</td>
                                        <td className="px-2 py-1 text-right">{fmtBRL(d.cumulativo)}</td>
                                        <td className="px-2 py-1 text-right">{fmtBRL(d.rate)}</td>
                                        <td className="px-2 py-1 text-right">{d.milhares}</td>
                                        <td className="px-2 py-1 text-right font-semibold text-accent">{fmtBRL(d.comissao)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
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
