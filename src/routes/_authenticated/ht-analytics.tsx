import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, Users, Calendar as CalIcon, Target, Award } from "lucide-react";
import { HTInteligencia } from "@/components/ht-inteligencia";

export const Route = createFileRoute("/_authenticated/ht-analytics")({
  component: HTAnalytics,
});

const fmtBRL = (n: number) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtInt = (n: number) => Math.round(n || 0).toLocaleString("pt-BR");
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;

type Range = "7d" | "30d" | "90d" | "mtd" | "all";
function rangeStart(r: Range): Date | null {
  const now = new Date();
  if (r === "all") return null;
  if (r === "mtd") return new Date(now.getFullYear(), now.getMonth(), 1);
  const days = r === "7d" ? 7 : r === "30d" ? 30 : 90;
  const d = new Date(now); d.setDate(d.getDate() - days); return d;
}

function HTAnalytics() {
  const [range, setRange] = useState<Range>("30d");
  const [leads, setLeads] = useState<any[]>([]);
  const [vendas, setVendas] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [reunioes, setReunioes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const [l, v, a, r] = await Promise.all([
        supabase.from("ht_leads").select("*").limit(5000),
        supabase.from("ht_vendas").select("*").limit(5000),
        supabase.from("ht_alunos").select("*").limit(5000),
        supabase.from("ht_reunioes").select("*").limit(5000),
      ]);
      if (cancel) return;
      setLeads(l.data ?? []);
      setVendas(v.data ?? []);
      setAlunos(a.data ?? []);
      setReunioes(r.data ?? []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const start = rangeStart(range);
  const inRange = (d?: string | null) => {
    if (!d) return false;
    if (!start) return true;
    return new Date(d) >= start;
  };

  const kpis = useMemo(() => {
    const vFilt = vendas.filter((x) => inRange(x.data ?? x.created_at));
    const lFilt = leads.filter((x) => inRange(x.created_at));
    const rFilt = reunioes.filter((x) => inRange(x.data));
    const receita = vFilt.reduce((s, x) => s + Number(x.valor_total || 0), 0);
    const liquido = vFilt.reduce((s, x) => s + Number(x.valor_liquido || 0), 0);
    const comissao = vFilt.reduce((s, x) => s + Number(x.comissao_valor || 0), 0);
    const ticket = vFilt.length ? receita / vFilt.length : 0;
    const conv = lFilt.length ? (vFilt.length / lFilt.length) * 100 : 0;
    return {
      receita, liquido, comissao, ticket, conv,
      qtdVendas: vFilt.length,
      qtdLeads: lFilt.length,
      qtdReunioes: rFilt.length,
      qtdAlunos: alunos.length,
    };
  }, [vendas, leads, reunioes, alunos, range]);

  const funil = useMemo(() => {
    const lFilt = leads.filter((x) => inRange(x.created_at));
    const total = lFilt.length;
    const agendados = lFilt.filter((x) => x.data_agendamento).length;
    const compareceu = lFilt.filter((x) =>
      ["compareceu", "closed", "vendido", "ganho"].includes(String(x.status || "").toLowerCase())
    ).length;
    const vendidos = vendas.filter((x) => inRange(x.data ?? x.created_at)).length;
    return [
      { label: "Leads", value: total },
      { label: "Agendados", value: agendados },
      { label: "Compareceram", value: compareceu },
      { label: "Vendas", value: vendidos },
    ];
  }, [leads, vendas, range]);

  const porCloser = useMemo(() => {
    const map = new Map<string, { closer: string; vendas: number; receita: number }>();
    for (const v of vendas.filter((x) => inRange(x.data ?? x.created_at))) {
      const k = v.closer || "—";
      const cur = map.get(k) ?? { closer: k, vendas: 0, receita: 0 };
      cur.vendas += 1;
      cur.receita += Number(v.valor_total || 0);
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.receita - a.receita);
  }, [vendas, range]);

  const maxFunil = Math.max(1, ...funil.map((f) => f.value));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics — High Ticket</h1>
          <p className="text-sm text-muted-foreground">
            Métricas de leads, calls, vendas e closers.
          </p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
            <SelectItem value="mtd">Mês atual</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI icon={<DollarSign className="h-5 w-5" />} label="Receita" value={fmtBRL(kpis.receita)} sub={`${fmtInt(kpis.qtdVendas)} vendas`} />
        <KPI icon={<TrendingUp className="h-5 w-5" />} label="Líquido" value={fmtBRL(kpis.liquido)} sub={`Comissão ${fmtBRL(kpis.comissao)}`} />
        <KPI icon={<Target className="h-5 w-5" />} label="Ticket médio" value={fmtBRL(kpis.ticket)} sub={`Conversão ${fmtPct(kpis.conv)}`} />
        <KPI icon={<Users className="h-5 w-5" />} label="Leads" value={fmtInt(kpis.qtdLeads)} sub={`${fmtInt(kpis.qtdReunioes)} reuniões · ${fmtInt(kpis.qtdAlunos)} alunos`} />
      </div>

      <Tabs defaultValue="funil">
        <TabsList>
          <TabsTrigger value="funil">Funil</TabsTrigger>
          <TabsTrigger value="closers">Closers</TabsTrigger>
          <TabsTrigger value="vendas">Últimas vendas</TabsTrigger>
        </TabsList>

        <TabsContent value="funil" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Funil de conversão</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {funil.map((f) => (
                <div key={f.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground">{fmtInt(f.value)}</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(f.value / maxFunil) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closers" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Ranking de Closers</CardTitle></CardHeader>
            <CardContent>
              {porCloser.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem vendas no período.</div>
              ) : (
                <div className="space-y-2">
                  {porCloser.map((c, i) => (
                    <div key={c.closer} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-bold">{i + 1}</div>
                        <div>
                          <div className="font-medium">{c.closer}</div>
                          <div className="text-xs text-muted-foreground">{fmtInt(c.vendas)} vendas</div>
                        </div>
                      </div>
                      <div className="font-semibold">{fmtBRL(c.receita)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendas" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Últimas vendas</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr><th className="py-2">Data</th><th>Cliente</th><th>Produto</th><th>Closer</th><th className="text-right">Valor</th></tr>
                  </thead>
                  <tbody>
                    {vendas
                      .filter((x) => inRange(x.data ?? x.created_at))
                      .sort((a, b) => String(b.data ?? b.created_at).localeCompare(String(a.data ?? a.created_at)))
                      .slice(0, 25)
                      .map((v) => (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="py-2">{v.data ? new Date(v.data).toLocaleDateString("pt-BR") : "—"}</td>
                          <td>{v.cliente || "—"}</td>
                          <td>{v.produto || "—"}</td>
                          <td>{v.closer || "—"}</td>
                          <td className="text-right">{fmtBRL(Number(v.valor_total || 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {loading && <div className="text-xs text-muted-foreground">Carregando…</div>}
    </div>
  );
}

function KPI({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">{icon}{label}</div>
        <div className="text-2xl font-bold mt-2">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
