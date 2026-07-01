import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, Users, CheckCircle2, XCircle, Flame } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const QUIZ_SUPABASE_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";

const quizSb = createClient(QUIZ_SUPABASE_URL, QUIZ_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type QLead = {
  id: string;
  data_criacao: string;
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
  caixa_letra: string | null;
  caixa_label: string | null;
  faturamento: string | null;
  momento: string | null;
  situacao: string | null;
  renda: string | null;
  objetivo: string | null;
  socio: string | null;
  investir: string | null;
  porque: string | null;
  comprometimento: string | null;
  minicurso: string | null;
  funil: string | null;
  last_step: string | null;
  respostas_json: Record<string, unknown> | null;
};

type Period = "today" | "yesterday" | "7d" | "15d" | "30d" | "all";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "#22c55e", "#3b82f6", "#f97316", "#a855f7", "#eab308",
  "#06b6d4", "#ef4444", "#ec4899", "#14b8a6", "#84cc16", "#f59e0b",
];

function periodRange(p: Period): { start: Date | null; end: Date | null } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (p === "all") return { start: null, end: null };
  if (p === "today") return { start: today, end: tomorrow };
  if (p === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { start: y, end: today };
  }
  const days = p === "7d" ? 7 : p === "15d" ? 15 : 30;
  const s = new Date(today); s.setDate(s.getDate() - days);
  return { start: s, end: tomorrow };
}


function isFinalizado(l: QLead) {
  return !!(l.whatsapp && l.caixa_letra && (l.comprometimento || l.momento));
}
function isQuente(l: QLead) {
  const c = (l.caixa_letra ?? "").toUpperCase();
  return (c === "D" || c === "E" || c === "F" || c === "G") &&
    /(sim|compromet)/i.test(l.comprometimento ?? "");
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function HTInteligencia() {
  const [period, setPeriod] = useState<Period>("all");
  const [leads, setLeads] = useState<QLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const start = periodStart(period);
      const startIso = start ? start.toISOString() : null;
      let all: QLead[] = [];
      const pageSize = 1000;
      let from = 0;
      // Loop pages until under pageSize
      // Cap safety at 20k
      for (let i = 0; i < 20; i++) {
        let q = quizSb.from("leads").select("*", { count: "exact" })
          .order("data_criacao", { ascending: false })
          .range(from, from + pageSize - 1);
        if (startIso) q = q.gte("data_criacao", startIso);
        const { data, error, count } = await q;
        if (error) break;
        const rows = (data ?? []) as QLead[];
        all = all.concat(rows);
        if (typeof count === "number") setTotal(count);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      if (!cancel) { setLeads(all); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [period, nonce]);

  const kpis = useMemo(() => {
    const iniciados = leads.length;
    const finalizados = leads.filter(isFinalizado).length;
    const abandonos = iniciados - finalizados;
    const quentes = leads.filter(isQuente).length;
    const conv = iniciados > 0 ? (finalizados / iniciados) * 100 : 0;
    return { iniciados, finalizados, abandonos, quentes, conv };
  }, [leads]);

  const fluxoDiario = useMemo(() => {
    const map = new Map<string, { date: string; acessos: number; finalizados: number }>();
    for (const l of leads) {
      const d = new Date(l.data_criacao);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const cur = map.get(key) ?? { date: key, acessos: 0, finalizados: 0 };
      cur.acessos += 1;
      if (isFinalizado(l)) cur.finalizados += 1;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((x) => ({ ...x, label: fmtDate(x.date) }));
  }, [leads]);

  const porHorario = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2, "0")}:00`, finalizados: 0 }));
    for (const l of leads) {
      if (!isFinalizado(l)) continue;
      const h = new Date(l.data_criacao).getHours();
      arr[h].finalizados += 1;
    }
    return arr;
  }, [leads]);

  const divisaoCaixa = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const k = (l.caixa_label ?? "").trim();
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  const statusConv = useMemo(() => [
    { name: "Finalizados", value: kpis.finalizados },
    { name: "Abandonaram", value: kpis.abandonos },
  ], [kpis]);

  // Análise de respostas por campo pergunta
  const perguntas: { key: keyof QLead; label: string }[] = [
    { key: "momento", label: "Momento Atual" },
    { key: "faturamento", label: "Lucro Líquido Mensal" },
    { key: "objetivo", label: "Meta de Ganho" },
    { key: "caixa_label", label: "Caixa Disponível" },
    { key: "investir", label: "Já tentou criar SaaS?" },
    { key: "minicurso", label: "Já tem ideia de SaaS?" },
    { key: "socio", label: "Tem Sócio/Cônjuge?" },
    { key: "comprometimento", label: "Comprometimento com a Call" },
  ];

  const analiseRespostas = useMemo(() => {
    return perguntas.map(({ key, label }) => {
      const map = new Map<string, number>();
      let total = 0;
      for (const l of leads) {
        const v = l[key];
        const s = typeof v === "string" ? v.trim() : "";
        if (!s) continue;
        map.set(s, (map.get(s) ?? 0) + 1);
        total++;
      }
      const items = Array.from(map.entries())
        .map(([k, v]) => ({ label: k, value: v }))
        .sort((a, b) => b.value - a.value);
      return { key, label, total, items };
    });
  }, [leads]);

  // Funil de abandono por last_step
  const funilAbandono = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      if (isFinalizado(l)) continue;
      const k = (l.last_step ?? l.funil ?? "").trim() || "início";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 16);
  }, [leads]);

  const maxFunil = Math.max(1, ...funilAbandono.map((x) => x.value));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Inteligência & Resultados</h2>
          <p className="text-xs text-muted-foreground">
            {loading ? "Carregando…" : `${total.toLocaleString("pt-BR")} leads na base • exibindo ${leads.length.toLocaleString("pt-BR")}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="15d">Últimos 15 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="all">Todo o período</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI accent="border-t-blue-500" icon={<Users className="h-4 w-4" />} label="INICIADOS (ACESSOS)" value={kpis.iniciados.toLocaleString("pt-BR")} sub="Abriram o formulário" />
        <KPI accent="border-t-emerald-500" icon={<CheckCircle2 className="h-4 w-4" />} label="FINALIZADOS" value={kpis.finalizados.toLocaleString("pt-BR")} sub={`Taxa de conversão: ${kpis.conv.toFixed(1)}%`} />
        <KPI accent="border-t-orange-500" icon={<XCircle className="h-4 w-4" />} label="ABANDONOS" value={kpis.abandonos.toLocaleString("pt-BR")} sub="Pararam antes do fim" />
        <KPI accent="border-t-fuchsia-500" icon={<Flame className="h-4 w-4" />} label="LEADS QUENTES" value={kpis.quentes.toLocaleString("pt-BR")} sub="Caixa D+ comprometidos" />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Visão Geral em Gráficos</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Fluxo Diário</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fluxoDiario}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Bar dataKey="acessos" fill="#3b82f6" name="Acessos" />
                  <Bar dataKey="finalizados" fill="#22c55e" name="Finalizados" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Formulários por Horário</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={porHorario}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hora" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="finalizados" stroke="#a855f7" strokeWidth={2} dot={false} name="Finalizados" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Divisão de Caixa (Bolso)</CardTitle></CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={divisaoCaixa} dataKey="value" nameKey="name" outerRadius={90}>
                    {divisaoCaixa.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Status / Conversão</CardTitle></CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusConv} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                    <Cell fill="#22c55e" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Onde os leads estão abandonando? (Funil)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {funilAbandono.length === 0 && <div className="text-sm text-muted-foreground">Sem dados no período.</div>}
          {funilAbandono.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-xs truncate">{f.label}</div>
              <div className="flex-1 h-6 bg-muted/40 rounded overflow-hidden relative">
                <div className="h-full bg-red-500/70" style={{ width: `${(f.value / maxFunil) * 100}%` }} />
              </div>
              <div className="w-16 text-right text-xs font-semibold">{f.value.toLocaleString("pt-BR")}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-3">Análise de Respostas (Enquetes)</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {analiseRespostas.map((p) => {
            const max = Math.max(1, ...p.items.map((i) => i.value));
            return (
              <Card key={String(p.key)} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{p.label}</CardTitle>
                  <div className="text-xs text-muted-foreground">{p.total.toLocaleString("pt-BR")} respostas</div>
                </CardHeader>
                <CardContent className="space-y-1.5 max-h-80 overflow-auto">
                  {p.items.length === 0 && <div className="text-xs text-muted-foreground">Sem dados.</div>}
                  {p.items.slice(0, 15).map((it) => (
                    <div key={it.label} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] truncate" title={it.label}>{it.label}</div>
                        <div className="h-1.5 bg-muted/40 rounded overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${(it.value / max) * 100}%` }} />
                        </div>
                      </div>
                      <div className="w-10 text-right text-[11px] font-semibold">{it.value}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KPI({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className={`border-t-4 ${accent ?? "border-t-primary"}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[11px] tracking-wider text-muted-foreground uppercase">
          {icon}{label}
        </div>
        <div className="text-3xl font-bold mt-2">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
