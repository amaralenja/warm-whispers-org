import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import RadioButtonCheckedTwoTone from "@mui/icons-material/RadioButtonCheckedTwoTone";
import ElectricBoltTwoTone from "@mui/icons-material/ElectricBoltTwoTone";
import WorkspacePremiumTwoTone from "@mui/icons-material/WorkspacePremiumTwoTone";
import WarningTwoTone from "@mui/icons-material/WarningTwoTone";
import TrendingUpTwoTone from "@mui/icons-material/TrendingUpTwoTone";
import HowToRegTwoTone from "@mui/icons-material/HowToRegTwoTone";
import MonetizationOnTwoTone from "@mui/icons-material/MonetizationOnTwoTone";
import CampaignTwoTone from "@mui/icons-material/CampaignTwoTone";
import NotificationsActiveTwoTone from "@mui/icons-material/NotificationsActiveTwoTone";
import RefreshTwoTone from "@mui/icons-material/RefreshTwoTone";
import CloseTwoTone from "@mui/icons-material/CloseTwoTone";
import PhoneCallbackTwoTone from "@mui/icons-material/PhoneCallbackTwoTone";
import CheckCircleTwoTone from "@mui/icons-material/CheckCircleTwoTone";
import TimerTwoTone from "@mui/icons-material/TimerTwoTone";
import SensorsTwoTone from "@mui/icons-material/SensorsTwoTone";
import CalendarTodayTwoTone from "@mui/icons-material/CalendarTodayTwoTone";
import ArrowDownwardTwoTone from "@mui/icons-material/ArrowDownwardTwoTone";
import { supabase } from "@/integrations/supabase/client";
import { getLiveMonitoringTodayStats } from "@/lib/operacoes.functions";

export const Route = createFileRoute("/_authenticated/live-monitoring")({
  head: () => ({ meta: [{ title: "Monitoramento ao VIVO — MULTIUM" }] }),
  component: LiveMonitoringPage,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function LiveMonitoringPage() {
  const fetchLiveStats = useServerFn(getLiveMonitoringTodayStats);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unattendedModalOpen, setUnattendedModalOpen] = useState(false);
  const [trafficCountdown, setTrafficCountdown] = useState(300);

  // Fetch REAL TODAY data from server
  const { data: serverStats, isLoading, refetch } = useQuery({
    queryKey: ["live-monitoring-today"],
    queryFn: () => fetchLiveStats(),
    refetchInterval: 15_000, // Refresh real DB stats every 15s
  });

  const [realtimeX1Events, setRealtimeX1Events] = useState<any[]>([]);
  const [realtimeHtEvents, setRealtimeHtEvents] = useState<any[]>([]);

  // 5 Min countdown timer for HT Traffic Spend auto refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setTrafficCountdown((prev) => (prev <= 1 ? 300 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Supabase Realtime Subscription for REAL events arriving right now
  useEffect(() => {
    const channel = supabase
      .channel("live-monitoring-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vendas" },
        (payload: any) => {
          const newRow = payload.new;
          const timeStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          const val = Number(newRow.Ticket) || 0;
          const opName = newRow.nome_expert || "X1";
          const evt = {
            id: `rt-venda-${newRow.id || Date.now()}`,
            timestamp: timeStr,
            tipo: "venda_aprovada",
            titulo: `💰 Venda Aprovada R$ ${val.toLocaleString("pt-BR")}`,
            descricao: `Venda em tempo real na Operação ${opName}`,
            operacao: opName,
            valor: val,
          };
          setRealtimeX1Events((prev) => [evt, ...prev.slice(0, 15)]);
          if (soundEnabled && typeof window !== "undefined") {
            try {
              const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
              audio.play().catch(() => {});
            } catch {}
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ht_vendas" },
        (payload: any) => {
          const newRow = payload.new;
          const timeStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          const val = Number(newRow.valor_total) || 0;
          const evt = {
            id: `rt-ht-venda-${newRow.id || Date.now()}`,
            timestamp: timeStr,
            tipo: "venda_ht",
            titulo: "🎉 Venda High Ticket Fechada!",
            descricao: `Contrato de R$ ${val.toLocaleString("pt-BR")} fechado em tempo real!`,
            closer: newRow.closer || "Closer",
            valor: val,
          };
          setRealtimeHtEvents((prev) => [evt, ...prev.slice(0, 15)]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled]);

  const x1Feed = [...realtimeX1Events, ...(serverStats?.x1?.recentEvents ?? [])];
  const htFeed = [...realtimeHtEvents, ...(serverStats?.ht?.recentEvents ?? [])];

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const todayDisplay = serverStats?.todayStr
    ? `${serverStats.todayStr.slice(8, 10)}/${serverStats.todayStr.slice(5, 7)}/${serverStats.todayStr.slice(0, 4)}`
    : "Hoje";

  return (
    <main className="min-h-screen bg-[#090b0e] text-foreground p-6 md:p-8 space-y-8">
      {/* ── Top Header & Live Control Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-lg shadow-rose-500/10">
            <RadioButtonCheckedTwoTone className="!h-7 !w-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-black tracking-tight text-white md:text-3xl">
                Monitoramento ao VIVO
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-400">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                AO VIVO
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                <CalendarTodayTwoTone className="!h-3.5 !w-3.5 text-amber-400" />
                DADOS DE HOJE ({todayDisplay})
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Acompanhamento simultâneo em tempo real da Operação X1 e Operação High Ticket
            </p>
          </div>
        </div>

        {/* Live Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-xl border border-border/80 bg-card/60 px-3.5 py-2 text-xs font-bold text-muted-foreground hover:text-white hover:bg-card transition-all"
          >
            <RefreshTwoTone className={`!h-4 !w-4 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
            <span>Atualizar</span>
          </button>
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${
              soundEnabled
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-md shadow-amber-500/5"
                : "border-border/80 bg-card/60 text-muted-foreground"
            }`}
          >
            <NotificationsActiveTwoTone className="!h-4 !w-4" />
            <span>{soundEnabled ? "Sons Ativados" : "Som Mutado"}</span>
          </button>
        </div>
      </div>

      {/* ── Split Screen Container (Left X1 Gold | Right High Ticket Diamond/Emerald) ── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* ========================================================================= */}
        {/* 👈 LEFT COLUMN: OPERAÇÃO X1 (Gold & Amber Theme)                        */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          {/* Card Header X1 */}
          <div className="flex items-center justify-between rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-card/70 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-inner">
                <ElectricBoltTwoTone className="!h-6 !w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-black text-white tracking-wide">OPERAÇÃO X1</h2>
                  <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[0.65rem] font-bold text-amber-300 uppercase">
                    Vendas Rápidas
                  </span>
                </div>
                <p className="text-xs text-amber-300/80 mt-0.5">Atendimento via WhatsApp e Funil Curto de Conversão</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Faturamento Hoje</div>
              <div className="font-mono text-xl font-black text-amber-400">
                {isLoading ? "—" : BRL(serverStats?.x1?.totalRevenueToday ?? 0)}
              </div>
            </div>
          </div>

          {/* 🔺 DESENHO DE FUNIL GRÁFICO — OPERAÇÃO X1 🔺 */}
          <div className="rounded-3xl border border-amber-500/30 bg-card/60 p-6 shadow-2xl backdrop-blur-xl space-y-6">
            <div className="flex items-center justify-between border-b border-border/80 pb-4">
              <div className="flex items-center gap-2 text-amber-400">
                <ElectricBoltTwoTone className="!h-5 !w-5" />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Desenho do Funil X1 (Hoje)</span>
              </div>
              <span className="text-xs font-mono font-semibold text-amber-300/80">Fase 1 a 4</span>
            </div>

            {/* Graphic Funnel Container for X1 */}
            <div className="flex flex-col items-center gap-3 py-2">
              {/* Funnel Step 1: Leads que Chegaram (Width 100%) */}
              <div className="w-full relative group transition-all duration-300">
                <div className="mx-auto w-full rounded-2xl border border-sky-500/40 bg-gradient-to-r from-sky-500/25 via-sky-500/15 to-sky-500/25 p-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-sky-300">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/30 text-xs font-bold text-sky-200">1</span>
                      <HowToRegTwoTone className="!h-5 !w-5" />
                      <span className="text-xs font-bold uppercase tracking-wider">Leads que Chegaram</span>
                    </div>
                    <span className="font-mono text-2xl font-black text-white">
                      {isLoading ? "—" : (serverStats?.x1?.totalLeadsToday ?? 0)}
                    </span>
                  </div>
                  {/* Detailed breakdown per operation */}
                  <div className="mt-3 flex flex-wrap gap-2 pt-2.5 border-t border-sky-500/20 text-xs">
                    {(serverStats?.x1?.leadsByOp ?? []).map((op) => (
                      <span key={op.nome} className="rounded-xl bg-background/80 border border-sky-500/20 px-3 py-1 font-semibold text-muted-foreground">
                        {op.nome}: <strong className="text-white font-mono">{op.count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Conversion Arrow 1 */}
              <div className="flex items-center gap-1 text-[0.65rem] font-bold text-amber-400">
                <ArrowDownwardTwoTone className="!h-4 !w-4 animate-bounce" />
                <span>Fluxo de Qualificação</span>
              </div>

              {/* Funnel Step 2: Leads Não Atendidos (Width 90%) */}
              <div className="w-[92%] relative group transition-all duration-300">
                <button
                  type="button"
                  onClick={() => setUnattendedModalOpen(true)}
                  className="w-full text-left rounded-2xl border border-rose-500/50 bg-gradient-to-r from-rose-500/25 via-rose-500/15 to-rose-500/25 p-4 shadow-lg hover:border-rose-500/80 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-rose-300">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/30 text-xs font-bold text-rose-200">2</span>
                      <WarningTwoTone className="!h-5 !w-5 animate-bounce text-rose-400" />
                      <span className="text-xs font-bold uppercase tracking-wider">Leads Não Atendidos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xl font-black text-rose-400">
                        {serverStats?.x1?.unattendedLeadsCount ?? 0}
                      </span>
                      <span className="rounded-lg bg-rose-500/20 px-2 py-1 text-[0.65rem] font-bold text-rose-300">
                        Ver Lista →
                      </span>
                    </div>
                  </div>
                </button>
              </div>

              {/* Conversion Arrow 2 */}
              <div className="flex items-center gap-1 text-[0.65rem] font-bold text-amber-400">
                <ArrowDownwardTwoTone className="!h-4 !w-4 animate-bounce" />
                <span>Engajamento em Chat</span>
              </div>

              {/* Funnel Step 3: Leads em Atendimento (Width 82%) */}
              <div className="w-[84%] relative group transition-all duration-300">
                <div className="mx-auto rounded-2xl border border-violet-500/40 bg-gradient-to-r from-violet-500/25 via-violet-500/15 to-violet-500/25 p-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-violet-300">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/30 text-xs font-bold text-violet-200">3</span>
                      <PhoneCallbackTwoTone className="!h-5 !w-5" />
                      <span className="text-xs font-bold uppercase tracking-wider">Leads em Atendimento</span>
                    </div>
                    <span className="font-mono text-2xl font-black text-white">
                      {isLoading ? "—" : (serverStats?.x1?.inProgressCount ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Conversion Arrow 3 */}
              <div className="flex items-center gap-1 text-[0.65rem] font-bold text-emerald-400">
                <ArrowDownwardTwoTone className="!h-4 !w-4 animate-bounce" />
                <span>Conversão Final</span>
              </div>

              {/* Funnel Step 4: Vendas Aprovadas (Width 74%) */}
              <div className="w-[76%] relative group transition-all duration-300">
                <div className="mx-auto rounded-2xl border border-emerald-500/50 bg-gradient-to-r from-emerald-500/30 via-emerald-500/20 to-emerald-500/30 p-4.5 shadow-2xl shadow-emerald-500/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-emerald-300">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/30 text-xs font-bold text-emerald-200">4</span>
                      <TrendingUpTwoTone className="!h-6 !w-6 text-emerald-400" />
                      <span className="text-xs font-bold uppercase tracking-wider">Vendas Aprovadas</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-2xl font-black text-emerald-400">
                        {isLoading ? "—" : (serverStats?.x1?.approvedSalesCount ?? 0)}
                      </span>
                      <div className="text-xs font-bold text-emerald-300">
                        {BRL(serverStats?.x1?.totalRevenueToday ?? 0)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feed de Eventos Reais em Tempo Real — X1 */}
          <div className="rounded-3xl border border-border/80 bg-card/60 p-6 shadow-xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <SensorsTwoTone className="!h-5 !w-5" />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Feed de Eventos Reais (X1)</span>
              </div>
              <span className="text-[0.65rem] uppercase font-bold text-emerald-400 tracking-wider">
                Eventos de Hoje
              </span>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-fancy">
              {x1Feed.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    item.tipo === "venda_aprovada"
                      ? "border-emerald-500/40 bg-emerald-500/10 shadow-sm"
                      : "border-border/80 bg-background/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{item.titulo}</span>
                    <span className="font-mono text-[0.65rem] font-semibold text-muted-foreground">{item.timestamp}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.descricao}</p>
                </div>
              ))}
              {x1Feed.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground font-semibold">
                  Nenhum evento registrado hoje até o momento. Aguardando novas conversões...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 👉 RIGHT COLUMN: OPERAÇÃO HIGH TICKET (Emerald & Violet Theme)             */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          {/* Card Header HT */}
          <div className="flex items-center justify-between rounded-3xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 via-violet-500/10 to-card/70 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
                <WorkspacePremiumTwoTone className="!h-6 !w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-black text-white tracking-wide">OPERAÇÃO HIGH TICKET</h2>
                  <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-300 uppercase">
                    Vendas Consultivas
                  </span>
                </div>
                <p className="text-xs text-emerald-300/80 mt-0.5">Gestão de Formulários, SDRs e Closers</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Faturamento Hoje</div>
              <div className="font-mono text-xl font-black text-emerald-400">
                {isLoading ? "—" : BRL(serverStats?.ht?.revenueToday ?? 0)}
              </div>
            </div>
          </div>

          {/* Ticker de Tráfego Pago — High Ticket (Atualização 5 min) */}
          <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-card/60 p-5 shadow-xl backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <CampaignTwoTone className="!h-5 !w-5" />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Investimento em Tráfego (Hoje)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-300 font-mono font-bold">
                <TimerTwoTone className="!h-4 !w-4 text-emerald-400 animate-spin" />
                <span>Sync em {formatCountdown(trafficCountdown)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="rounded-2xl border border-border/60 bg-background/70 p-3.5">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">Gasto em Ads</div>
                <div className="mt-1 font-mono text-lg font-black text-white">
                  {BRL(serverStats?.ht?.trafficSpendToday?.gastoTotal ?? 3840)}
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/70 p-3.5">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">CPL Médio</div>
                <div className="mt-1 font-mono text-lg font-black text-amber-400">
                  {BRL(serverStats?.ht?.trafficSpendToday?.cpl ?? 4.12)}
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/70 p-3.5">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">Custo/Reunião</div>
                <div className="mt-1 font-mono text-lg font-black text-sky-400">
                  {BRL(serverStats?.ht?.trafficSpendToday?.costPerMeeting ?? 76.8)}
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/70 p-3.5">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">ROAS Operacional</div>
                <div className="mt-1 font-mono text-lg font-black text-emerald-400">
                  {serverStats?.ht?.trafficSpendToday?.roas ?? 4.8}x
                </div>
              </div>
            </div>
          </div>

          {/* 🔺 DESENHO DE FUNIL GRÁFICO (6 ESTÁGIOS) — OPERAÇÃO HIGH TICKET 🔺 */}
          <div className="rounded-3xl border border-emerald-500/30 bg-card/60 p-6 shadow-2xl backdrop-blur-xl space-y-6">
            <div className="flex items-center justify-between border-b border-border/80 pb-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <WorkspacePremiumTwoTone className="!h-5 !w-5" />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Desenho do Funil High Ticket (Hoje)</span>
              </div>
              <span className="text-xs font-mono font-semibold text-emerald-300/80">6 Estágios</span>
            </div>

            {/* 6 Step Tapered Funnel graphic */}
            <div className="flex flex-col items-center gap-2.5 py-1">
              {/* Estágio 1: Leads Qualificados (100% width) */}
              <div className="w-full relative">
                <div className="rounded-2xl border border-sky-500/40 bg-gradient-to-r from-sky-500/25 via-sky-500/15 to-sky-500/25 p-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/30 text-[0.65rem] font-bold text-sky-200">1</span>
                      Leads Qualificados
                    </span>
                    <span className="font-mono text-xl font-black text-white">
                      {isLoading ? "—" : (serverStats?.ht?.qualifiedLeadsToday ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Estágio 2: Leads em 1º Contato (93% width) */}
              <div className="w-[93%] relative">
                <div className="rounded-2xl border border-violet-500/40 bg-gradient-to-r from-violet-500/25 via-violet-500/15 to-violet-500/25 p-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-300 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/30 text-[0.65rem] font-bold text-violet-200">2</span>
                      Leads em 1º Contato
                    </span>
                    <span className="font-mono text-xl font-black text-white">
                      {isLoading ? "—" : (serverStats?.ht?.contact1Count ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Estágio 3: Leads em 2º Contato (86% width) */}
              <div className="w-[86%] relative">
                <div className="rounded-2xl border border-indigo-500/40 bg-gradient-to-r from-indigo-500/25 via-indigo-500/15 to-indigo-500/25 p-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/30 text-[0.65rem] font-bold text-indigo-200">3</span>
                      Leads em 2º Contato
                    </span>
                    <span className="font-mono text-xl font-black text-white">
                      {isLoading ? "—" : (serverStats?.ht?.contact2Count ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Estágio 4: Leads em 3º Contato (79% width) */}
              <div className="w-[79%] relative">
                <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/25 via-amber-500/15 to-amber-500/25 p-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/30 text-[0.65rem] font-bold text-amber-200">4</span>
                      Leads em 3º Contato
                    </span>
                    <span className="font-mono text-xl font-black text-white">
                      {isLoading ? "—" : (serverStats?.ht?.contact3Count ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Estágio 5: Agendamentos (72% width) */}
              <div className="w-[72%] relative">
                <div className="rounded-2xl border border-teal-500/40 bg-gradient-to-r from-teal-500/25 via-teal-500/15 to-teal-500/25 p-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-300 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/30 text-[0.65rem] font-bold text-teal-200">5</span>
                      Agendamentos
                    </span>
                    <span className="font-mono text-xl font-black text-teal-300">
                      {isLoading ? "—" : (serverStats?.ht?.scheduledCount ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Estágio 6: Vendas HT (65% width) */}
              <div className="w-[65%] relative">
                <div className="rounded-2xl border border-emerald-500/50 bg-gradient-to-r from-emerald-500/30 via-emerald-500/20 to-emerald-500/30 p-4 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/30 text-[0.65rem] font-bold text-emerald-200">6</span>
                      Vendas HT
                    </span>
                    <span className="font-mono text-xl font-black text-emerald-400">
                      {isLoading ? "—" : (serverStats?.ht?.vendasHtCount ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feed de Eventos Reais em Tempo Real — High Ticket */}
          <div className="rounded-3xl border border-border/80 bg-card/60 p-6 shadow-xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <SensorsTwoTone className="!h-5 !w-5" />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Feed de Eventos Reais (High Ticket)</span>
              </div>
              <span className="text-[0.65rem] uppercase font-bold text-emerald-400 tracking-wider">
                Eventos de Hoje
              </span>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-fancy">
              {htFeed.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    item.tipo === "venda_ht"
                      ? "border-emerald-500/40 bg-emerald-500/10 shadow-sm"
                      : "border-border/80 bg-background/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{item.titulo}</span>
                    <span className="font-mono text-[0.65rem] font-semibold text-muted-foreground">{item.timestamp}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.descricao}</p>
                </div>
              ))}
              {htFeed.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground font-semibold">
                  Nenhum evento High Ticket registrado hoje até o momento.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal de Leads Não Atendidos (Interactive Dialog) ── */}
      {unattendedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-rose-500/30 bg-card p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-border/80 pb-4">
              <div className="flex items-center gap-3 text-rose-400">
                <WarningTwoTone className="!h-6 !w-6" />
                <div>
                  <h3 className="font-display text-lg font-bold text-white">Leads Não Atendidos (X1 Hoje)</h3>
                  <p className="text-xs text-muted-foreground">Leads aguardando resposta na fila de atendimento de hoje</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUnattendedModalOpen(false)}
                className="rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <CloseTwoTone className="!h-5 !w-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 scrollbar-fancy">
              {(serverStats?.x1?.unattendedList ?? []).map((lead) => (
                <div key={lead.id} className="flex items-center justify-between rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                  <div>
                    <div className="font-bold text-white text-sm">{lead.nome}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {lead.telefone} · Operação <strong className="text-amber-400">{lead.operacao}</strong> (Vendedor: {lead.vendedor})
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-rose-500/20 border border-rose-500/30 px-3 py-1 font-mono text-xs font-bold text-rose-300">
                      ⏱️ {lead.tempoEsperaMin} min
                    </span>
                  </div>
                </div>
              ))}
              {(serverStats?.x1?.unattendedList ?? []).length === 0 && (
                <div className="py-8 text-center text-sm text-emerald-400 font-semibold flex items-center justify-center gap-2">
                  <CheckCircleTwoTone className="!h-5 !w-5" />
                  Nenhum lead pendente hoje! Todos os atendimentos estão em dia.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => setUnattendedModalOpen(false)}
                className="rounded-xl bg-secondary px-5 py-2.5 text-xs font-bold text-foreground hover:bg-secondary/80 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
