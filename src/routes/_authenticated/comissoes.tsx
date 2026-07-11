import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert, DollarSign, Users, Trophy, ChevronDown, ChevronRight, Copy, CheckSquare, Square, Save, KeyRound } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getVendorSession } from "@/lib/vendor-session";
import { getComissoes, setPixChave, TIERS } from "@/lib/comissoes.functions";

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
  const [selectedDays, setSelectedDays] = useState<Record<number, Record<string, boolean>>>({});

  const toggleDay = (id: number, iso: string) =>
    setSelectedDays((s) => {
      const cur = { ...(s[id] ?? {}) };
      if (cur[iso]) delete cur[iso]; else cur[iso] = true;
      return { ...s, [id]: cur };
    });
  const setAllDays = (id: number, isos: string[], on: boolean) =>
    setSelectedDays((s) => ({ ...s, [id]: on ? Object.fromEntries(isos.map((i) => [i, true])) : {} }));

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
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {(() => {
              const now = new Date();
              const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const yest = new Date(now); yest.setDate(now.getDate() - 1);
              const w0 = new Date(now); w0.setDate(now.getDate() - now.getDay());
              const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
              const lm0 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              const lm1 = new Date(now.getFullYear(), now.getMonth(), 0);
              const d7 = new Date(now); d7.setDate(now.getDate() - 6);
              const d30 = new Date(now); d30.setDate(now.getDate() - 29);
              const presets: Array<{ label: string; f: string; t: string }> = [
                { label: "Hoje", f: iso(now), t: iso(now) },
                { label: "Ontem", f: iso(yest), t: iso(yest) },
                { label: "7 dias", f: iso(d7), t: iso(now) },
                { label: "Esta semana", f: iso(w0), t: iso(now) },
                { label: "Este mês", f: iso(m0), t: iso(now) },
                { label: "Mês passado", f: iso(lm0), t: iso(lm1) },
                { label: "30 dias", f: iso(d30), t: iso(now) },
              ];
              return presets.map((p) => {
                const active = from === p.f && to === p.t;
                return (
                  <Button
                    key={p.label}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => { setFrom(p.f); setTo(p.t); }}
                  >
                    {p.label}
                  </Button>
                );
              });
            })()}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label>De</Label>
              <Input type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Até</Label>
              <Input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={() => { const d = today(); setFrom(d); setTo(d); }}
              >
                Só hoje
              </Button>
              <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
                {q.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Atualizar
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Período selecionado: <span className="font-medium text-foreground">{fmtDate(from)}</span> até <span className="font-medium text-foreground">{fmtDate(to)}</span>
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
                              ) : (() => {
                                const sel = selectedDays[r.id] ?? {};
                                const selDias = r.dias.filter((d) => sel[d.data]);
                                const allOn = selDias.length === r.dias.length;
                                const selFat = selDias.reduce((a, d) => a + d.faturamento, 0);
                                const selCom = selDias.reduce((a, d) => a + d.comissao, 0);
                                const selVendas = selDias.reduce((a, d) => a + d.vendas, 0);
                                const copyReport = async () => {
                                  const base = selDias.length ? selDias : r.dias;
                                  const lines = [
                                    `Comissões — ${r.nome} (${r.utm})`,
                                    `Período: ${fmtDate(from)} até ${fmtDate(to)}`,
                                    "",
                                    ...base.map((d) => `${fmtDate(d.data)} — Fat ${fmtBRL(d.faturamento)} | ${d.milhares}k × ${fmtBRL(d.rate)} = ${fmtBRL(d.comissao)}`),
                                    "",
                                    `Total: ${base.reduce((a, d) => a + d.faturamento, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} → Comissão ${base.reduce((a, d) => a + d.comissao, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
                                  ].join("\n");
                                  try { await navigator.clipboard.writeText(lines); toast.success("Relatório copiado"); }
                                  catch { toast.error("Falha ao copiar"); }
                                };
                                return (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button size="sm" variant="outline" onClick={() => setAllDays(r.id, r.dias.map((d) => d.data), !allOn)}>
                                        {allOn ? <><Square className="mr-1 h-3.5 w-3.5" /> Limpar</> : <><CheckSquare className="mr-1 h-3.5 w-3.5" /> Todos</>}
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={copyReport}>
                                        <Copy className="mr-1 h-3.5 w-3.5" /> Copiar relatório
                                      </Button>
                                      {selDias.length > 0 && (
                                        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
                                          <span><span className="text-muted-foreground">Dias:</span> <b>{selDias.length}</b></span>
                                          <span><span className="text-muted-foreground">Vendas:</span> <b>{selVendas}</b></span>
                                          <span><span className="text-muted-foreground">Fat:</span> <b>{fmtBRL(selFat)}</b></span>
                                          <span><span className="text-muted-foreground">Comissão:</span> <b className="text-accent">{fmtBRL(selCom)}</b></span>
                                        </div>
                                      )}
                                    </div>
                                    <table className="w-full text-xs">
                                      <thead className="text-muted-foreground">
                                        <tr>
                                          <th className="w-8 px-2 py-1"></th>
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
                                        {r.dias.map((d) => {
                                          const checked = !!sel[d.data];
                                          return (
                                            <tr
                                              key={d.data}
                                              className={`cursor-pointer border-t border-border/40 hover:bg-muted/20 ${checked ? "bg-accent/5" : ""}`}
                                              onClick={() => toggleDay(r.id, d.data)}
                                            >
                                              <td className="px-2 py-1"><Checkbox checked={checked} onCheckedChange={() => toggleDay(r.id, d.data)} onClick={(e) => e.stopPropagation()} /></td>
                                              <td className="px-2 py-1">{fmtDate(d.data)}</td>
                                              <td className="px-2 py-1 text-right">{d.vendas}</td>
                                              <td className="px-2 py-1 text-right">{fmtBRL(d.faturamento)}</td>
                                              <td className="px-2 py-1 text-right">{fmtBRL(d.cumulativo)}</td>
                                              <td className="px-2 py-1 text-right">{fmtBRL(d.rate)}</td>
                                              <td className="px-2 py-1 text-right">{d.milhares}</td>
                                              <td className="px-2 py-1 text-right font-semibold text-accent">{fmtBRL(d.comissao)}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              })()}
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
