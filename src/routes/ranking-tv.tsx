import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ranking-tv")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ranking TV — MULTIUM" },
      { name: "description", content: "Ranking de vendas ao vivo em modo TV." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" },
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

type HallEntry = { utm: string; nome: string; expert: string | null; fotoUrl: string | null; faturamento: number; vendas: number; meta: number };
type HallProx = { nome: string; faturamento: number; meta: number };
type HallOfFamePayload = {
  lobo: HallEntry | null;
  rainha: HallEntry | null;
  metaLobo: number;
  metaRainha: number;
  proxLobo: HallProx | null;
  proxRainha: HallProx | null;
};

type ColetivaItem = { expert: string; faturamento: number; meta: number; vendas: number; pct: number; nivel: number; diasRestantes: number; necessarioSemana: number; faltam: number };

type Balao = { num: number; icon: string; label: string; desc: string; tier: "nada" | "pix" | "vale" | "ouro" | "extra" };

function todayISO() {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

type Celebration = { id: number; nome: string; expert: string | null; meta: number; faturamento: number };
type SalePop = { id: number; nome: string; expert: string | null; avatar: string; ticket: number; left: number };

const BALOES: Balao[] = [
  { num: 1, icon: "❌", label: "NADA", desc: "Quase! Mas o foco continua!", tier: "nada" },
  { num: 2, icon: "❌", label: "NADA", desc: "Bateu na trave, guerreiro!", tier: "nada" },
  { num: 3, icon: "🎈", label: "ESTOURE OUTRO BALÃO!", desc: "O universo te deu mais uma chance!", tier: "extra" },
  { num: 4, icon: "❌", label: "NADA", desc: "Fica triste não, amanhã tem mais!", tier: "nada" },
  { num: 5, icon: "❌", label: "NADA", desc: "Quase!", tier: "nada" },
  { num: 6, icon: "❌", label: "NADA", desc: "Vazio igual ao direct do concorrente kkk", tier: "nada" },
  { num: 7, icon: "💸", label: "PIX DE R$ 100,00 NA CONTA!", desc: "O prêmio de ouro!", tier: "ouro" },
  { num: 8, icon: "❌", label: "NADA", desc: "Segue o jogo, tubarão!", tier: "nada" },
  { num: 9, icon: "❌", label: "NADA", desc: "Não desiste!", tier: "nada" },
  { num: 10, icon: "❌", label: "NADA", desc: "O balão tava com preguiça hoje…", tier: "nada" },
  { num: 11, icon: "❌", label: "NADA", desc: "Passou perto!", tier: "nada" },
  { num: 12, icon: "⚡", label: "VALE REDBULL OU BARRA DE CHOCOLATE", desc: "Pra dar aquele gás no fechamento!", tier: "vale" },
  { num: 13, icon: "❌", label: "NADA", desc: "O próximo vai ser o premiado!", tier: "nada" },
  { num: 14, icon: "❌", label: "NADA", desc: "Bora que o faturamento cura tudo!", tier: "nada" },
  { num: 15, icon: "💸", label: "PIX DE R$ 50,00!", desc: "Bônus surpresa!", tier: "pix" },
  { num: 16, icon: "❌", label: "NADA", desc: "Tente amanhã com mais sangue no olho!", tier: "nada" },
];

function RankingTV() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [confetti, setConfetti] = useState<{ id: number; left: number; color: string; delay: number; size: number; kind: "balloon" | "confetti" }[]>([]);
  const [salePops, setSalePops] = useState<SalePop[]>([]);
  const celebratedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const rankingRef = useRef<PublicRankingItem[]>([]);
  const [pulse, setPulse] = useState(0);

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
      const { data: rpcData, error } = await supabase.rpc("get_ranking_tv_stats", { _from: range.from, _to: range.to });
      if (error) throw error;
      return rpcData as unknown as RankingTvPayload;
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("ranking-tv-vendas")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vendas" }, (payload) => {
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
        const avatar = seller?.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(nome)}&background=4ade80&color=000&size=200&bold=true`;
        const pop: SalePop = { id: Date.now() + Math.random(), nome, expert, avatar, ticket, left: 20 + Math.random() * 60 };
        setSalePops((prev) => [...prev, pop]);
        setTimeout(() => setSalePops((prev) => prev.filter((p) => p.id !== pop.id)), 5200);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "vendas" }, () => {
        queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ranking = data?.ranking ?? [];
  useEffect(() => { rankingRef.current = ranking; }, [ranking]);
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3, 10);
  const metaLogs = data?.metaLogs ?? [];
  const hitCount = metaLogs.filter((l) => l.batida).length;

  useEffect(() => {
    const hits = metaLogs.filter((l) => l.batida);
    if (!initializedRef.current) {
      hits.forEach((h) => celebratedRef.current.add(h.utm));
      initializedRef.current = true;
      return;
    }
    const novos = hits.filter((h) => !celebratedRef.current.has(h.utm));
    if (novos.length === 0) return;
    novos.forEach((h) => celebratedRef.current.add(h.utm));
    setCelebration({ id: Date.now(), nome: novos[0].nome, expert: novos[0].expert, meta: novos[0].meta, faturamento: novos[0].faturamento });
    const colors = ["#fbbf24", "#4ade80", "#22d3ee", "#e11d48", "#f5f5f5"];
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
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [metaLogs]);

  const { data: coletivasData } = useQuery<ColetivaItem[]>({
    queryKey: ["metas-coletivas-mes"],
    queryFn: async () => {
      const { data: r, error } = await supabase.rpc("get_metas_coletivas_mes");
      if (error) throw error;
      return (r ?? []) as unknown as ColetivaItem[];
    },
    refetchInterval: 30_000,
  });
  const metasColetivas = coletivasData ?? [];

  const { data: hallData } = useQuery<HallOfFamePayload>({
    queryKey: ["hall-of-fame-mes"],
    queryFn: async () => {
      const { data: r, error } = await supabase.rpc("get_hall_of_fame_mes");
      if (error) throw error;
      return (r ?? {}) as unknown as HallOfFamePayload;
    },
    refetchInterval: 30_000,
  });

  const baloesAbertos = Math.min(hitCount, BALOES.length);
  const totaisPremios = useMemo(() => {
    const abertos = BALOES.slice(0, baloesAbertos);
    return {
      pix: abertos.filter((b) => b.tier === "pix" || b.tier === "ouro").length,
      premio: abertos.filter((b) => b.tier !== "nada").length,
      vale: abertos.filter((b) => b.tier === "vale").length,
    };
  }, [baloesAbertos]);

  return (
    <div className="fixed inset-0 z-[100] flex h-screen flex-col overflow-hidden bg-[#020206] text-white" style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <style>{`
        @keyframes ambientShift { 0% { transform: translate(0,0) rotate(0deg);} 100% { transform: translate(-2%,2%) rotate(3deg);} }
        @keyframes pulse-glow { 0%,100% { transform: scale(1); opacity:.6;} 50% { transform: scale(1.08); opacity:1;} }
        @keyframes float-y { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-8px);} }
        @keyframes crown-bounce { 0%,100% { transform: translateX(-50%) rotate(-5deg) scale(1);} 50% { transform: translateX(-50%) rotate(5deg) scale(1.1);} }
        @keyframes ring-rotate { from { transform: rotate(0);} to { transform: rotate(360deg);} }
        @keyframes shimmer { 0% { background-position: -200% 0;} 100% { background-position: 200% 0;} }
        @keyframes balloon-rise { 0% { transform: translate3d(0,110vh,0) rotate(-4deg); opacity:0;} 8% { opacity:1;} 92% { opacity:1;} 100% { transform: translate3d(0,-25vh,0) rotate(8deg); opacity:0;} }
        @keyframes confetti-fall { 0% { transform: translate3d(0,-15vh,0) rotate(0); opacity:0;} 10% { opacity:1;} 90% { opacity:1;} 100% { transform: translate3d(0,110vh,0) rotate(720deg); opacity:0;} }
        @keyframes celebration-pop { 0% { transform: scale(.85) translateY(20px); opacity:0;} 15% { transform: scale(1.04) translateY(0); opacity:1;} 85% { transform: scale(1) translateY(0); opacity:1;} 100% { transform: scale(.95) translateY(-10px); opacity:0;} }
        @keyframes sale-pop-rise { 0% { transform: translateY(60vh) scale(.4); opacity:0;} 12% { opacity:1; transform: translateY(40vh) scale(1.08);} 22% { transform: translateY(38vh) scale(1);} 78% { transform: translateY(38vh) scale(1); opacity:1;} 100% { transform: translateY(-30vh) scale(.85); opacity:0;} }
        @keyframes sale-ring { 0% { transform: scale(.6); opacity:.9;} 100% { transform: scale(2.4); opacity:0;} }
        .ambient::before { content:''; position:fixed; top:-50%; left:-50%; width:200%; height:200%; background: radial-gradient(ellipse at 20% 50%, rgba(74,222,128,.04) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(34,211,238,.03) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(251,191,36,.02) 0%, transparent 50%); animation: ambientShift 20s ease-in-out infinite alternate; pointer-events:none; z-index:0; }
        .glass { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); backdrop-filter: blur(20px); }
        .glass-strong { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(30px); }
        .glow-gold { filter: drop-shadow(0 0 40px rgba(251,191,36,.35)); }
        .glow-silver { filter: drop-shadow(0 0 25px rgba(148,163,184,.25)); }
        .glow-bronze { filter: drop-shadow(0 0 25px rgba(217,119,6,.25)); }
        .animate-glow { animation: pulse-glow 4s ease-in-out infinite; }
        .float-animation { animation: float-y 6s ease-in-out infinite; }
        .crown-animation { animation: crown-bounce 3s ease-in-out infinite; }
        .ring-spin { animation: ring-rotate 12s linear infinite; }
        .progress-bar { height:6px; background: rgba(255,255,255,.05); border-radius:10px; overflow:hidden; }
        .progress-fill { height:100%; border-radius:10px; transition: width 1s ease; }
        .no-scrollbar::-webkit-scrollbar { display:none; }
        .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
        .balloon-scroll::-webkit-scrollbar { width:3px; }
        .balloon-scroll::-webkit-scrollbar-track { background: transparent; }
        .balloon-scroll::-webkit-scrollbar-thumb { background: rgba(74,222,128,.2); border-radius:10px; }
        .balloon-rise { animation: balloon-rise 7s cubic-bezier(.4,0,.6,1) forwards; }
        .confetti-fall { animation: confetti-fall 5s cubic-bezier(.55,.15,.45,.85) forwards; }
        .celebrate-card { animation: celebration-pop 6s ease forwards; }
        .sale-pop { animation: sale-pop-rise 5s cubic-bezier(.22,.61,.36,1) forwards; }
        .sale-ring { animation: sale-ring 1.4s ease-out forwards; }
        .stat-card { position: relative; overflow: hidden; }
        .stat-card::after { content:''; position:absolute; inset:0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.03) 50%, transparent 100%); background-size:200% 100%; animation: shimmer 8s ease-in-out infinite; pointer-events:none; }
      `}</style>

      <div className="ambient" />

      {/* Confete + balões celebração */}
      {confetti.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[200] overflow-hidden">
          {confetti.map((c) =>
            c.kind === "balloon" ? (
              <div key={c.id} className="balloon-rise absolute" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, bottom: 0, transform: `scale(${c.size})` }}>
                <svg width="44" height="58" viewBox="0 0 48 64">
                  <ellipse cx="24" cy="22" rx="18" ry="22" fill={c.color} opacity="0.9" />
                  <ellipse cx="18" cy="14" rx="5" ry="3" fill="white" opacity="0.3" />
                  <path d="M24 44 L22 48 L26 48 Z" fill={c.color} opacity="0.85" />
                </svg>
              </div>
            ) : (
              <div key={c.id} className="confetti-fall absolute" style={{ left: `${c.left}%`, top: 0, animationDelay: `${c.delay}s`, width: `${10 * c.size}px`, height: `${14 * c.size}px`, backgroundColor: c.color, opacity: .9 }} />
            )
          )}
        </div>
      )}

      {/* Card de celebração */}
      {celebration && (
        <div className="pointer-events-none absolute left-1/2 top-[15%] z-[210] -translate-x-1/2">
          <div className="celebrate-card rounded-2xl border border-green-400/40 bg-black/80 px-10 py-6 text-center shadow-[0_20px_60px_-20px_rgba(74,222,128,.5)] backdrop-blur-md">
            <div className="flex items-center justify-center gap-2 text-[0.6rem] font-black uppercase tracking-[0.32em] text-green-400">
              <Award className="h-3 w-3" /> meta batida
            </div>
            <p className="mt-2 text-4xl font-black text-white">{celebration.nome}</p>
            {celebration.expert && <p className="text-[0.65rem] uppercase tracking-[0.24em] text-gray-400">{celebration.expert}</p>}
            <p className="mt-2 text-2xl font-black text-green-400">
              {BRL(celebration.faturamento)} <span className="text-gray-500">/ {BRL(celebration.meta)}</span>
            </p>
          </div>
        </div>
      )}

      {/* Pops de venda */}
      {salePops.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[205] overflow-hidden">
          {salePops.map((p) => (
            <div key={p.id} className="sale-pop absolute" style={{ left: `${p.left}%`, top: 0, transform: "translateX(-50%)" }}>
              <div className="relative -translate-x-1/2 flex flex-col items-center">
                <span className="sale-ring absolute top-8 h-24 w-24 rounded-full border-2 border-green-400/70" />
                <span className="sale-ring absolute top-8 h-24 w-24 rounded-full border-2 border-green-400/40" style={{ animationDelay: "0.25s" }} />
                <div className="relative">
                  <img src={p.avatar} alt={p.nome} className="relative h-20 w-20 rounded-full object-cover ring-4 ring-green-400 ring-offset-4 ring-offset-[#020206] shadow-[0_0_30px_rgba(74,222,128,.6)]" />
                </div>
                <div className="mt-3 rounded-md border border-green-400/40 bg-black/90 px-3 py-1.5 text-center backdrop-blur-sm">
                  <p className="text-[0.55rem] font-black uppercase tracking-[0.28em] text-green-400">+ venda</p>
                  <p className="text-base font-black text-green-300">{BRL(p.ticket)}</p>
                  <p className="mt-0.5 truncate text-[0.65rem] font-bold text-gray-200">{p.nome}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Container principal */}
      <div className="relative z-10 flex h-screen min-h-0 flex-1">

        {/* LEFT — Metas + Hall of Fame */}
        <aside className="no-scrollbar flex w-[340px] flex-shrink-0 flex-col overflow-y-auto border-r border-white/[.06] bg-black/40" style={{ backdropFilter: "blur(30px)" }}>
          <div className="flex flex-col gap-6 p-5">

            {/* Metas Coletivas */}
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-400/20 to-cyan-500/20 text-xl">🎯</div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">Metas Coletivas</h2>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Mês Atual</p>
                </div>
              </div>
              <div className="space-y-3">
                {metasColetivas.map((m, i) => <ColetivaCard key={m.expert} m={m} idx={i} />)}
                {metasColetivas.length === 0 && (
                  <p className="py-4 text-center text-[10px] uppercase tracking-widest text-gray-700">Sem dados</p>
                )}
              </div>
            </div>

            <div className="my-2 h-px w-full bg-white/10" />

            {/* Hall of Fame */}
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-500/20 text-xl">🏆</div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">Hall of Fame</h2>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Destaques Individuais</p>
                </div>
              </div>
              <div className="space-y-4">
                <HallCard kind="lobo" item={hallData?.lobo ?? null} meta={hallData?.metaLobo ?? 18000} />
                <HallCard kind="rainha" item={hallData?.rainha ?? null} meta={hallData?.metaRainha ?? 20000} />
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER */}
        <div className="flex min-w-0 flex-1 flex-col p-6">

          {/* Header */}
          <header className="mb-4 flex flex-shrink-0 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-2xl shadow-[0_0_30px_rgba(251,191,36,.3)]">🏆</div>
              <div>
                <h1 className="text-2xl font-black uppercase italic leading-none tracking-tighter text-white">RANKING DE OPERAÇÃO</h1>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">MULTIUM MONITORING SYSTEM</p>
              </div>
            </div>
            <div className="z-20 flex flex-col items-end gap-2">
              <div className="text-right">
                <p className="font-mono text-2xl font-light leading-none tabular-nums text-white">
                  {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.3em] text-gray-500">
                  {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                </p>
              </div>
              <div className="glass stat-card flex items-center gap-6 rounded-2xl px-5 py-2 shadow-xl">
                <div className="text-center">
                  <p className="text-[8px] font-black uppercase tracking-widest text-gray-500">Faturamento</p>
                  <p className="text-lg font-black tracking-tighter text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,.3)]">{BRL(data?.totalFaturamento ?? 0)}</p>
                </div>
                <div className="h-5 w-px bg-white/10" />
                <div className="text-center">
                  <p className="text-[8px] font-black uppercase tracking-widest text-gray-500">Vendas</p>
                  <p className="text-lg font-black tracking-tighter text-white">{data?.totalVendas ?? 0}</p>
                </div>
                <div className="h-5 w-px bg-white/10" />
                <div className="text-center">
                  <p className="text-[8px] font-black uppercase tracking-widest text-gray-500">Ticket</p>
                  <p className="text-lg font-black tracking-tighter text-amber-400">{BRL(data?.ticketMedioGeral ?? 0)}</p>
                </div>
              </div>
            </div>
          </header>

          {/* Podium Area */}
          <main className="no-scrollbar relative flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto overflow-x-hidden pb-10 pt-20">
            <div className="absolute top-[20%] -z-10 flex items-center justify-center opacity-15">
              <div className="h-[500px] w-[500px] animate-glow rounded-full bg-green-400 blur-[180px]" />
            </div>

            <div className="mt-2 flex w-full shrink-0 items-end justify-center gap-10 overflow-visible">
              {top3[1] ? <PodiumPlace item={top3[1]} place={2} /> : <PodiumPlaceholder place={2} />}
              {top3[0] ? <PodiumPlace item={top3[0]} place={1} /> : <PodiumPlaceholder place={1} />}
              {top3[2] ? <PodiumPlace item={top3[2]} place={3} /> : <PodiumPlaceholder place={3} />}
            </div>

            {/* Ranking 4+ */}
            <div className="z-10 mt-12 flex w-full max-w-4xl shrink-0 flex-col gap-2 px-4">
              {rest.map((v, i) => <RankRow key={v.utm} item={v} pos={i + 4} />)}
            </div>
          </main>

          {/* Footer */}
          <footer className="flex flex-shrink-0 items-center justify-between pt-2 text-[9px] font-bold uppercase tracking-widest text-gray-600">
            <div>MULTIUM OS v2.0 — RANKING ENGINE</div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-green-400" />
              Sincronizado · pulse {pulse}
            </div>
          </footer>
        </div>

        {/* RIGHT — Balões */}
        <aside className="flex w-[380px] flex-shrink-0 flex-col border-l border-white/[.06] bg-black/40" style={{ backdropFilter: "blur(30px)" }}>
          <div className="flex items-center justify-between border-b border-white/[.06] p-5">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-400/20 to-cyan-500/20 text-xl">🎈</div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">Meta dos Balões</h2>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Premiação da Campanha</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
                Bateu a meta? <span className="font-bold text-green-400">Estoure um balão</span> e descubra seu prêmio! 🎉
              </p>
            </div>
          </div>

          <div className="balloon-scroll flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-1.5">
              {BALOES.map((b, i) => <BalloonItem key={b.num} b={b} aberto={i < baloesAbertos} />)}
            </div>
          </div>

          <div className="border-t border-white/[.06] p-4">
            <div className="glass rounded-xl p-3 text-center">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-gray-500">Total de Prêmios</p>
              <div className="flex justify-center gap-4 text-[10px]">
                <span className="font-black text-amber-400">{totaisPremios.premio}× prêmio</span>
                <span className="font-black text-green-400">{totaisPremios.pix}× pix</span>
                <span className="font-black text-cyan-400">{totaisPremios.vale}× vale</span>
                <span className="font-black text-gray-500">{hitCount} metas</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ColetivaCard({ m, idx }: { m: ColetivaItem; idx: number }) {
  const palettes = [
    { border: "border-l-green-400", grad: "linear-gradient(90deg, #4ade80, #22d3ee)", txt: "text-green-400" },
    { border: "border-l-cyan-400", grad: "linear-gradient(90deg, #22d3ee, #3b82f6)", txt: "text-cyan-400" },
    { border: "border-l-amber-400", grad: "linear-gradient(90deg, #fbbf24, #f97316)", txt: "text-amber-400" },
    { border: "border-l-fuchsia-400", grad: "linear-gradient(90deg, #e879f9, #a855f7)", txt: "text-fuchsia-400" },
  ];
  const p = palettes[idx % palettes.length];
  return (
    <div className={`glass relative overflow-hidden rounded-xl border-l-2 p-4 ${p.border}`}>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{m.expert} Mensal</p>
          <h3 className="mt-1 text-lg font-black leading-none text-white">{BRL(m.faturamento)}</h3>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold uppercase text-white/50">Nível {m.nivel} ({Math.round(m.meta / 1000)}k)</p>
          <p className={`text-xs font-black ${p.txt}`}>{m.pct.toFixed(0)}%</p>
        </div>
      </div>
      <div className="progress-bar mb-1">
        <div className="progress-fill" style={{ width: `${Math.min(100, m.pct)}%`, background: p.grad }} />
      </div>
      <p className="mt-2 text-[9px] font-medium italic text-gray-400">
        Necessário p/ Nível {m.nivel} da semana: {BRL(m.necessarioSemana)} / Dias restantes: {m.diasRestantes}
      </p>
    </div>
  );
}

function HallCard({ kind, item, meta }: { kind: "lobo" | "rainha"; item: HallEntry | null; meta: number }) {
  const cfg = kind === "lobo"
    ? { emoji: "🐺", title: "Lobo do X1", emptyText: "Em busca do Lobo...", gradBg: "linear-gradient(135deg, rgba(251,191,36,0.1), rgba(0,0,0,0.4))", border: "rgba(251,191,36,0.5)", shadow: "0 0 20px rgba(251,191,36,0.2)", ringClass: "border-amber-400", titleClass: "text-amber-400" }
    : { emoji: "👑", title: "Rainha do X1", emptyText: "Em busca da Rainha...", gradBg: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.1))", border: "rgba(168,85,247,0.5)", shadow: "0 0 20px rgba(168,85,247,0.2)", ringClass: "border-fuchsia-500", titleClass: "bg-gradient-to-r from-purple-400 to-fuchsia-500 bg-clip-text text-transparent" };

  if (!item) {
    return (
      <div className="glass flex items-center gap-4 rounded-xl p-4 opacity-50 grayscale transition-all">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/20 bg-white/5 text-2xl">{cfg.emoji}</div>
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-white">{cfg.title}</h4>
          <p className="text-[10px] italic text-gray-400">{cfg.emptyText}</p>
          <p className="mt-0.5 text-[8px] uppercase text-white/30">Meta: {BRL(meta)} / Mês</p>
        </div>
      </div>
    );
  }
  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=fbbf24&color=000&size=200&bold=true`;
  return (
    <div className="relative flex flex-col items-center overflow-hidden rounded-xl p-4 text-center" style={{ background: cfg.gradBg, border: `1px solid ${cfg.border}`, boxShadow: cfg.shadow }}>
      <div className="relative z-10 mb-2 h-16 w-16">
        <div className={`h-full w-full rounded-full border-[3px] p-0.5 ${cfg.ringClass}`} style={{ filter: kind === "lobo" ? "drop-shadow(0 0 15px rgba(251,191,36,0.5))" : "drop-shadow(0 0 15px rgba(236,72,153,0.3))" }}>
          <img src={avatar} alt={item.nome} className="h-full w-full rounded-full object-cover" />
        </div>
        <div className="absolute -bottom-2 -right-2 rounded-full bg-black text-lg shadow-xl">{cfg.emoji}</div>
      </div>
      <h4 className={`relative z-10 mb-1 text-xs font-black uppercase tracking-widest ${cfg.titleClass}`}>{cfg.title}</h4>
      <p className="relative z-10 text-sm font-bold text-white">{BRL(item.faturamento)}</p>
      <p className="relative z-10 mt-1 text-[10px] uppercase tracking-widest text-gray-300">{item.nome}</p>
    </div>
  );
}

function PodiumPlace({ item, place }: { item: PublicRankingItem; place: 1 | 2 | 3 }) {
  const cfg = {
    1: { ring: "border-amber-400", glow: "glow-gold", badge: "from-amber-400 to-amber-600", size: "w-56 h-56 md:w-64 md:h-64", num: "w-16 h-16 text-2xl", nameSize: "text-4xl md:text-5xl", valSize: "text-2xl md:text-3xl", marginB: "mb-14", delay: "0s" },
    2: { ring: "border-slate-400", glow: "glow-silver", badge: "from-slate-400 to-gray-500", size: "w-40 h-40 md:w-44 md:h-44", num: "w-12 h-12 text-lg", nameSize: "text-xl md:text-2xl", valSize: "text-lg", marginB: "mb-0", delay: "1s" },
    3: { ring: "border-amber-700", glow: "glow-bronze", badge: "from-amber-700 to-amber-900", size: "w-40 h-40 md:w-44 md:h-44", num: "w-12 h-12 text-lg", nameSize: "text-xl md:text-2xl", valSize: "text-lg", marginB: "mb-0", delay: "2s" },
  }[place];
  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=${place === 1 ? "fbbf24&color=000" : place === 2 ? "94a3b8&color=fff" : "d97706&color=fff"}&size=256&bold=true`;

  return (
    <div className={`float-animation flex flex-col items-center gap-3 ${cfg.marginB}`} style={{ animationDelay: cfg.delay }}>
      <div className="relative">
        {place === 1 && (
          <>
            <div className="crown-animation absolute -top-16 left-1/2 z-10 text-6xl" style={{ filter: "drop-shadow(0 0 10px rgba(251,191,36,0.5))", transform: "translateX(-50%)" }}>👑</div>
            <div className="ring-spin absolute -inset-4 rounded-full" style={{ border: "2px dashed rgba(251,191,36,0.18)" }} />
          </>
        )}
        <div className={`${cfg.size} overflow-hidden rounded-full border-[4px] p-1 ${cfg.ring} ${cfg.glow}`}>
          <img src={avatar} alt={item.nome} className="h-full w-full rounded-full object-cover" />
        </div>
        <div className={`absolute -bottom-2 -right-2 ${cfg.num} flex items-center justify-center rounded-full bg-gradient-to-br ${cfg.badge} border-4 border-[#020206] font-black text-black shadow-xl`}>
          {place}
        </div>
      </div>
      <div className="max-w-[280px] text-center">
        <p className={`truncate font-black leading-tight text-white drop-shadow-lg ${cfg.nameSize}`}>{item.nome}</p>
        {item.expert && <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{item.expert}</p>}
        <p className={`mt-1 font-black italic tracking-tighter text-green-400 ${cfg.valSize}`}>{BRL(item.faturamento)}</p>
        <p className="mt-0.5 text-[11px] font-bold text-gray-500">{item.vendas} venda{item.vendas !== 1 ? "s" : ""} · TM {BRL(item.ticketMedio)}</p>
        {item.meta > 0 && (
          <div className="mx-auto mt-2 w-44">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(100, item.metaPct)}%`, background: item.metaBatida ? "#4ade80" : "linear-gradient(90deg,#fbbf24,#f59e0b)" }} />
            </div>
            <p className={`mt-1 text-[9px] font-black uppercase tracking-wider ${item.metaBatida ? "text-green-400" : "text-gray-500"}`}>
              {item.metaBatida ? "✓ meta batida" : `${item.metaPct.toFixed(0)}% da meta`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PodiumPlaceholder({ place }: { place: 1 | 2 | 3 }) {
  const sz = place === 1 ? "w-56 h-56 md:w-64 md:h-64" : "w-40 h-40 md:w-44 md:h-44";
  return (
    <div className={`flex flex-col items-center gap-3 opacity-40 ${place === 1 ? "mb-14" : ""}`}>
      <div className={`${sz} rounded-full border-[3px] border-dashed border-white/15 bg-white/[.02]`} />
      <p className="text-[10px] uppercase tracking-widest text-gray-700">aguardando #{place}</p>
    </div>
  );
}

function RankRow({ item, pos }: { item: PublicRankingItem; pos: number }) {
  const avatar = item.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.nome)}&background=1a1a1a&color=fff&bold=true`;
  return (
    <div className="glass flex items-center gap-4 rounded-xl px-4 py-2.5">
      <span className="w-6 text-center font-mono text-sm font-black text-gray-500">{pos}</span>
      <img src={avatar} alt={item.nome} className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{item.nome}</p>
        <p className="text-[10px] uppercase tracking-wider text-gray-500">{item.expert ?? "—"} · {item.vendas}v</p>
      </div>
      <p className="font-mono text-base font-black tabular-nums text-green-400">{BRL(item.faturamento)}</p>
    </div>
  );
}

function BalloonItem({ b, aberto }: { b: Balao; aberto: boolean }) {
  const tones: Record<Balao["tier"], { border: string; bg: string; text: string }> = {
    nada: { border: "border-l-white/10", bg: "bg-white/[.02]", text: "text-gray-500" },
    pix: { border: "border-l-amber-400", bg: "bg-amber-500/[.04]", text: "text-amber-300" },
    ouro: { border: "border-l-amber-400", bg: "bg-amber-500/[.06]", text: "text-amber-300" },
    vale: { border: "border-l-cyan-400", bg: "bg-cyan-500/[.04]", text: "text-cyan-300" },
    extra: { border: "border-l-green-400", bg: "bg-green-500/[.04]", text: "text-green-300" },
  };
  const tone = tones[b.tier];

  if (!aberto) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-white/[.04] border-l-2 border-l-white/10 bg-white/[.02] px-3 py-2.5 opacity-60">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-black/40 font-mono text-[10px] font-black text-gray-500">{b.num}</span>
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-base grayscale">🎈</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-wider text-gray-600">Bloqueado</p>
          <p className="truncate text-[9px] text-gray-700">Bata mais metas para abrir</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border border-white/[.04] border-l-2 px-3 py-2.5 transition ${tone.border} ${tone.bg}`}>
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-black/40 font-mono text-[10px] font-black text-white">{b.num}</span>
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-base">{b.icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[11px] font-black uppercase tracking-wider ${tone.text}`}>{b.label}</p>
        {b.desc && <p className="truncate text-[9px] italic text-gray-400">{b.desc}</p>}
      </div>
    </div>
  );
}
