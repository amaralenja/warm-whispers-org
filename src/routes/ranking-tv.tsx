import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, BellRing, Crown, Flame, Medal, Radio, Sparkles, Target, Trophy, Zap } from "lucide-react";
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
  const rest = ranking.slice(3, 12);
  const metaLogs = data?.metaLogs ?? [];
  const meta = data?.metaDia ?? 0;
  const fat = data?.totalFaturamento ?? 0;
  const pct = meta > 0 ? Math.min(100, (fat / meta) * 100) : 0;
  const falta = Math.max(0, meta - fat);
  const batido = fat >= meta && meta > 0;
  const hitKeys = useMemo(() => metaLogs.filter((log) => log.batida).map((log) => log.utm).sort(), [metaLogs]);

  useEffect(() => {
    const newHits = hitKeys.filter((utm) => !celebrated.includes(utm));
    if (newHits.length === 0) return;
    setCelebrated((prev) => Array.from(new Set([...prev, ...newHits])));
    setHitFlash(true);
    const colors = ["#f5b83f", "#48d6a0", "#43b7ff", "#ff6b7a", "#f4f0e6"];
    const next = Array.from({ length: 28 }, (_, i) => ({
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
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[oklch(0.10_0.01_250)] text-[oklch(0.98_0.01_90)]">
      <style>{`
        @keyframes float-up { 0% { transform: translateY(110vh) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-20vh) rotate(15deg); opacity: 0; } }
        @keyframes flash-bg { 0%, 100% { background-color: rgba(16,185,129,0); } 50% { background-color: rgba(16,185,129,0.15); } }
        .balloon { animation: float-up 7s ease-in forwards; }
        .flash-overlay { animation: flash-bg 1.6s ease-out; }
        .ranking-tv-grid { background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 64px 64px; }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="ranking-tv-grid absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,184,63,.18),transparent_38%),linear-gradient(180deg,rgba(2,2,6,.12),rgba(2,2,6,.88))]" />
      </div>

      {balloons.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[200] overflow-hidden">
          {balloons.map((b) => (
            <div key={b.id} className="balloon absolute" style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, bottom: 0 }}>
              <svg width="48" height="64" viewBox="0 0 48 64">
                <ellipse cx="24" cy="22" rx="20" ry="24" fill={b.color} opacity="0.96" />
                <ellipse cx="18" cy="14" rx="6" ry="4" fill="white" opacity="0.35" />
                <path d="M24 46 L22 50 L26 50 Z" fill={b.color} />
                <path d="M24 50 Q22 56 24 64" stroke="white" strokeOpacity="0.45" strokeWidth="1" fill="none" />
              </svg>
            </div>
          ))}
        </div>
      )}

      {hitFlash && <div className="flash-overlay pointer-events-none absolute inset-0 z-[150]" />}

      <header className="relative z-10 flex h-[104px] items-center justify-between border-b border-[oklch(1_0_0/.08)] px-10">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center border border-[oklch(0.78_0.13_75/.35)] bg-[oklch(0.78_0.13_75/.12)] shadow-[0_0_42px_oklch(0.78_0.13_75/.18)]">
            <Trophy className="h-7 w-7 text-[oklch(0.84_0.14_75)]" />
            <div className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-[oklch(0.72_0.16_150)]" />
          </div>
          <div>
            <div className="flex items-center gap-3 text-[0.7rem] font-black uppercase tracking-[0.28em] text-[oklch(0.72_0.16_150)]">
              <Radio className="h-3.5 w-3.5 animate-pulse" /> TV aberta · ao vivo
            </div>
            <h1 className="mt-1 text-4xl font-black uppercase leading-none tracking-normal">Ranking Multium</h1>
          </div>
        </div>

        <div className="border border-[oklch(1_0_0/.1)] bg-[oklch(1_0_0/.04)] px-5 py-2 text-right">
          <p className="font-mono text-3xl font-black leading-none tabular-nums">
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-1 text-[0.66rem] uppercase tracking-[0.24em] text-[oklch(0.72_0.03_85)]">
            {now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
          </p>
        </div>
      </header>

      <main className="relative z-10 grid h-[calc(100vh-104px)] grid-cols-12 gap-5 p-6">
        <section className="col-span-8 grid min-h-0 grid-rows-[auto_1fr] gap-5">
          <div className="grid grid-cols-4 gap-3">
            <StatPill label="Faturamento hoje" value={BRL(fat)} tone="success" icon={<Zap className="h-5 w-5" />} />
            <StatPill label="Meta do dia" value={BRL(meta)} tone="gold" icon={<Target className="h-5 w-5" />} />
            <StatPill label="Vendas" value={String(data?.totalVendas ?? 0)} tone="blue" icon={<Flame className="h-5 w-5" />} />
            <StatPill label="Ticket médio" value={BRL(data?.ticketMedioGeral ?? 0)} tone="rose" icon={<Sparkles className="h-5 w-5" />} />
          </div>

          <div className="grid min-h-0 grid-cols-12 gap-5">
            <section className="col-span-8 flex min-h-0 items-end justify-center gap-5 border border-[oklch(1_0_0/.08)] bg-[oklch(1_0_0/.035)] px-5 pb-7 pt-12">
              {top3[1] && <PodiumCard item={top3[1]} position={2} height="h-[55%]" />}
              {top3[0] && <PodiumCard item={top3[0]} position={1} height="h-[78%]" />}
              {top3[2] && <PodiumCard item={top3[2]} position={3} height="h-[45%]" />}
              {top3.length === 0 && (
                <div className="flex h-full w-full items-center justify-center text-[oklch(1_0_0/.35)]">
                  <p className="text-sm uppercase tracking-[0.3em]">Aguardando vendas...</p>
                </div>
              )}
            </section>

            <section className="col-span-4 flex min-h-0 flex-col border border-[oklch(1_0_0/.08)] bg-[oklch(1_0_0/.035)] p-4">
              <header className="mb-3 flex items-center justify-between border-b border-[oklch(1_0_0/.08)] pb-3">
                <h2 className="text-xs font-black uppercase tracking-[0.24em] text-[oklch(0.72_0.03_85)]">Próximos no pódio</h2>
                <span className="font-mono text-xs font-black text-[oklch(0.84_0.14_75)]">TOP 12</span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
                {rest.map((v, i) => (
                  <ListRow key={v.utm} item={v} position={i + 4} />
                ))}
                {rest.length === 0 && (
                  <div className="flex h-full items-center justify-center text-[oklch(1_0_0/.25)]">
                    <p className="text-[0.7rem] uppercase tracking-widest">Sem mais vendedores</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>

        <aside className="col-span-4 grid min-h-0 grid-rows-[auto_1fr] gap-5">
          <section className={`border p-5 ${batido ? "border-[oklch(0.72_0.16_150/.5)] bg-[oklch(0.72_0.16_150/.1)]" : "border-[oklch(1_0_0/.08)] bg-[oklch(1_0_0/.035)]"}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-[oklch(0.84_0.14_75)]">
                  <Target className="h-4 w-4" /> Meta do dia
                </p>
                <p className="mt-2 font-mono text-5xl font-black leading-none tabular-nums">{pct.toFixed(0)}%</p>
              </div>
              {batido ? (
                <div className="border border-[oklch(0.72_0.16_150/.4)] bg-[oklch(0.72_0.16_150/.14)] px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[oklch(0.82_0.15_150)]">🎈 Batida</div>
              ) : (
                <div className="text-right font-mono text-sm font-black tabular-nums text-[oklch(0.72_0.03_85)]">
                  faltam<br />{BRL(falta)}
                </div>
              )}
            </div>
            <div className="mt-5 h-4 overflow-hidden bg-[oklch(1_0_0/.08)]">
              <div className="h-full bg-[linear-gradient(90deg,oklch(0.72_0.16_150),oklch(0.84_0.14_75))] transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between font-mono text-xs font-black tabular-nums text-[oklch(0.72_0.03_85)]">
              <span>{BRL(fat)}</span>
              <span>{BRL(meta)}</span>
            </div>
          </section>

          <section className="flex min-h-0 flex-col border border-[oklch(1_0_0/.08)] bg-[oklch(1_0_0/.035)] p-4">
            <header className="mb-3 flex items-center justify-between border-b border-[oklch(1_0_0/.08)] pb-3">
              <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-[oklch(0.72_0.03_85)]">
                <BellRing className="h-4 w-4 text-[oklch(0.84_0.14_75)]" /> Logs das metas
              </h2>
              <span className="font-mono text-xs font-black text-[oklch(0.72_0.16_150)]">{hitKeys.length} batidas</span>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="space-y-2">
                {metaLogs.map((log) => (
                  <MetaLogRow key={log.utm} log={log} />
                ))}
                {metaLogs.length === 0 && (
                  <div className="flex h-36 items-center justify-center text-center text-xs uppercase tracking-[0.2em] text-[oklch(1_0_0/.3)]">Nenhuma meta registrada hoje</div>
                )}
              </div>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function StatPill({ label, value, tone, icon }: { label: string; value: string; tone: "success" | "gold" | "blue" | "rose"; icon: React.ReactNode }) {
  const color = {
    success: "text-[oklch(0.72_0.16_150)]",
    gold: "text-[oklch(0.84_0.14_75)]",
    blue: "text-[oklch(0.72_0.13_230)]",
    rose: "text-[oklch(0.72_0.18_20)]",
  }[tone];
  return (
    <div className="border border-[oklch(1_0_0/.08)] bg-[oklch(1_0_0/.035)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[0.62rem] font-black uppercase tracking-[0.2em] text-[oklch(0.72_0.03_85)]">{label}</p>
        <span className={color}>{icon}</span>
      </div>
      <p className="mt-3 font-mono text-3xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function PodiumCard({ item, position, height }: { item: PublicRankingItem; position: 1 | 2 | 3; height: string }) {
  const cfg = {
    1: { ring: "ring-[oklch(0.84_0.14_75/.7)]", glow: "shadow-[0_0_80px_oklch(0.78_0.13_75/.3)]", bar: "bg-[linear-gradient(0deg,oklch(0.72_0.13_65),oklch(0.90_0.12_85))]", icon: <Crown className="h-6 w-6 text-[oklch(0.84_0.14_75)]" fill="currentColor" />, label: "CAMPEÃO", labelColor: "text-[oklch(0.84_0.14_75)]" },
    2: { ring: "ring-[oklch(0.78_0.02_250/.55)]", glow: "shadow-[0_0_50px_oklch(0.8_0.02_250/.18)]", bar: "bg-[linear-gradient(0deg,oklch(0.50_0.02_250),oklch(0.86_0.02_250))]", icon: <Trophy className="h-5 w-5 text-[oklch(0.82_0.02_250)]" />, label: "VICE", labelColor: "text-[oklch(0.82_0.02_250)]" },
    3: { ring: "ring-[oklch(0.62_0.12_45/.55)]", glow: "shadow-[0_0_50px_oklch(0.62_0.12_45/.18)]", bar: "bg-[linear-gradient(0deg,oklch(0.42_0.10_45),oklch(0.68_0.12_55))]", icon: <Medal className="h-5 w-5 text-[oklch(0.68_0.12_55)]" />, label: "TERCEIRO", labelColor: "text-[oklch(0.68_0.12_55)]" },
  }[position];

  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=161616&color=f5f0e6&size=256`;

  return (
    <div className={`relative flex w-full max-w-[240px] flex-col items-center ${height}`}>
      <div className={`flex flex-1 flex-col items-center justify-start gap-3 border border-[oklch(1_0_0/.08)] bg-[linear-gradient(180deg,oklch(1_0_0/.065),oklch(1_0_0/.02))] p-5 backdrop-blur-xl ${cfg.glow}`}>
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <div className={`flex h-10 w-10 items-center justify-center border-2 border-[oklch(1_0_0/.16)] bg-[oklch(0.10_0.01_250)] backdrop-blur-xl ${cfg.labelColor}`}>
            <span className="font-mono text-lg font-black">{position}</span>
          </div>
        </div>
        <div className={`relative mt-4 ${position === 1 ? "h-28 w-28" : "h-20 w-20"}`}>
          {position === 1 && <div className="absolute -top-8 left-1/2 -translate-x-1/2 animate-bounce">{cfg.icon}</div>}
          <div className={`absolute inset-0 animate-pulse rounded-full ${position === 1 ? "bg-[oklch(0.84_0.14_75/.35)]" : "bg-[oklch(1_0_0/.1)]"} blur-xl`} />
          <img src={avatar} alt={item.nome} className={`relative h-full w-full rounded-full object-cover ring-4 ${cfg.ring} ring-offset-4 ring-offset-[oklch(0.10_0.01_250)]`} />
        </div>
        <div className="text-center">
          <p className={`text-[0.55rem] font-black uppercase tracking-[0.3em] ${cfg.labelColor}`}>{cfg.label}</p>
          <h3 className={`mt-1 truncate font-black leading-tight ${position === 1 ? "text-xl" : "text-base"}`}>{item.nome}</h3>
          {item.expert && <p className="text-[0.65rem] uppercase tracking-widest text-[oklch(0.72_0.03_85)]">{item.expert}</p>}
        </div>
        <div className="w-full border border-[oklch(1_0_0/.08)] bg-[oklch(0.08_0.01_250/.72)] px-3 py-2 text-center">
          <p className="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-[oklch(0.72_0.03_85)]">Faturamento</p>
          <p className={`font-mono font-black tabular-nums ${position === 1 ? "text-2xl text-[oklch(0.84_0.14_75)]" : "text-lg"}`}>{BRL(item.faturamento)}</p>
          <p className="text-[0.6rem] font-bold text-[oklch(0.72_0.03_85)]">{item.vendas} venda{item.vendas !== 1 ? "s" : ""} · TM {BRL(item.ticketMedio)}</p>
          <div className="mt-2 h-1.5 overflow-hidden bg-[oklch(1_0_0/.08)]">
            <div className="h-full bg-[oklch(0.72_0.16_150)]" style={{ width: `${item.metaPct}%` }} />
          </div>
        </div>
      </div>
      <div className={`h-3 w-full ${cfg.bar}`} />
    </div>
  );
}

function ListRow({ item, position }: { item: PublicRankingItem; position: number }) {
  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=161616&color=f5f0e6`;
  return (
    <div className="grid grid-cols-[28px_34px_1fr_auto] items-center gap-2 border border-[oklch(1_0_0/.06)] bg-[oklch(1_0_0/.035)] px-2.5 py-2">
      <div className="flex h-7 w-7 items-center justify-center bg-[oklch(1_0_0/.06)] font-mono text-xs font-black text-[oklch(0.72_0.03_85)]">{position}</div>
      <img src={avatar} alt={item.nome} className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black">{item.nome}</p>
        <div className="flex items-center gap-2 text-[0.6rem] text-[oklch(0.72_0.03_85)]">
          {item.expert && <span className="uppercase tracking-widest">{item.expert}</span>}
          <span>· {item.vendas}v</span>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-black tabular-nums text-[oklch(0.72_0.16_150)]">{BRL(item.faturamento)}</p>
        <div className="mt-1 h-1 w-20 overflow-hidden bg-[oklch(1_0_0/.08)]">
          <div className="h-full bg-[oklch(0.84_0.14_75)]" style={{ width: `${Math.min(100, item.metaPct)}%` }} />
        </div>
      </div>
    </div>
  );
}

function MetaLogRow({ log }: { log: MetaLog }) {
  const pct = log.meta > 0 ? Math.min(100, (log.faturamento / log.meta) * 100) : 0;
  return (
    <div className={`border px-3 py-3 ${log.batida ? "border-[oklch(0.72_0.16_150/.28)] bg-[oklch(0.72_0.16_150/.08)]" : "border-[oklch(1_0_0/.06)] bg-[oklch(1_0_0/.03)]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{log.nome}</p>
          <p className="text-[0.62rem] uppercase tracking-[0.18em] text-[oklch(0.72_0.03_85)]">{log.expert ?? log.utm} · {log.vendas} venda{log.vendas !== 1 ? "s" : ""}</p>
        </div>
        <div className={`flex items-center gap-1 text-[0.62rem] font-black uppercase tracking-[0.12em] ${log.batida ? "text-[oklch(0.72_0.16_150)]" : "text-[oklch(0.84_0.14_75)]"}`}>
          {log.batida ? <Award className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
          {log.batida ? "batida" : `${pct.toFixed(0)}%`}
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden bg-[oklch(1_0_0/.08)]">
        <div className="h-full bg-[linear-gradient(90deg,oklch(0.72_0.16_150),oklch(0.84_0.14_75))]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[0.68rem] font-black tabular-nums text-[oklch(0.72_0.03_85)]">
        <span>{BRL(log.faturamento)}</span>
        <span>{BRL(log.meta)}</span>
      </div>
    </div>
  );
}
