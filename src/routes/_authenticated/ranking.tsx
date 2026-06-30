import { useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Trophy, Medal, TrendingUp, Users, Receipt, Coins, Sparkles } from "lucide-react";
import { getRankingStats, type RankingItem } from "@/lib/ranking.functions";
import { useWorkspace } from "@/lib/workspace-context";
import { DateRangeFilter, computeRange, type DateRangeValue } from "@/components/date-range-filter";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking de Vendas — MULTIUM" },
      { name: "description", content: "Quem tá puxando o time. Pódio dos vendedores e ranking completo do período." },
    ],
  }),
  component: Ranking,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const NUM = "font-sans tabular-nums tracking-tight font-semibold";

function Ranking() {
  const { workspace, workspaces } = useWorkspace();
  const fetchStats = useServerFn(getRankingStats);
  const [range, setRange] = useState<DateRangeValue>(() => computeRange("7d"));
  const [opFilter, setOpFilter] = useState<string>("all"); // só usado quando workspace="all"
  const expertFilter =
    workspace.id === "all" ? (opFilter === "all" ? null : opFilter) : workspace.id;

  const { data, isLoading } = useQuery({
    queryKey: ["ranking", range.from, range.to, expertFilter],
    queryFn: () => fetchStats({ data: { from: range.from, to: range.to, expert: expertFilter } }),
  });

  const ranking = data?.ranking ?? [];
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);
  const maxFat = top3[0]?.faturamento ?? 1;

  const operacoes = workspaces.filter((w) => w.id !== "all");

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto max-w-7xl px-8 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className={`text-[0.65rem] uppercase tracking-[0.28em] ${workspace.accent.text}`}>
              — Hall of Fame
            </p>
            <h1 className="mt-2 font-display text-3xl leading-tight md:text-4xl">
              <em className="text-accent">Ranking</em> de Vendas
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Quem tá puxando o time no período selecionado.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            {workspace.id === "all" && operacoes.length > 0 && (
              <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card/40 p-1">
                <button
                  type="button"
                  onClick={() => setOpFilter("all")}
                  className={[
                    "rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors",
                    opFilter === "all"
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  ].join(" ")}
                >
                  Todas
                </button>
                {operacoes.map((op) => {
                  const active = opFilter === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => setOpFilter(op.id)}
                      className={[
                        "rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors",
                        active
                          ? `${op.accent.bg} ${op.accent.text} border ${op.accent.border}`
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                      ].join(" ")}
                    >
                      {op.nome}
                    </button>
                  );
                })}
              </div>
            )}
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Faturamento total" value={data ? BRL(data.totalFaturamento) : "—"} icon={<TrendingUp className="h-4 w-4" />} />
          <Kpi label="Total de vendas" value={data ? data.totalVendas.toLocaleString("pt-BR") : "—"} icon={<Receipt className="h-4 w-4" />} />
          <Kpi label="Ticket médio" value={data ? BRL(data.ticketMedioGeral) : "—"} icon={<Coins className="h-4 w-4" />} sub={data ? `≥ R$ 97` : undefined} />
          <Kpi label="Vendedores ativos" value={data ? String(data.vendedoresAtivos) : "—"} icon={<Users className="h-4 w-4" />} accent />
        </section>

        {/* Podium */}
        <section className="relative mt-10">
          <div className="absolute inset-x-0 -top-6 mx-auto h-32 w-3/4 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative">
            <div className="mb-4 flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Pódio do período
            </div>
            {isLoading && (
              <div className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-card/40" />)}
              </div>
            )}
            {!isLoading && top3.length === 0 && (
              <div className="rounded-2xl border border-border bg-card/40 p-12 text-center">
                <div className="text-4xl">📭</div>
                <div className="mt-3 font-display text-lg">Nenhuma venda no período</div>
                <div className="text-sm text-muted-foreground">Ajusta o filtro de datas pra ver o ranking.</div>
              </div>
            )}
            {top3.length > 0 && (
              <div className="grid items-end gap-4 md:grid-cols-3">
                {/* 2nd */}
                {top3[1] && <PodiumCard item={top3[1]} place={2} heightCls="md:mt-10" maxFat={maxFat} />}
                {/* 1st */}
                {top3[0] && <PodiumCard item={top3[0]} place={1} heightCls="md:-mt-2" maxFat={maxFat} highlight />}
                {/* 3rd */}
                {top3[2] && <PodiumCard item={top3[2]} place={3} heightCls="md:mt-16" maxFat={maxFat} />}
              </div>
            )}
          </div>
        </section>

        {/* Tabela completa */}
        {ranking.length > 0 && (
          <section className="mt-10 overflow-hidden rounded-2xl border border-border bg-card/40">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <div className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Ranking completo</div>
                <h3 className="mt-1 font-display text-lg">Todos os vendedores</h3>
              </div>
              {range.from && range.to && (
                <span className="rounded-full border border-border bg-background/40 px-3 py-1 text-[0.7rem] text-muted-foreground">
                  {fmtBR(range.from)} → {fmtBR(range.to)}
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/20 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="w-14 px-5 py-3 text-center">Pos</th>
                    <th className="px-3 py-3">Vendedor</th>
                    <th className="px-3 py-3">Expert</th>
                    <th className="px-3 py-3 text-center">Vendas</th>
                    <th className="px-3 py-3 text-right">Faturamento</th>
                    <th className="px-3 py-3 text-right">Ticket médio</th>
                    <th className="px-5 py-3 text-right">% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...top3, ...rest].map((item, i) => {
                    const pos = i + 1;
                    return (
                      <tr key={item.utm} className="border-b border-border/60 transition hover:bg-secondary/20">
                        <td className="px-5 py-3 text-center">
                          <PosBadge pos={pos} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar nome={item.nome} fotoUrl={item.fotoUrl} size={36} />
                            <div className="min-w-0">
                              <div className="truncate text-foreground">{item.nome}</div>
                              <div className="truncate text-[0.7rem] text-muted-foreground">{item.utm}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{item.expert ?? "—"}</td>
                        <td className={`px-3 py-3 text-center ${NUM}`}>{item.vendas}</td>
                        <td className={`px-3 py-3 text-right ${NUM}`}>{BRL(item.faturamento)}</td>
                        <td className={`px-3 py-3 text-right ${NUM} text-muted-foreground`}>{BRL(item.ticketMedio)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-secondary/40 md:block">
                              <div className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent" style={{ width: `${Math.min(100, item.pctTotal)}%` }} />
                            </div>
                            <span className={`${NUM} text-foreground`}>{item.pctTotal.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Sem UTM */}
        {data && data.semUtm.vendas > 0 && (
          <section className="mt-6 rounded-2xl border border-border bg-card/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">Sem vendedor</div>
                <h4 className="mt-1 font-display text-base">Vendas diretas / orgânicas</h4>
                <p className="text-xs text-muted-foreground">UTM não cadastrada ou vendedor inativo</p>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Vendas</div>
                  <div className={`${NUM} text-lg`}>{data.semUtm.vendas}</div>
                </div>
                <div>
                  <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Faturamento</div>
                  <div className={`${NUM} text-lg`}>{BRL(data.semUtm.faturamento)}</div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function fmtBR(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function Kpi({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon?: ReactNode; accent?: boolean }) {
  return (
    <div className={[
      "relative overflow-hidden rounded-2xl border p-5 transition",
      accent ? "border-accent/40 bg-gradient-to-br from-accent/10 to-card/40" : "border-border bg-card/40 hover:border-accent/30",
    ].join(" ")}>
      <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
        <span>{label}</span>
        {icon && <span className="text-accent/70">{icon}</span>}
      </div>
      <div className={`mt-3 font-display text-3xl ${NUM}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function PodiumCard({ item, place, heightCls, maxFat, highlight }: { item: RankingItem; place: 1 | 2 | 3; heightCls: string; maxFat: number; highlight?: boolean }) {
  const meta = place === 1
    ? { icon: <Crown className="h-5 w-5" />, color: "text-amber-300", glow: "shadow-[0_0_60px_-10px_rgba(251,191,36,0.5)]", border: "border-amber-300/40", grad: "from-amber-300/20 via-card/60 to-card/40", label: "1º Lugar" }
    : place === 2
    ? { icon: <Trophy className="h-5 w-5" />, color: "text-slate-300", glow: "", border: "border-slate-300/30", grad: "from-slate-300/10 via-card/60 to-card/40", label: "2º Lugar" }
    : { icon: <Medal className="h-5 w-5" />, color: "text-orange-300", glow: "", border: "border-orange-300/30", grad: "from-orange-400/10 via-card/60 to-card/40", label: "3º Lugar" };
  const fillPct = maxFat > 0 ? (item.faturamento / maxFat) * 100 : 0;

  return (
    <div className={`relative ${heightCls}`}>
      <div className={[
        "group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 transition",
        meta.border, meta.grad, highlight ? `${meta.glow} ring-1 ring-accent/20` : "",
      ].join(" ")}>
        <div className={`absolute right-4 top-4 ${meta.color}`}>{meta.icon}</div>
        <div className={`text-[0.65rem] uppercase tracking-[0.22em] ${meta.color}`}>{meta.label}</div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar nome={item.nome} fotoUrl={item.fotoUrl} size={56} ring={place === 1} />
          <div className="min-w-0">
            <div className="truncate font-display text-xl">{item.nome}</div>
            <div className="truncate text-xs text-muted-foreground">{item.expert ?? "—"} · {item.utm}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Faturamento</div>
          <div className={`mt-1 font-display ${place === 1 ? "text-4xl" : "text-3xl"} ${NUM}`}>{BRL(item.faturamento)}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-xs">
          <div>
            <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Vendas</div>
            <div className={`${NUM} text-base`}>{item.vendas}</div>
          </div>
          <div>
            <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Ticket médio</div>
            <div className={`${NUM} text-base`}>{BRL(item.ticketMedio)}</div>
          </div>
        </div>

        <div className="mt-5 h-1 overflow-hidden rounded-full bg-secondary/40">
          <div className={`h-full rounded-full bg-gradient-to-r ${place === 1 ? "from-amber-400 to-amber-200" : place === 2 ? "from-slate-400 to-slate-200" : "from-orange-500 to-orange-300"}`}
               style={{ width: `${fillPct}%` }} />
        </div>
        <div className="mt-1 text-right text-[0.65rem] text-muted-foreground">{item.pctTotal.toFixed(1)}% do total</div>
      </div>
    </div>
  );
}

function PosBadge({ pos }: { pos: number }) {
  const cls = pos === 1 ? "bg-amber-300/15 text-amber-300 border-amber-300/30"
    : pos === 2 ? "bg-slate-300/10 text-slate-200 border-slate-300/30"
    : pos === 3 ? "bg-orange-400/10 text-orange-300 border-orange-400/30"
    : "bg-secondary/40 text-muted-foreground border-border";
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${cls}`}>
      {pos}
    </span>
  );
}

function Avatar({ nome, fotoUrl, size, ring }: { nome: string; fotoUrl: string | null; size: number; ring?: boolean }) {
  const initials = nome.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("");
  return (
    <div
      className={[
        "shrink-0 overflow-hidden rounded-full border border-border bg-secondary/40",
        ring ? "ring-2 ring-accent/40 ring-offset-2 ring-offset-background" : "",
      ].join(" ")}
      style={{ width: size, height: size }}
    >
      {fotoUrl ? (
        <img src={fotoUrl} alt={nome} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[0.7rem] font-semibold text-muted-foreground">
          {initials}
        </div>
      )}
    </div>
  );
}
