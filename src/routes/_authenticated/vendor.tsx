import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, TrendingUp, ShoppingBag, Target, Trophy, Award, Calendar } from "lucide-react";
import logoMultium from "@/assets/logo-multium.webp";
import { getVendorStats } from "@/lib/vendor.functions";

export const Route = createFileRoute("/_authenticated/vendor")({
  ssr: false,
  head: () => ({ meta: [{ title: "Vendedor — MULTIUM" }] }),
  component: VendorPortal,
});

type VendorSession = {
  id: number;
  nome: string | null;
  utm: string | null;
  expert: string | null;
  foto_url: string | null;
  codigo: string | null;
};

const BRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type RangePreset = "hoje" | "7d" | "mes" | "30d";
function rangeFor(p: RangePreset) {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "hoje") return { from: fmt(today), to: fmt(today) };
  if (p === "7d") {
    const from = new Date(today); from.setDate(from.getDate() - 6);
    return { from: fmt(from), to: fmt(today) };
  }
  if (p === "30d") {
    const from = new Date(today); from.setDate(from.getDate() - 29);
    return { from: fmt(from), to: fmt(today) };
  }
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: fmt(from), to: fmt(to) };
}

function VendorPortal() {
  const navigate = useNavigate();
  const [v, setV] = useState<VendorSession | null>(null);
  const [preset, setPreset] = useState<RangePreset>("mes");
  const fetchStats = useServerFn(getVendorStats);

  useEffect(() => {
    const raw = localStorage.getItem("vendor_session");
    if (!raw) { navigate({ to: "/auth" }); return; }
    try { setV(JSON.parse(raw)); }
    catch { localStorage.removeItem("vendor_session"); navigate({ to: "/auth" }); }
  }, [navigate]);

  const range = useMemo(() => rangeFor(preset), [preset]);

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-stats", v?.utm, range.from, range.to],
    queryFn: () => fetchStats({ data: { utm: v!.utm!, from: range.from, to: range.to } }),
    enabled: !!v?.utm,
    refetchInterval: 60_000,
  });

  function logout() {
    localStorage.removeItem("vendor_session");
    navigate({ to: "/auth" });
  }

  if (!v) return null;

  const initials =
    (v.nome ?? "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

  const stats = data;
  const maxSerie = Math.max(1, ...(stats?.serieDiaria?.map((d) => d.total) ?? [0]));

  // meta no banco = meta DIÁRIA. Multiplica pelos dias do período.
  const diasPeriodo = Math.max(
    1,
    Math.round(
      (Date.UTC(+range.to.slice(0, 4), +range.to.slice(5, 7) - 1, +range.to.slice(8, 10)) -
        Date.UTC(+range.from.slice(0, 4), +range.from.slice(5, 7) - 1, +range.from.slice(8, 10))) /
        86400000,
    ) + 1,
  );
  const metaDiaria = Number(stats?.meta ?? 0);
  const metaPeriodo = metaDiaria * diasPeriodo;
  const metaPct = metaPeriodo > 0 ? Math.min(100, ((stats?.faturamento ?? 0) / metaPeriodo) * 100) : 0;
  const faltaPeriodo = Math.max(0, metaPeriodo - (stats?.faturamento ?? 0));
  const labelMeta =
    preset === "hoje" ? "Meta do dia" : preset === "7d" ? "Meta da semana" : preset === "30d" ? "Meta dos 30 dias" : "Meta do mês";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40 px-6 py-4 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <img src={logoMultium} alt="MULTIUM" className="h-8 w-auto object-contain" />
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {/* Hero */}
        <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-500/15 via-card to-card p-8">
          <div className="flex flex-wrap items-center gap-5">
            {v.foto_url ? (
              <img src={v.foto_url} alt={v.nome ?? ""} className="h-20 w-20 rounded-full border-2 border-emerald-500/40 object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-2xl font-bold text-white">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">Bem-vindo</div>
              <h1 className="mt-1 font-display text-3xl font-bold truncate">{v.nome ?? "Vendedor"}</h1>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                {v.utm && <span className="font-mono">{v.utm}</span>}
                {v.expert && <span>· {v.expert}</span>}
              </div>
            </div>
            {stats?.posicao && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[0.6rem] uppercase tracking-[0.2em] text-amber-400">
                  <Trophy className="h-3 w-3" /> Sua posição
                </div>
                <div className="font-display text-3xl font-bold text-amber-300">#{stats.posicao}</div>
                <div className="text-[0.65rem] text-muted-foreground">de {stats.totalVendedores}</div>
              </div>
            )}
          </div>
        </div>

        {/* Filtro período */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {(["hoje", "7d", "30d", "mes"] as RangePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-wider transition ${
                preset === p
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-border text-muted-foreground hover:border-emerald-500/40"
              }`}
            >
              {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Mês"}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Faturamento" value={BRL(stats?.faturamento ?? 0)} accent="emerald" loading={isLoading} />
          <Kpi icon={<ShoppingBag className="h-4 w-4" />} label="Vendas" value={String(stats?.vendas ?? 0)} accent="cyan" loading={isLoading} />
          <Kpi icon={<Award className="h-4 w-4" />} label="Ticket médio" value={BRL(stats?.ticketMedio ?? 0)} accent="violet" loading={isLoading} />
          <Kpi icon={<Trophy className="h-4 w-4" />} label="Maior venda" value={BRL(stats?.maiorVenda ?? 0)} accent="amber" loading={isLoading} />
        </div>

        {/* Meta */}
        {stats && stats.meta > 0 && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-emerald-500/15 p-1.5 text-emerald-400"><Target className="h-4 w-4" /></div>
                <h3 className="text-sm font-semibold uppercase tracking-wider">Meta do mês</h3>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-bold tabular-nums">{stats.metaPct.toFixed(0)}%</div>
                <div className="text-[0.65rem] text-muted-foreground">
                  {BRL(stats.faturamento)} / {BRL(stats.meta)}
                </div>
              </div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-secondary/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all"
                style={{ width: `${Math.min(100, stats.metaPct)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {stats.faltaMeta > 0
                ? <>Faltam <span className="font-semibold text-emerald-400">{BRL(stats.faltaMeta)}</span> pra bater a meta. Bora!</>
                : <span className="font-semibold text-emerald-400">Meta batida! 🎉</span>}
            </div>
          </div>
        )}

        {/* Série diária */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Seu desempenho diário</h3>
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-secondary/30" />
          ) : (
            <div className="flex h-40 items-end gap-1">
              {stats?.serieDiaria?.map((d) => {
                const h = (d.total / maxSerie) * 100;
                return (
                  <div key={d.data} className="group relative flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-emerald-300 transition-all hover:from-emerald-500"
                      style={{ height: `${Math.max(2, h)}%` }}
                      title={`${d.data}: ${BRL(d.total)} (${d.vendas} vendas)`}
                    />
                    <span className="text-[0.55rem] text-muted-foreground">{d.data.slice(8, 10)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Últimas vendas */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Últimas vendas</h3>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-secondary/30" />)}</div>
          ) : !stats?.ultimasVendas?.length ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Sem vendas no período.</div>
          ) : (
            <div className="space-y-1.5">
              {stats.ultimasVendas.map((s, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:border-border hover:bg-secondary/20">
                  <div className="text-[0.65rem] text-muted-foreground font-mono">
                    {s.data?.split("-").reverse().slice(0, 2).join("/")}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.cliente ?? "—"}</div>
                    <div className="truncate text-[0.7rem] text-muted-foreground">{s.produto ?? "—"}</div>
                  </div>
                  <div className="font-display text-sm font-bold tabular-nums text-emerald-400">{BRL(s.ticket)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Kpi({ icon, label, value, accent, loading }: {
  icon: React.ReactNode; label: string; value: string;
  accent: "emerald" | "cyan" | "violet" | "amber"; loading?: boolean;
}) {
  const colors = {
    emerald: "from-emerald-500/15 text-emerald-400 border-emerald-500/20",
    cyan: "from-cyan-500/15 text-cyan-400 border-cyan-500/20",
    violet: "from-violet-500/15 text-violet-400 border-violet-500/20",
    amber: "from-amber-500/15 text-amber-400 border-amber-500/20",
  }[accent];
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${colors} to-card p-4`}>
      <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider opacity-80">
        {icon} {label}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground">
        {loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-secondary/40" /> : value}
      </div>
    </div>
  );
}
