import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Crown, Flame, Medal, Sparkles, Target, Trophy, Zap } from "lucide-react";
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

type Celebration = {
  id: number;
  nome: string;
  expert: string | null;
  meta: number;
  faturamento: number;
};

type SalePop = { id: number; nome: string; expert: string | null; avatar: string; ticket: number; left: number };

function RankingTV() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [confetti, setConfetti] = useState<{ id: number; left: number; color: string; delay: number; size: number; kind: "balloon" | "confetti" }[]>([]);
  const [salePops, setSalePops] = useState<SalePop[]>([]);
  const celebratedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const rankingRef = useRef<PublicRankingItem[]>([]);
  const [pulse, setPulse] = useState(0); // flash pulse on new sale

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => {
    const to = todayISO();
    return { from: to, to };
  }, []);

  const queryKey = ["ranking-tv-public-rpc", range.from, range.to];

  const { data } = useQuery<RankingTvPayload>({
    queryKey,
    queryFn: async () => {
      const { data: rpcData, error } = await supabase.rpc("get_ranking_tv_stats", {
        _from: range.from,
        _to: range.to,
      });
      if (error) throw error;
      return rpcData as unknown as RankingTvPayload;
    },
    refetchInterval: 15_000,
  });

  // Realtime: invalida a query quando entra venda nova + dispara pop
  useEffect(() => {
    const channel = supabase
      .channel("ranking-tv-vendas")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vendas" },
        (payload) => {
          setPulse((p) => p + 1);
          queryClient.invalidateQueries({ queryKey });
          const row = (payload.new ?? {}) as Record<string, unknown>;
          const evento = String(row.Evento ?? "");
          if (!/aprov|purchase_approved/i.test(evento)) return;
          const utm = String(row.UTM ?? "").trim().toUpperCase();
          const ticketRaw = String(row.Ticket ?? "0").replace(/[^0-9,.-]/g, "").replace(",", ".");
          const ticket = parseFloat(ticketRaw) || 0;
          const seller = rankingRef.current.find((r) => r.utm?.toUpperCase() === utm);
          const nome = seller?.nome ?? "Nova venda";
          const expert = seller?.expert ?? null;
          const avatar = seller?.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(nome)}&background=0a0a0c&color=e5e5e5&size=200&bold=true`;
          const pop: SalePop = {
            id: Date.now() + Math.random(),
            nome, expert, avatar, ticket,
            left: 20 + Math.random() * 60,
          };
          setSalePops((prev) => [...prev, pop]);
          setTimeout(() => {
            setSalePops((prev) => prev.filter((p) => p.id !== pop.id));
          }, 5200);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "vendas" },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ranking = data?.ranking ?? [];
  useEffect(() => { rankingRef.current = ranking; }, [ranking]);
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3, 15);
  const metaLogs = data?.metaLogs ?? [];
  const hitCount = metaLogs.filter((l) => l.batida).length;

  // Detecta novas metas batidas e celebra em FILA
  useEffect(() => {
    const hits = metaLogs.filter((l) => l.batida);
    if (!initializedRef.current) {
      // primeira carga: já registra todas como celebradas sem disparar animação
      hits.forEach((h) => celebratedRef.current.add(h.utm));
      initializedRef.current = true;
      return;
    }
    const novos = hits.filter((h) => !celebratedRef.current.has(h.utm));
    if (novos.length === 0) return;
    novos.forEach((h) => celebratedRef.current.add(h.utm));
    // dispara celebração do primeiro novo
    setCelebration({
      id: Date.now(),
      nome: novos[0].nome,
      expert: novos[0].expert,
      meta: novos[0].meta,
      faturamento: novos[0].faturamento,
    });
    const colors = ["#d4a017", "#10b981", "#3b82f6", "#e11d48", "#f5f5f5"];
    const items = Array.from({ length: 60 }, (_, i) => ({
      id: Date.now() + i,
      left: Math.random() * 100,
      color: colors[i % colors.length],
      delay: Math.random() * 1.5,
      size: 0.7 + Math.random() * 0.8,
      kind: (i % 3 === 0 ? "balloon" : "confetti") as "balloon" | "confetti",
    }));
    setConfetti(items);
    const t1 = setTimeout(() => setCelebration(null), 6000);
    const t2 = setTimeout(() => setConfetti([]), 10000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [metaLogs]);

  // pulso suave no header quando entra venda nova
  const [pulseFlash, setPulseFlash] = useState(false);
  useEffect(() => {
    if (pulse === 0) return;
    setPulseFlash(true);
    const t = setTimeout(() => setPulseFlash(false), 900);
    return () => clearTimeout(t);
  }, [pulse]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#0a0a0c] text-neutral-100">
      <style>{`
        @keyframes balloon-rise { 0% { transform: translate3d(0,110vh,0) rotate(-4deg); opacity:0; } 8% { opacity:1; } 92% { opacity:1; } 100% { transform: translate3d(0,-25vh,0) rotate(8deg); opacity:0; } }
        @keyframes confetti-fall { 0% { transform: translate3d(0,-15vh,0) rotate(0deg); opacity:0; } 10% { opacity:1; } 90% { opacity:1; } 100% { transform: translate3d(0,110vh,0) rotate(720deg); opacity:0; } }
        @keyframes celebration-pop { 0% { transform: scale(.85) translateY(20px); opacity:0; } 15% { transform: scale(1.04) translateY(0); opacity:1; } 85% { transform: scale(1) translateY(0); opacity:1; } 100% { transform: scale(.95) translateY(-10px); opacity:0; } }
        @keyframes pulse-dot { 0%,100% { opacity:1; transform:scale(1);} 50% { opacity:.4; transform:scale(.85);} }
        @keyframes border-pulse { 0%,100% { box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);} 50% { box-shadow: inset 0 0 0 1px rgba(16,185,129,.35);} }
        .balloon-rise { animation: balloon-rise 7s cubic-bezier(.4,.0,.6,1) forwards; }
        .confetti-fall { animation: confetti-fall 5s cubic-bezier(.55,.15,.45,.85) forwards; }
        .live-dot { animation: pulse-dot 1.4s ease-in-out infinite; }
        .header-pulse { animation: border-pulse 900ms ease-out; }
        .corp-grid { background-image: linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px); background-size: 72px 72px; }
        .celebrate-card { animation: celebration-pop 6s ease forwards; }
      `}</style>

      {/* Background sóbrio */}
      <div className="pointer-events-none absolute inset-0">
        <div className="corp-grid absolute inset-0" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,.025),transparent_60%)]" />
      </div>

      {/* Confete + balões */}
      {confetti.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[200] overflow-hidden">
          {confetti.map((c) =>
            c.kind === "balloon" ? (
              <div
                key={c.id}
                className="balloon-rise absolute"
                style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, bottom: 0, transform: `scale(${c.size})` }}
              >
                <svg width="44" height="58" viewBox="0 0 48 64">
                  <ellipse cx="24" cy="22" rx="18" ry="22" fill={c.color} opacity="0.9" />
                  <ellipse cx="18" cy="14" rx="5" ry="3" fill="white" opacity="0.3" />
                  <path d="M24 44 L22 48 L26 48 Z" fill={c.color} opacity="0.85" />
                  <path d="M24 48 Q22 56 24 64" stroke="white" strokeOpacity="0.35" strokeWidth="0.8" fill="none" />
                </svg>
              </div>
            ) : (
              <div
                key={c.id}
                className="confetti-fall absolute"
                style={{
                  left: `${c.left}%`,
                  top: 0,
                  animationDelay: `${c.delay}s`,
                  width: `${10 * c.size}px`,
                  height: `${14 * c.size}px`,
                  backgroundColor: c.color,
                  opacity: 0.9,
                }}
              />
            )
          )}
        </div>
      )}

      {/* Card de celebração */}
      {celebration && (
        <div className="pointer-events-none absolute left-1/2 top-[18%] z-[210] -translate-x-1/2">
          <div className="celebrate-card rounded-xl border border-emerald-500/40 bg-[#0d1411]/95 px-8 py-5 text-center shadow-[0_20px_60px_-20px_rgba(16,185,129,.5)] backdrop-blur-md">
            <div className="flex items-center justify-center gap-2 text-[0.6rem] font-bold uppercase tracking-[0.32em] text-emerald-400">
              <Award className="h-3 w-3" /> meta batida
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{celebration.nome}</p>
            {celebration.expert && (
              <p className="text-[0.65rem] uppercase tracking-[0.24em] text-neutral-400">{celebration.expert}</p>
            )}
            <p className="mt-2 font-mono text-xl font-bold text-emerald-400">
              {BRL(celebration.faturamento)} <span className="text-neutral-500">/ {BRL(celebration.meta)}</span>
            </p>
          </div>
        </div>
      )}

      {/* HEADER sóbrio */}
      <header className={`relative z-10 flex h-[80px] items-center justify-between border-b border-white/[.04] px-10 ${pulseFlash ? "header-pulse" : ""}`}>
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500/90">
            <Trophy className="h-5 w-5 text-neutral-900" fill="currentColor" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.34em] text-neutral-400">
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ao vivo
              <span className="text-neutral-700">·</span>
              <span>TV aberta</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold uppercase leading-none tracking-[0.04em] text-neutral-100">
              Ranking <span className="text-amber-500">Multium</span>
            </h1>
          </div>
        </div>

        <div className="text-right">
          <p className="font-mono text-3xl font-light leading-none tabular-nums text-neutral-100">
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.32em] text-neutral-500">
            {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
        </div>
      </header>

      {/* STATS sóbrios */}
      <div className="relative z-10 grid grid-cols-3 gap-4 border-b border-white/[.04] px-10 py-5">
        <StatCard label="Faturamento hoje" value={BRL(data?.totalFaturamento ?? 0)} tone="emerald" icon={<Zap className="h-3.5 w-3.5" />} />
        <StatCard label="Vendas aprovadas" value={String(data?.totalVendas ?? 0)} tone="amber" icon={<Flame className="h-3.5 w-3.5" />} />
        <StatCard label="Ticket médio" value={BRL(data?.ticketMedioGeral ?? 0)} tone="neutral" icon={<Sparkles className="h-3.5 w-3.5" />} />
      </div>

      {/* MAIN GRID */}
      <main className="relative z-10 grid h-[calc(100vh-80px-92px)] grid-cols-12 gap-4 px-10 py-5">
        {/* PODIUM */}
        <section className="col-span-8 flex min-h-0 flex-col rounded-lg border border-white/[.04] bg-white/[.012] p-6">
          <header className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-[0.58rem] font-semibold uppercase tracking-[0.34em] text-neutral-500">o pódio</h2>
              <p className="mt-1.5 text-xl font-semibold text-neutral-100">Top performers de hoje</p>
            </div>
            <div className="rounded border border-white/[.06] bg-white/[.02] px-3 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-neutral-400">
              {data?.vendedoresAtivos ?? 0} vendedores
            </div>
          </header>

          <div className="flex flex-1 items-end justify-center gap-5 pb-2 pt-6">
            {top3[1] && <PodiumCard item={top3[1]} position={2} height="h-[70%]" />}
            {top3[0] && <PodiumCard item={top3[0]} position={1} height="h-[90%]" />}
            {top3[2] && <PodiumCard item={top3[2]} position={3} height="h-[58%]" />}
            {top3.length === 0 && (
              <div className="flex h-full w-full items-center justify-center text-neutral-600">
                <p className="text-sm uppercase tracking-[0.3em]">Aguardando vendas…</p>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT */}
        <aside className="col-span-4 grid min-h-0 grid-rows-2 gap-4">
          <section className="flex min-h-0 flex-col rounded-lg border border-white/[.04] bg-white/[.012] p-5">
            <header className="mb-3 flex items-center justify-between border-b border-white/[.04] pb-3">
              <h2 className="flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-neutral-400">
                <Trophy className="h-3 w-3 text-amber-500" /> Próximos no pódio
              </h2>
              <span className="font-mono text-[0.6rem] font-semibold text-neutral-500">
                #4 — #{Math.min(15, 3 + rest.length)}
              </span>
            </header>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
              {rest.map((v, i) => (
                <ListRow key={v.utm} item={v} position={i + 4} />
              ))}
              {rest.length === 0 && (
                <div className="flex h-full items-center justify-center text-neutral-700">
                  <p className="text-[0.7rem] uppercase tracking-widest">Sem mais vendedores</p>
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-lg border border-white/[.04] bg-white/[.012] p-5">
            <header className="mb-3 flex items-center justify-between border-b border-white/[.04] pb-3">
              <h2 className="flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-neutral-400">
                <Target className="h-3 w-3 text-emerald-500" /> Metas individuais
              </h2>
              <span className="rounded border border-emerald-500/20 bg-emerald-500/[.06] px-2 py-0.5 font-mono text-[0.58rem] font-semibold text-emerald-400">
                {hitCount} batidas
              </span>
            </header>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
              {metaLogs.map((log) => (
                <MetaLogRow key={log.utm} log={log} />
              ))}
              {metaLogs.length === 0 && (
                <div className="flex h-full items-center justify-center text-center text-[0.7rem] uppercase tracking-[0.2em] text-neutral-700">
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

function StatCard({ label, value, tone, icon }: { label: string; value: string; tone: "emerald" | "amber" | "neutral"; icon: React.ReactNode }) {
  const colors = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    neutral: "text-neutral-200",
  }[tone];
  return (
    <div className="rounded-lg border border-white/[.05] bg-white/[.015] px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.28em] text-neutral-500">{label}</p>
        <span className={`flex h-6 w-6 items-center justify-center rounded border border-white/[.06] ${colors}`}>{icon}</span>
      </div>
      <p className={`mt-2 font-mono text-3xl font-light tabular-nums ${colors}`}>{value}</p>
    </div>
  );
}

function PodiumCard({ item, position, height }: { item: PublicRankingItem; position: 1 | 2 | 3; height: string }) {
  const cfg = {
    1: {
      ring: "ring-amber-500/80",
      bar: "bg-amber-500",
      icon: <Crown className="h-5 w-5 text-amber-400" fill="currentColor" />,
      label: "CAMPEÃO",
      labelColor: "text-amber-400",
      valueColor: "text-amber-400",
      badge: "bg-amber-500 text-neutral-900",
    },
    2: {
      ring: "ring-neutral-400/60",
      bar: "bg-neutral-400",
      icon: <Trophy className="h-4 w-4 text-neutral-300" />,
      label: "VICE",
      labelColor: "text-neutral-300",
      valueColor: "text-neutral-100",
      badge: "bg-neutral-300 text-neutral-900",
    },
    3: {
      ring: "ring-orange-600/70",
      bar: "bg-orange-600",
      icon: <Medal className="h-4 w-4 text-orange-400" />,
      label: "TERCEIRO",
      labelColor: "text-orange-400",
      valueColor: "text-orange-300",
      badge: "bg-orange-600 text-neutral-50",
    },
  }[position];

  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=0a0a0c&color=e5e5e5&size=256&bold=true`;
  const isFirst = position === 1;

  return (
    <div className={`relative flex w-full max-w-[260px] flex-col items-center ${height}`}>
      <div className="relative flex w-full flex-1 flex-col items-center gap-3 rounded-lg border border-white/[.06] bg-white/[.02] px-5 pb-5 pt-9">
        <div className={`absolute -top-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full font-mono text-sm font-bold ${cfg.badge}`}>
          {position}
        </div>

        {isFirst && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2">{cfg.icon}</div>
        )}

        <div className={`relative ${isFirst ? "h-28 w-28" : "h-20 w-20"}`}>
          <img
            src={avatar}
            alt={item.nome}
            className={`relative h-full w-full rounded-full object-cover ring-2 ${cfg.ring} ring-offset-4 ring-offset-[#0a0a0c]`}
          />
          {!isFirst && (
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2">{cfg.icon}</div>
          )}
        </div>

        <div className="text-center">
          <p className={`text-[0.55rem] font-semibold uppercase tracking-[0.3em] ${cfg.labelColor}`}>{cfg.label}</p>
          <h3 className={`mt-1 truncate font-semibold leading-tight text-neutral-100 ${isFirst ? "text-xl" : "text-base"}`}>{item.nome}</h3>
          {item.expert && (
            <p className="mt-0.5 text-[0.58rem] uppercase tracking-[0.2em] text-neutral-500">{item.expert}</p>
          )}
        </div>

        <div className="mt-auto w-full space-y-2">
          <div className="text-center">
            <p className={`font-mono font-light tabular-nums ${isFirst ? "text-3xl" : "text-xl"} ${cfg.valueColor}`}>
              {BRL(item.faturamento)}
            </p>
            <p className="mt-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              {item.vendas} venda{item.vendas !== 1 ? "s" : ""} · TM {BRL(item.ticketMedio)}
            </p>
          </div>
          {item.meta > 0 && (
            <div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[.06]">
                <div
                  className={item.metaBatida ? "h-full bg-emerald-500" : "h-full bg-amber-500"}
                  style={{ width: `${item.metaPct}%` }}
                />
              </div>
              <p className={`mt-1 text-center text-[0.56rem] font-semibold uppercase tracking-wider ${item.metaBatida ? "text-emerald-400" : "text-neutral-500"}`}>
                {item.metaBatida ? "✓ meta batida" : `${item.metaPct.toFixed(0)}% da meta`}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className={`h-1 w-full rounded-b ${cfg.bar}`} />
    </div>
  );
}

function ListRow({ item, position }: { item: PublicRankingItem; position: number }) {
  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=0a0a0c&color=e5e5e5&bold=true`;
  return (
    <div className="grid grid-cols-[22px_30px_1fr_auto] items-center gap-2.5 rounded border border-white/[.03] bg-white/[.012] px-2 py-1.5">
      <span className="font-mono text-[0.65rem] font-semibold text-neutral-500">{position}</span>
      <img src={avatar} alt={item.nome} className="h-8 w-8 rounded-full object-cover ring-1 ring-white/[.08]" />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-neutral-200">{item.nome}</p>
        <div className="flex items-center gap-1.5 text-[0.55rem] text-neutral-500">
          {item.expert && <span className="uppercase tracking-wider">{item.expert}</span>}
          <span>· {item.vendas}v</span>
        </div>
      </div>
      <p className="font-mono text-xs font-semibold tabular-nums text-amber-400">{BRL(item.faturamento)}</p>
    </div>
  );
}

function MetaLogRow({ log }: { log: MetaLog }) {
  const pct = log.meta > 0 ? Math.min(100, (log.faturamento / log.meta) * 100) : 0;
  return (
    <div className={`rounded border px-2.5 py-1.5 ${log.batida ? "border-emerald-500/20 bg-emerald-500/[.04]" : "border-white/[.04] bg-white/[.012]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-neutral-200">{log.nome}</p>
          <p className="text-[0.55rem] uppercase tracking-wider text-neutral-500">
            {log.expert ?? log.utm} · {log.vendas}v
          </p>
        </div>
        <div className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.56rem] font-semibold uppercase tracking-wider ${log.batida ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-white/[.06] bg-white/[.02] text-neutral-400"}`}>
          {log.batida ? <Award className="h-2.5 w-2.5" /> : <Target className="h-2.5 w-2.5" />}
          {log.batida ? "batida" : `${pct.toFixed(0)}%`}
        </div>
      </div>
      <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/[.05]">
        <div
          className={log.batida ? "h-full bg-emerald-500" : "h-full bg-amber-500"}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[0.58rem] font-semibold tabular-nums text-neutral-500">
        <span className={log.batida ? "text-emerald-400" : "text-neutral-300"}>{BRL(log.faturamento)}</span>
        <span className="text-neutral-600">/ {BRL(log.meta)}</span>
      </div>
    </div>
  );
}
