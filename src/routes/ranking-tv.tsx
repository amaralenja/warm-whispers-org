import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Crown, Flame, Medal, Radio, Sparkles, Target, Trophy, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ranking-tv")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ranking TV — MULTIUM" },
      { name: "description", content: "Ranking de vendas ao vivo em modo TV." },
    ],
  }),
  component: RankingTV,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type PublicRankingItem = {
  utm: string;
  nome: string;
  expert: string | null;
  fotoUrl: string | null;
  faturamento: number;
  vendas: number;
  ticketMedio: number;
  pctTotal: number;
  meta: number;
  metaPct: number;
  metaBatida: boolean;
  faltamMeta: number;
};

type MetaLog = {
  utm: string;
  nome: string;
  expert: string | null;
  meta: number;
  faturamento: number;
  vendas: number;
  batida: boolean;
};

type RankingTvPayload = {
  ranking: PublicRankingItem[];
  metaLogs: MetaLog[];
  totalFaturamento: number;
  totalVendas: number;
  ticketMedioGeral: number;
  vendedoresAtivos: number;
  metaDia: number;
};

function todayISO() {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

function RankingTV() {
  const [now, setNow] = useState(() => new Date());
  const [balloons, setBalloons] = useState<{ id: number; left: number; color: string; delay: number }[]>([]);
  const [hitFlash, setHitFlash] = useState(false);
  const [celebrated, setCelebrated] = useState<string[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => {
    const to = todayISO();
    return { from: to, to };
  }, []);

  const { data } = useQuery<RankingTvPayload>({
    queryKey: ["ranking-tv-public-rpc", range.from, range.to],
    queryFn: async () => {
      const { data: rpcData, error } = await supabase.rpc("get_ranking_tv_stats", {
        _from: range.from,
        _to: range.to,
      });
      if (error) throw error;
      return rpcData as unknown as RankingTvPayload;
    },
    refetchInterval: 30_000,
  });

  const ranking = data?.ranking ?? [];
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3, 15);
  const metaLogs = data?.metaLogs ?? [];
  const hitKeys = useMemo(() => metaLogs.filter((l) => l.batida).map((l) => l.utm).sort(), [metaLogs]);

  useEffect(() => {
    const newHits = hitKeys.filter((utm) => !celebrated.includes(utm));
    if (newHits.length === 0) return;
    setCelebrated((prev) => Array.from(new Set([...prev, ...newHits])));
    setHitFlash(true);
    const colors = ["#fbbf24", "#34d399", "#60a5fa", "#f472b6", "#ffffff"];
    const next = Array.from({ length: 32 }, (_, i) => ({
      id: Date.now() + i,
      left: Math.random() * 100,
      color: colors[i % colors.length],
      delay: Math.random() * 2,
    }));
    setBalloons(next);
    const t1 = setTimeout(() => setHitFlash(false), 1800);
    const t2 = setTimeout(() => setBalloons([]), 9000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [celebrated, hitKeys]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#070710] text-white">
      <style>{`
        @keyframes float-up { 0% { transform: translateY(110vh) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-20vh) rotate(15deg); opacity: 0; } }
        @keyframes flash-bg { 0%, 100% { background-color: rgba(52,211,153,0); } 50% { background-color: rgba(52,211,153,0.18); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse-glow { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
        .balloon { animation: float-up 7s ease-in forwards; }
        .flash-overlay { animation: flash-bg 1.6s ease-out; }
        .grid-bg { background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px); background-size: 56px 56px; }
        .shimmer-text { background: linear-gradient(90deg, #fbbf24 0%, #fde68a 50%, #fbbf24 100%); background-size: 200% 100%; animation: shimmer 4s linear infinite; -webkit-background-clip: text; background-clip: text; color: transparent; }
        .glow-gold { box-shadow: 0 0 60px rgba(251,191,36,.35), inset 0 0 30px rgba(251,191,36,.08); }
        .glow-silver { box-shadow: 0 0 40px rgba(203,213,225,.18), inset 0 0 20px rgba(203,213,225,.05); }
        .glow-bronze { box-shadow: 0 0 40px rgba(251,146,60,.22), inset 0 0 20px rgba(251,146,60,.06); }
      `}</style>

      {/* ambient layers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="grid-bg absolute inset-0" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(251,191,36,.12),transparent_45%),radial-gradient(circle_at_80%_100%,rgba(167,139,250,.10),transparent_45%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
      </div>

      {balloons.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[200] overflow-hidden">
          {balloons.map((b) => (
            <div key={b.id} className="balloon absolute" style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, bottom: 0 }}>
              <svg width="48" height="64" viewBox="0 0 48 64">
                <ellipse cx="24" cy="22" rx="20" ry="24" fill={b.color} opacity="0.95" />
                <ellipse cx="18" cy="14" rx="6" ry="4" fill="white" opacity="0.4" />
                <path d="M24 46 L22 50 L26 50 Z" fill={b.color} />
                <path d="M24 50 Q22 56 24 64" stroke="white" strokeOpacity="0.5" strokeWidth="1" fill="none" />
              </svg>
            </div>
          ))}
        </div>
      )}

      {hitFlash && <div className="flash-overlay pointer-events-none absolute inset-0 z-[150]" />}

      {/* HEADER */}
      <header className="relative z-10 flex h-[88px] items-center justify-between px-10">
        <div className="flex items-center gap-4">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_30px_rgba(251,191,36,.4)]">
            <Trophy className="h-6 w-6 text-black" fill="currentColor" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.32em] text-emerald-400">
              <Radio className="h-3 w-3 animate-pulse" />
              <span style={{ animation: "pulse-glow 2s ease-in-out infinite" }}>ao vivo</span>
              <span className="text-white/30">·</span>
              <span className="text-white/50">TV aberta</span>
            </div>
            <h1 className="mt-0.5 text-3xl font-black uppercase leading-none tracking-tight">
              Ranking <span className="shimmer-text">Multium</span>
            </h1>
          </div>
        </div>

        <div className="text-right">
          <p className="font-mono text-4xl font-black leading-none tabular-nums tracking-tight">
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.3em] text-white/40">
            {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
        </div>
      </header>

      {/* STAT STRIP */}
      <div className="relative z-10 grid grid-cols-3 gap-4 px-10 pb-4">
        <StatCard label="Faturamento hoje" value={BRL(data?.totalFaturamento ?? 0)} tone="emerald" icon={<Zap className="h-4 w-4" />} />
        <StatCard label="Vendas aprovadas" value={String(data?.totalVendas ?? 0)} tone="amber" icon={<Flame className="h-4 w-4" />} />
        <StatCard label="Ticket médio" value={BRL(data?.ticketMedioGeral ?? 0)} tone="violet" icon={<Sparkles className="h-4 w-4" />} />
      </div>

      {/* MAIN GRID */}
      <main className="relative z-10 grid h-[calc(100vh-88px-76px)] grid-cols-12 gap-5 px-10 pb-6">
        {/* PODIUM */}
        <section className="col-span-8 flex min-h-0 flex-col rounded-2xl border border-white/[.06] bg-white/[.02] p-6 backdrop-blur-sm">
          <header className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-[0.62rem] font-bold uppercase tracking-[0.3em] text-amber-400/80">O pódio</h2>
              <p className="mt-1 text-2xl font-black">Top performers de hoje</p>
            </div>
            <div className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-amber-300">
              {data?.vendedoresAtivos ?? 0} vendedores
            </div>
          </header>

          <div className="flex flex-1 items-end justify-center gap-6 pb-4 pt-8">
            {top3[1] && <PodiumCard item={top3[1]} position={2} height="h-[68%]" />}
            {top3[0] && <PodiumCard item={top3[0]} position={1} height="h-[88%]" />}
            {top3[2] && <PodiumCard item={top3[2]} position={3} height="h-[56%]" />}
            {top3.length === 0 && (
              <div className="flex h-full w-full items-center justify-center text-white/30">
                <p className="text-sm uppercase tracking-[0.3em]">Aguardando vendas…</p>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <aside className="col-span-4 grid min-h-0 grid-rows-2 gap-5">
          {/* Top 4-15 */}
          <section className="flex min-h-0 flex-col rounded-2xl border border-white/[.06] bg-white/[.02] p-5 backdrop-blur-sm">
            <header className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.24em] text-white/60">
                <Trophy className="h-3.5 w-3.5 text-amber-400" /> Próximos no pódio
              </h2>
              <span className="font-mono text-[0.65rem] font-black text-amber-400">#4 — #{Math.min(15, 3 + rest.length)}</span>
            </header>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
              {rest.map((v, i) => (
                <ListRow key={v.utm} item={v} position={i + 4} />
              ))}
              {rest.length === 0 && (
                <div className="flex h-full items-center justify-center text-white/25">
                  <p className="text-[0.7rem] uppercase tracking-widest">Sem mais vendedores</p>
                </div>
              )}
            </div>
          </section>

          {/* Metas individuais */}
          <section className="flex min-h-0 flex-col rounded-2xl border border-white/[.06] bg-white/[.02] p-5 backdrop-blur-sm">
            <header className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.24em] text-white/60">
                <Target className="h-3.5 w-3.5 text-emerald-400" /> Metas individuais
              </h2>
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-0.5 font-mono text-[0.62rem] font-black text-emerald-400">
                {hitKeys.length} batidas
              </span>
            </header>
            <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
              {metaLogs.map((log) => (
                <MetaLogRow key={log.utm} log={log} />
              ))}
              {metaLogs.length === 0 && (
                <div className="flex h-full items-center justify-center text-center text-[0.7rem] uppercase tracking-[0.2em] text-white/25">
                  Nenhuma meta registrada
                </div>
              )}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function StatCard({ label, value, tone, icon }: { label: string; value: string; tone: "emerald" | "amber" | "violet"; icon: React.ReactNode }) {
  const tones = {
    emerald: { ring: "from-emerald-400/40 to-transparent", text: "text-emerald-400", glow: "shadow-[0_0_30px_rgba(52,211,153,.15)]" },
    amber: { ring: "from-amber-400/40 to-transparent", text: "text-amber-400", glow: "shadow-[0_0_30px_rgba(251,191,36,.15)]" },
    violet: { ring: "from-violet-400/40 to-transparent", text: "text-violet-400", glow: "shadow-[0_0_30px_rgba(167,139,250,.15)]" },
  }[tone];
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-white/[.06] bg-gradient-to-br from-white/[.04] to-white/[.01] p-5 ${tones.glow}`}>
      <div className={`absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-radial ${tones.ring} opacity-30`} />
      <div className="relative flex items-center justify-between">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.24em] text-white/50">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ${tones.text}`}>{icon}</span>
      </div>
      <p className={`relative mt-3 font-mono text-4xl font-black tabular-nums ${tones.text}`}>{value}</p>
    </div>
  );
}

function PodiumCard({ item, position, height }: { item: PublicRankingItem; position: 1 | 2 | 3; height: string }) {
  const cfg = {
    1: {
      glow: "glow-gold",
      ring: "ring-amber-400",
      bar: "bg-gradient-to-t from-amber-600 via-amber-400 to-yellow-300",
      icon: <Crown className="h-7 w-7 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,.8)]" fill="currentColor" />,
      label: "CAMPEÃO",
      labelColor: "text-amber-300",
      valueColor: "text-amber-300",
      badge: "bg-gradient-to-br from-amber-400 to-amber-600 text-black",
    },
    2: {
      glow: "glow-silver",
      ring: "ring-slate-300",
      bar: "bg-gradient-to-t from-slate-600 via-slate-400 to-slate-200",
      icon: <Trophy className="h-5 w-5 text-slate-200" />,
      label: "VICE",
      labelColor: "text-slate-300",
      valueColor: "text-slate-100",
      badge: "bg-gradient-to-br from-slate-300 to-slate-500 text-black",
    },
    3: {
      glow: "glow-bronze",
      ring: "ring-orange-400",
      bar: "bg-gradient-to-t from-orange-700 via-orange-500 to-orange-300",
      icon: <Medal className="h-5 w-5 text-orange-400" />,
      label: "TERCEIRO",
      labelColor: "text-orange-300",
      valueColor: "text-orange-200",
      badge: "bg-gradient-to-br from-orange-400 to-orange-600 text-black",
    },
  }[position];

  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=0a0a14&color=ffffff&size=256&bold=true`;
  const isFirst = position === 1;

  return (
    <div className={`relative flex w-full max-w-[260px] flex-col items-center ${height}`}>
      {/* Card */}
      <div className={`relative flex flex-1 w-full flex-col items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.06] to-white/[.01] px-5 pb-5 pt-10 backdrop-blur-xl ${cfg.glow}`}>
        {/* Position badge */}
        <div className={`absolute -top-5 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full font-mono text-base font-black shadow-lg ${cfg.badge}`}>
          {position}
        </div>

        {/* Crown for #1 */}
        {isFirst && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 animate-bounce">
            {cfg.icon}
          </div>
        )}

        {/* Avatar */}
        <div className={`relative ${isFirst ? "h-28 w-28" : "h-20 w-20"}`}>
          <div className={`absolute inset-0 rounded-full ${isFirst ? "bg-amber-400/30" : "bg-white/10"} blur-2xl`} />
          <img
            src={avatar}
            alt={item.nome}
            className={`relative h-full w-full rounded-full object-cover ring-4 ${cfg.ring} ring-offset-4 ring-offset-[#0a0a14]`}
          />
          {!isFirst && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2">{cfg.icon}</div>
          )}
        </div>

        {/* Name */}
        <div className="text-center">
          <p className={`text-[0.55rem] font-black uppercase tracking-[0.3em] ${cfg.labelColor}`}>{cfg.label}</p>
          <h3 className={`mt-1 truncate font-black leading-tight ${isFirst ? "text-2xl" : "text-lg"}`}>{item.nome}</h3>
          {item.expert && (
            <p className="mt-0.5 text-[0.6rem] uppercase tracking-[0.2em] text-white/40">{item.expert}</p>
          )}
        </div>

        {/* Stats */}
        <div className="mt-auto w-full space-y-2">
          <div className="text-center">
            <p className={`font-mono font-black tabular-nums ${isFirst ? "text-3xl" : "text-xl"} ${cfg.valueColor}`}>
              {BRL(item.faturamento)}
            </p>
            <p className="mt-0.5 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-white/40">
              {item.vendas} venda{item.vendas !== 1 ? "s" : ""} · TM {BRL(item.ticketMedio)}
            </p>
          </div>
          {item.meta > 0 && (
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={item.metaBatida ? "h-full bg-emerald-400" : "h-full bg-amber-400"}
                  style={{ width: `${item.metaPct}%` }}
                />
              </div>
              <p className="mt-1 text-center text-[0.58rem] font-bold uppercase tracking-wider text-white/40">
                {item.metaBatida ? "✨ Meta batida" : `${item.metaPct.toFixed(0)}% da meta`}
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Podium base */}
      <div className={`h-2 w-full rounded-b-md ${cfg.bar}`} />
    </div>
  );
}

function ListRow({ item, position }: { item: PublicRankingItem; position: number }) {
  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=0a0a14&color=ffffff&bold=true`;
  return (
    <div className="grid grid-cols-[24px_32px_1fr_auto] items-center gap-2.5 rounded-lg border border-white/[.04] bg-white/[.02] px-2 py-1.5 transition-colors hover:bg-white/[.05]">
      <span className="font-mono text-xs font-black text-white/40">{position}</span>
      <img src={avatar} alt={item.nome} className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10" />
      <div className="min-w-0">
        <p className="truncate text-xs font-bold">{item.nome}</p>
        <div className="flex items-center gap-1.5 text-[0.55rem] text-white/40">
          {item.expert && <span className="uppercase tracking-wider">{item.expert}</span>}
          <span>· {item.vendas}v</span>
        </div>
      </div>
      <p className="font-mono text-xs font-black tabular-nums text-amber-400">{BRL(item.faturamento)}</p>
    </div>
  );
}

function MetaLogRow({ log }: { log: MetaLog }) {
  const pct = log.meta > 0 ? Math.min(100, (log.faturamento / log.meta) * 100) : 0;
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        log.batida
          ? "border-emerald-400/30 bg-emerald-400/[.06]"
          : "border-white/[.05] bg-white/[.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">{log.nome}</p>
          <p className="text-[0.55rem] uppercase tracking-wider text-white/40">
            {log.expert ?? log.utm} · {log.vendas}v
          </p>
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-wider ${
            log.batida
              ? "bg-emerald-400/15 text-emerald-300"
              : "bg-amber-400/10 text-amber-300"
          }`}
        >
          {log.batida ? <Award className="h-3 w-3" /> : <Target className="h-3 w-3" />}
          {log.batida ? "batida" : `${pct.toFixed(0)}%`}
        </div>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[.06]">
        <div
          className={log.batida ? "h-full bg-gradient-to-r from-emerald-500 to-emerald-300" : "h-full bg-gradient-to-r from-amber-500 to-amber-300"}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[0.6rem] font-bold tabular-nums text-white/50">
        <span>{BRL(log.faturamento)}</span>
        <span className="text-white/30">/ {BRL(log.meta)}</span>
      </div>
    </div>
  );
}
