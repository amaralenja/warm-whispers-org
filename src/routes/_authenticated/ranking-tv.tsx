import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Flame, Trophy, Medal, Sparkles, Radio, TrendingUp, ArrowLeft } from "lucide-react";
import { getRankingStats, type RankingItem } from "@/lib/ranking.functions";
import { useWorkspace } from "@/lib/workspace-context";

export const Route = createFileRoute("/_authenticated/ranking-tv")({
  head: () => ({
    meta: [
      { title: "Ranking TV — MULTIUM" },
      { name: "description", content: "Modo TV intergaláctico do ranking de vendas em tempo real." },
    ],
  }),
  component: RankingTV,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function todayISO() {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}
function monthStartISO() {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth(), 1);
  const tz = new Date(m.getTime() - m.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

function RankingTV() {
  const { workspace } = useWorkspace();
  const fetchStats = useServerFn(getRankingStats);
  const expertFilter = workspace.id === "all" ? null : workspace.id;

  const [period, setPeriod] = useState<"hoje" | "mes">("mes");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => {
    const to = todayISO();
    return { from: period === "hoje" ? to : monthStartISO(), to };
  }, [period]);

  const { data } = useQuery({
    queryKey: ["ranking-tv", range.from, range.to, expertFilter],
    queryFn: () => fetchStats({ data: { from: range.from, to: range.to, expert: expertFilter } }),
    refetchInterval: 30_000,
  });

  const ranking = data?.ranking ?? [];
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3, 13);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#020206] text-white">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-1/4 top-0 h-[60vh] w-[60vw] rounded-full bg-emerald-500/[0.06] blur-[140px]" />
        <div className="absolute right-0 top-1/4 h-[50vh] w-[50vw] rounded-full bg-cyan-500/[0.05] blur-[160px]" />
        <div className="absolute bottom-0 left-1/3 h-[40vh] w-[40vw] rounded-full bg-amber-400/[0.04] blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-10 pt-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-emerald-400/30 blur-xl" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 backdrop-blur-xl">
              <Trophy className="h-6 w-6 text-emerald-400" />
            </div>
          </div>
          <div>
            <p className="text-[0.65rem] font-black uppercase tracking-[0.35em] text-emerald-400">
              <Radio className="mr-1 inline h-3 w-3 animate-pulse" /> AO VIVO
            </p>
            <h1 className="text-3xl font-black tracking-tight">
              RANKING <span className="text-emerald-400">MULTIUM</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl">
            {(["hoje", "mes"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-xl px-4 py-1.5 text-xs font-black uppercase tracking-widest transition-all ${
                  period === p
                    ? "bg-emerald-400 text-black shadow-[0_0_30px_rgba(74,222,128,0.5)]"
                    : "text-white/40 hover:text-white"
                }`}
              >
                {p === "hoje" ? "Hoje" : "Mês"}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-2 text-right backdrop-blur-xl">
            <p className="font-mono text-2xl font-black leading-none tabular-nums">
              {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="mt-0.5 text-[0.6rem] uppercase tracking-[0.3em] text-white/40">
              {now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
            </p>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="relative z-10 mx-10 mt-6 grid grid-cols-4 gap-3">
        <StatPill label="Faturamento" value={BRL(data?.totalFaturamento ?? 0)} accent="emerald" icon={<TrendingUp className="h-4 w-4" />} />
        <StatPill label="Vendas" value={String(data?.totalVendas ?? 0)} accent="cyan" icon={<Flame className="h-4 w-4" />} />
        <StatPill label="Ticket Médio" value={BRL(data?.ticketMedioGeral ?? 0)} accent="amber" icon={<Sparkles className="h-4 w-4" />} />
        <StatPill label="Vendedores" value={String(data?.vendedoresAtivos ?? 0)} accent="violet" icon={<Crown className="h-4 w-4" />} />
      </div>

      {/* Podium + list */}
      <div className="relative z-10 grid flex-1 grid-cols-12 gap-6 px-10 pb-8 pt-6" style={{ height: "calc(100vh - 240px)" }}>
        {/* Podium */}
        <section className="col-span-7 flex items-end justify-center gap-5">
          {top3[1] && <PodiumCard item={top3[1]} position={2} height="h-[55%]" />}
          {top3[0] && <PodiumCard item={top3[0]} position={1} height="h-[78%]" />}
          {top3[2] && <PodiumCard item={top3[2]} position={3} height="h-[45%]" />}
          {top3.length === 0 && (
            <div className="flex h-full w-full items-center justify-center text-white/30">
              <p className="text-sm uppercase tracking-[0.3em]">Aguardando vendas...</p>
            </div>
          )}
        </section>

        {/* Lista */}
        <section className="col-span-5 flex flex-col gap-2 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl">
          <header className="flex items-center justify-between px-2 pb-2">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white/60">
              Próximos no pódio
            </h2>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-bold text-white/40">
              {rest.length}
            </span>
          </header>
          <div className="flex-1 space-y-1.5 overflow-hidden">
            {rest.map((v, i) => (
              <ListRow key={v.utm} item={v} position={i + 4} />
            ))}
            {rest.length === 0 && (
              <div className="flex h-full items-center justify-center text-white/20">
                <p className="text-[0.7rem] uppercase tracking-widest">Sem mais vendedores</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: "emerald" | "cyan" | "amber" | "violet";
  icon: React.ReactNode;
}) {
  const colors = {
    emerald: "text-emerald-400 border-emerald-400/20 bg-emerald-400/[0.04]",
    cyan: "text-cyan-400 border-cyan-400/20 bg-cyan-400/[0.04]",
    amber: "text-amber-400 border-amber-400/20 bg-amber-400/[0.04]",
    violet: "text-violet-400 border-violet-400/20 bg-violet-400/[0.04]",
  }[accent];
  return (
    <div className={`rounded-2xl border bg-white/[0.02] p-4 backdrop-blur-xl ${colors.split(" ").slice(1).join(" ")}`}>
      <div className="flex items-center justify-between">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-white/50">{label}</p>
        <span className={colors.split(" ")[0]}>{icon}</span>
      </div>
      <p className="mt-2 font-mono text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function PodiumCard({ item, position, height }: { item: RankingItem; position: 1 | 2 | 3; height: string }) {
  const cfg = {
    1: {
      ring: "ring-amber-400/60",
      glow: "shadow-[0_0_80px_rgba(251,191,36,0.4)]",
      bar: "bg-gradient-to-t from-amber-400 via-amber-300 to-yellow-200",
      icon: <Crown className="h-6 w-6 text-amber-300" fill="currentColor" />,
      label: "CAMPEÃO",
      labelColor: "text-amber-300",
      bg: "from-amber-400/10",
    },
    2: {
      ring: "ring-slate-300/50",
      glow: "shadow-[0_0_50px_rgba(203,213,225,0.25)]",
      bar: "bg-gradient-to-t from-slate-400 via-slate-300 to-slate-200",
      icon: <Trophy className="h-5 w-5 text-slate-300" />,
      label: "VICE",
      labelColor: "text-slate-300",
      bg: "from-slate-400/10",
    },
    3: {
      ring: "ring-amber-700/50",
      glow: "shadow-[0_0_50px_rgba(217,119,6,0.25)]",
      bar: "bg-gradient-to-t from-amber-700 via-amber-600 to-amber-500",
      icon: <Medal className="h-5 w-5 text-amber-600" />,
      label: "TERCEIRO",
      labelColor: "text-amber-500",
      bg: "from-amber-600/10",
    },
  }[position];

  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=0f172a&color=fff&size=256`;

  return (
    <div className={`relative flex w-full max-w-[260px] flex-col items-center ${height}`}>
      <div className={`flex flex-1 flex-col items-center justify-end gap-3 rounded-t-3xl border border-white/10 bg-gradient-to-b ${cfg.bg} via-white/[0.03] to-transparent p-5 backdrop-blur-xl ${cfg.glow}`}>
        {/* Position badge */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/20 bg-black/80 backdrop-blur-xl ${cfg.labelColor}`}>
            <span className="font-mono text-lg font-black">{position}</span>
          </div>
        </div>

        {/* Avatar */}
        <div className={`relative mt-4 ${position === 1 ? "h-28 w-28" : "h-20 w-20"}`}>
          {position === 1 && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 animate-bounce">{cfg.icon}</div>
          )}
          <div className={`absolute inset-0 animate-pulse rounded-full ${position === 1 ? "bg-amber-400/40" : "bg-white/10"} blur-xl`} />
          <img
            src={avatar}
            alt={item.nome}
            className={`relative h-full w-full rounded-full object-cover ring-4 ${cfg.ring} ring-offset-4 ring-offset-black`}
          />
        </div>

        {/* Info */}
        <div className="text-center">
          <p className={`text-[0.55rem] font-black uppercase tracking-[0.3em] ${cfg.labelColor}`}>
            {cfg.label}
          </p>
          <h3 className={`mt-1 truncate font-black leading-tight ${position === 1 ? "text-xl" : "text-base"}`}>
            {item.nome}
          </h3>
          {item.expert && (
            <p className="text-[0.65rem] uppercase tracking-widest text-white/40">
              {item.expert}
            </p>
          )}
        </div>

        {/* Fat */}
        <div className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-center">
          <p className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-white/40">
            Faturamento
          </p>
          <p className={`font-mono font-black tabular-nums ${position === 1 ? "text-2xl text-amber-300" : "text-lg text-white"}`}>
            {BRL(item.faturamento)}
          </p>
          <p className="text-[0.6rem] font-bold text-white/40">
            {item.vendas} venda{item.vendas !== 1 ? "s" : ""} · TM {BRL(item.ticketMedio)}
          </p>
        </div>
      </div>

      {/* Podium base */}
      <div className={`h-3 w-full rounded-b-xl ${cfg.bar}`} />
    </div>
  );
}

function ListRow({ item, position }: { item: RankingItem; position: number }) {
  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=0f172a&color=fff`;
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 transition-all hover:border-emerald-400/30 hover:bg-emerald-400/[0.03]">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 font-mono text-xs font-black text-white/50">
        {position}
      </div>
      <img src={avatar} alt={item.nome} className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{item.nome}</p>
        <div className="flex items-center gap-2 text-[0.6rem] text-white/40">
          {item.expert && <span className="uppercase tracking-widest">{item.expert}</span>}
          <span>· {item.vendas}v</span>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-black tabular-nums text-emerald-300">
          {BRL(item.faturamento)}
        </p>
        <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
            style={{ width: `${Math.min(100, item.pctTotal)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
