import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import SensorsTwoTone from "@mui/icons-material/SensorsTwoTone";
import RadioButtonCheckedTwoTone from "@mui/icons-material/RadioButtonCheckedTwoTone";
import ElectricBoltTwoTone from "@mui/icons-material/ElectricBoltTwoTone";
import WorkspacePremiumTwoTone from "@mui/icons-material/WorkspacePremiumTwoTone";
import WarningTwoTone from "@mui/icons-material/WarningTwoTone";
import TrendingUpTwoTone from "@mui/icons-material/TrendingUpTwoTone";
import ShoppingBagTwoTone from "@mui/icons-material/ShoppingBagTwoTone";
import HowToRegTwoTone from "@mui/icons-material/HowToRegTwoTone";
import EventAvailableTwoTone from "@mui/icons-material/EventAvailableTwoTone";
import MonetizationOnTwoTone from "@mui/icons-material/MonetizationOnTwoTone";
import CampaignTwoTone from "@mui/icons-material/CampaignTwoTone";
import NotificationsActiveTwoTone from "@mui/icons-material/NotificationsActiveTwoTone";
import FilterListTwoTone from "@mui/icons-material/FilterListTwoTone";
import RefreshTwoTone from "@mui/icons-material/RefreshTwoTone";
import CloseTwoTone from "@mui/icons-material/CloseTwoTone";
import PhoneCallbackTwoTone from "@mui/icons-material/PhoneCallbackTwoTone";
import CheckCircleTwoTone from "@mui/icons-material/CheckCircleTwoTone";
import TimerTwoTone from "@mui/icons-material/TimerTwoTone";

export const Route = createFileRoute("/_authenticated/live-monitoring")({
  head: () => ({ meta: [{ title: "Monitoramento ao Vivo — MULTIUM" }] }),
  component: LiveMonitoringPage,
});

type NotificationX1 = {
  id: string;
  timestamp: string;
  tipo: "lead_chegou" | "venda_aprovada" | "janela_fechou" | "atendimento_iniciado";
  titulo: string;
  descricao: string;
  operacao: string;
  valor?: number;
  vendedor?: string;
};

type NotificationHT = {
  id: string;
  timestamp: string;
  tipo: "lead_qualificado" | "reuniao_agendada" | "venda_ht" | "contato_sdr";
  titulo: string;
  descricao: string;
  sdr?: string;
  closer?: string;
  valor?: number;
  horario?: string;
};

type LeadNaoAtendido = {
  id: string;
  nome: string;
  telefone: string;
  operacao: string;
  vendedor: string;
  tempoEsperaMin: number;
};

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function LiveMonitoringPage() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unattendedModalOpen, setUnattendedModalOpen] = useState(false);
  const [trafficCountdown, setTrafficCountdown] = useState(300); // 5 min countdown
  const [trafficSpend, setTrafficSpend] = useState({
    gastoTotal: 3840,
    cpl: 4.12,
    costPerMeeting: 76.80,
    roas: 4.8,
  });

  // Mock initial X1 Notifications
  const [x1Feed, setX1Feed] = useState<NotificationX1[]>([
    {
      id: "x1-1",
      timestamp: "10:44:12",
      tipo: "venda_aprovada",
      titulo: "💰 Venda Aprovada R$ 297,00",
      descricao: "Venda efetuada por Lucas na Operação Gustavo",
      operacao: "Gustavo",
      valor: 297,
      vendedor: "Lucas",
    },
    {
      id: "x1-2",
      timestamp: "10:42:05",
      tipo: "lead_chegou",
      titulo: "📥 Novo Lead no Funil",
      descricao: "Lead Ricardo Silva (11 98765-4321) entrou na Operação Caio",
      operacao: "Caio",
    },
    {
      id: "x1-3",
      timestamp: "10:39:40",
      tipo: "janela_fechou",
      titulo: "⚠️ Janela Encerrada sem Atendimento",
      descricao: "Lead Mariana Souza ficou 24h sem resposta",
      operacao: "Jessica",
      vendedor: "Jessica",
    },
    {
      id: "x1-4",
      timestamp: "10:35:10",
      tipo: "atendimento_iniciado",
      titulo: "💬 Atendimento Iniciado",
      descricao: "Vendedor Matheus iniciou diálogo no WhatsApp #02",
      operacao: "Caio",
      vendedor: "Matheus",
    },
  ]);

  // Mock initial HT Notifications
  const [htFeed, setHtFeed] = useState<NotificationHT[]>([
    {
      id: "ht-1",
      timestamp: "10:43:55",
      tipo: "venda_ht",
      titulo: "🎉 Venda High Ticket Fechada!",
      descricao: "Closer Gabriel fechou contrato de R$ 5.000,00 com Lead Bruno Mendes",
      closer: "Gabriel",
      valor: 5000,
    },
    {
      id: "ht-2",
      timestamp: "10:41:20",
      tipo: "reuniao_agendada",
      titulo: "📅 Reunião Agendada",
      descricao: "SDR Matheus agendou reunião com Lead Ana Paula para o Closer Gabriel",
      sdr: "Matheus",
      closer: "Gabriel",
      horario: "15:30 Hoje",
    },
    {
      id: "ht-3",
      timestamp: "10:38:00",
      tipo: "lead_qualificado",
      titulo: "📋 Formulário HT Preenchido",
      descricao: "Lead Rodrigo Castro (Tech Corp · Fat > R$ 80k/mês) qualificado no Quiz",
    },
  ]);

  // Unattended leads mock list
  const [unattendedLeads, setUnattendedLeads] = useState<LeadNaoAtendido[]>([
    { id: "l1", nome: "Carlos Eduardo", telefone: "(11) 99812-4433", operacao: "Caio", vendedor: "Lucas", tempoEsperaMin: 18 },
    { id: "l2", nome: "Fernanda Lima", telefone: "(21) 98744-1122", operacao: "Jessica", vendedor: "Jessica", tempoEsperaMin: 26 },
    { id: "l3", nome: "Roberto Rocha", telefone: "(31) 99123-5566", operacao: "Gustavo", vendedor: "Rafael", tempoEsperaMin: 34 },
  ]);

  // 5 Min countdown timer for HT Traffic Spend auto refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setTrafficCountdown((prev) => {
        if (prev <= 1) {
          // Trigger traffic spend update tick
          setTrafficSpend((old) => ({
            gastoTotal: old.gastoTotal + Math.floor(Math.random() * 25 + 5),
            cpl: Number((old.cpl + (Math.random() * 0.1 - 0.05)).toFixed(2)),
            costPerMeeting: Number((old.costPerMeeting + (Math.random() * 1.5 - 0.75)).toFixed(2)),
            roas: Number((old.roas + (Math.random() * 0.1 - 0.05)).toFixed(1)),
          }));
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Live event ticker simulation
  useEffect(() => {
    const ticker = setInterval(() => {
      const isX1 = Math.random() > 0.4;
      const nowStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      if (isX1) {
        const events: NotificationX1[] = [
          {
            id: `x1-${Date.now()}`,
            timestamp: nowStr,
            tipo: "lead_chegou",
            titulo: "📥 Novo Lead no Funil X1",
            descricao: `Lead ${["Felipe", "Juliana", "Marcos", "Beatriz"][Math.floor(Math.random() * 4)]} chegou na Operação ${["Caio", "Gustavo", "Jessica"][Math.floor(Math.random() * 3)]}`,
            operacao: ["Caio", "Gustavo", "Jessica"][Math.floor(Math.random() * 3)],
          },
          {
            id: `x1-${Date.now()}`,
            timestamp: nowStr,
            tipo: "venda_aprovada",
            titulo: "💰 Venda Aprovada R$ 497,00",
            descricao: `Venda concluída por ${["Lucas", "Matheus", "Renata"][Math.floor(Math.random() * 3)]}`,
            operacao: ["Caio", "Gustavo"][Math.floor(Math.random() * 2)],
            valor: 497,
            vendedor: ["Lucas", "Matheus", "Renata"][Math.floor(Math.random() * 3)],
          },
        ];
        const evt = events[Math.floor(Math.random() * events.length)];
        setX1Feed((prev) => [evt, ...prev.slice(0, 15)]);
      } else {
        const eventsHT: NotificationHT[] = [
          {
            id: `ht-${Date.now()}`,
            timestamp: nowStr,
            tipo: "reuniao_agendada",
            titulo: "📅 Reunião Agendada",
            descricao: `SDR ${["Matheus", "Juliana"][Math.floor(Math.random() * 2)]} agendou reunião com Lead ${["Patricia", "Gustavo", "Henrique"][Math.floor(Math.random() * 3)]} para Closer Gabriel`,
            sdr: ["Matheus", "Juliana"][Math.floor(Math.random() * 2)],
            closer: "Gabriel",
            horario: "16:00 Hoje",
          },
          {
            id: `ht-${Date.now()}`,
            timestamp: nowStr,
            tipo: "lead_qualificado",
            titulo: "📋 Formulário HT Preenchido",
            descricao: `Lead ${["Vanessa B.", "Leandro M.", "Thiago S."][Math.floor(Math.random() * 3)]} qualificado no Quiz com faturamento declar. > R$ 60k`,
          },
        ];
        const evt = eventsHT[Math.floor(Math.random() * eventsHT.length)];
        setHtFeed((prev) => [evt, ...prev.slice(0, 15)]);
      }
    }, 12000);
    return () => clearInterval(ticker);
  }, []);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <main className="min-h-screen bg-[#090b0e] text-foreground p-6 md:p-8 space-y-8">
      {/* ── Top Header & Live Control Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <RadioButtonCheckedTwoTone className="!h-7 !w-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-black tracking-tight text-white md:text-3xl">
                Monitoramento ao VIVO
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-0.5 text-xs font-bold text-rose-400">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                AO VIVO
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Acompanhamento simultâneo em tempo real da Operação X1 e Operação High Ticket
            </p>
          </div>
        </div>

        {/* Live Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${
              soundEnabled
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-border/80 bg-card/60 text-muted-foreground"
            }`}
          >
            <NotificationsActiveTwoTone className="!h-4 !w-4" />
            <span>{soundEnabled ? "Sons Ativados" : "Som Mutado"}</span>
          </button>
        </div>
      </div>

      {/* ── Split Screen Container (Left X1 | Right High Ticket) ── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* ========================================================================= */}
        {/* 👈 LEFT COLUMN: OPERAÇÃO X1                                               */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          {/* Card Header X1 */}
          <div className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-card/60 p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <ElectricBoltTwoTone className="!h-6 !w-6" />
              </div>
              <div>
                <h2 className="font-display text-lg font-black text-white">OPERAÇÃO X1</h2>
                <p className="text-xs text-muted-foreground">Vendas rápidas e gestão de WhatsApp</p>
              </div>
            </div>
            <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-300">
              3 Operações Ativas
            </span>
          </div>

          {/* Funil Visual da Operação X1 */}
          <div className="rounded-3xl border border-border/80 bg-card/60 p-6 shadow-xl space-y-4 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                Funil da Operação X1
              </span>
              <span className="text-xs text-muted-foreground font-semibold">Hoje</span>
            </div>

            <div className="space-y-3">
              {/* Estágio 1: Leads que Chegaram */}
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 transition-all hover:border-sky-500/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sky-400">
                    <HowToRegTwoTone className="!h-5 !w-5" />
                    <span className="text-xs font-bold uppercase tracking-wider">Leads que Chegaram</span>
                  </div>
                  <span className="font-mono text-2xl font-black text-white">3.250</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-sky-500/20 text-xs">
                  <span className="rounded-lg bg-background/60 px-2.5 py-1 font-semibold text-muted-foreground">
                    Caio: <strong className="text-white">1.420</strong>
                  </span>
                  <span className="rounded-lg bg-background/60 px-2.5 py-1 font-semibold text-muted-foreground">
                    Gustavo: <strong className="text-white">980</strong>
                  </span>
                  <span className="rounded-lg bg-background/60 px-2.5 py-1 font-semibold text-muted-foreground">
                    Jessica: <strong className="text-white">850</strong>
                  </span>
                </div>
              </div>

              {/* Estágio 2: Leads Não Atendidos (Interactive Modal Trigger) */}
              <button
                type="button"
                onClick={() => setUnattendedModalOpen(true)}
                className="w-full text-left rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 transition-all hover:bg-rose-500/20 hover:border-rose-500/60 group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-400">
                    <WarningTwoTone className="!h-5 !w-5 animate-bounce" />
                    <span className="text-xs font-bold uppercase tracking-wider">Leads Não Atendidos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-black text-rose-400">{unattendedLeads.length}</span>
                    <span className="rounded-lg bg-rose-500/20 px-2 py-1 text-[0.65rem] font-bold text-rose-300 group-hover:bg-rose-500/40">
                      Ver Lista →
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-rose-300/80">
                  Clique para visualizar a lista detalhada dos leads aguardando resposta
                </p>
              </button>

              {/* Estágio 3: Leads em Atendimento */}
              <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-violet-400">
                    <PhoneCallbackTwoTone className="!h-5 !w-5" />
                    <span className="text-xs font-bold uppercase tracking-wider">Leads em Atendimento</span>
                  </div>
                  <span className="font-mono text-2xl font-black text-white">86</span>
                </div>
              </div>

              {/* Estágio 4: Vendas Aprovadas */}
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <TrendingUpTwoTone className="!h-5 !w-5" />
                    <span className="text-xs font-bold uppercase tracking-wider">Vendas Aprovadas</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-2xl font-black text-emerald-400">142</span>
                    <div className="text-xs font-bold text-emerald-300">{BRL(42174)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feed de Notificações ao Vivo — X1 */}
          <div className="rounded-3xl border border-border/80 bg-card/60 p-6 shadow-xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <SensorsTwoTone className="!h-5 !w-5" />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Feed de Eventos X1</span>
              </div>
              <span className="text-[0.65rem] uppercase font-bold text-muted-foreground tracking-wider">Tempo Real</span>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-fancy">
              {x1Feed.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    item.tipo === "venda_aprovada"
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : item.tipo === "janela_fechou"
                      ? "border-rose-500/40 bg-rose-500/10"
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
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 👉 RIGHT COLUMN: OPERAÇÃO HIGH TICKET                                     */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          {/* Card Header HT */}
          <div className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-card/60 p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <WorkspacePremiumTwoTone className="!h-6 !w-6" />
              </div>
              <div>
                <h2 className="font-display text-lg font-black text-white">OPERAÇÃO HIGH TICKET</h2>
                <p className="text-xs text-muted-foreground">Vendas consultivas, SDRs e Closers</p>
              </div>
            </div>
            <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-300">
              SDRs & Closers Operando
            </span>
          </div>

          {/* Ticker de Tráfego Pago — High Ticket (Atualização 5 min) */}
          <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-card/60 p-5 shadow-xl backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <CampaignTwoTone className="!h-5 !w-5" />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Tráfego Pago High Ticket</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-300 font-mono font-bold">
                <TimerTwoTone className="!h-4 !w-4 text-amber-400 animate-spin" />
                <span>Sync em {formatCountdown(trafficCountdown)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">Gasto em Ads</div>
                <div className="mt-1 font-mono text-lg font-black text-white">{BRL(trafficSpend.gastoTotal)}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">CPL Médio</div>
                <div className="mt-1 font-mono text-lg font-black text-amber-400">{BRL(trafficSpend.cpl)}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">Custo/Reunião</div>
                <div className="mt-1 font-mono text-lg font-black text-sky-400">{BRL(trafficSpend.costPerMeeting)}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">ROAS Operacional</div>
                <div className="mt-1 font-mono text-lg font-black text-emerald-400">{trafficSpend.roas}x</div>
              </div>
            </div>
          </div>

          {/* Funil Visual da Operação High Ticket (6 Estágios) */}
          <div className="rounded-3xl border border-border/80 bg-card/60 p-6 shadow-xl space-y-4 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                Funil de Vendas High Ticket
              </span>
              <span className="text-xs text-muted-foreground font-semibold">Hoje</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {/* Estágio 1 */}
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3.5">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-sky-400">Leads Qualificados</div>
                <div className="mt-2 font-mono text-2xl font-black text-white">124</div>
              </div>

              {/* Estágio 2 */}
              <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3.5">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-violet-400">Leads em 1º Contato</div>
                <div className="mt-2 font-mono text-2xl font-black text-white">82</div>
              </div>

              {/* Estágio 3 */}
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3.5">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-indigo-400">Leads em 2º Contato</div>
                <div className="mt-2 font-mono text-2xl font-black text-white">45</div>
              </div>

              {/* Estágio 4 */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-amber-400">Leads em 3º Contato</div>
                <div className="mt-2 font-mono text-2xl font-black text-white">28</div>
              </div>

              {/* Estágio 5 */}
              <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-3.5">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-teal-400">Agendamentos</div>
                <div className="mt-2 font-mono text-2xl font-black text-teal-300">18</div>
              </div>

              {/* Estágio 6 */}
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-emerald-400">Vendas HT</div>
                <div className="mt-2 font-mono text-2xl font-black text-emerald-400">7</div>
              </div>
            </div>
          </div>

          {/* Feed de Notificações ao Vivo — High Ticket */}
          <div className="rounded-3xl border border-border/80 bg-card/60 p-6 shadow-xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <SensorsTwoTone className="!h-5 !w-5" />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Feed de Eventos High Ticket</span>
              </div>
              <span className="text-[0.65rem] uppercase font-bold text-muted-foreground tracking-wider">Tempo Real</span>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-fancy">
              {htFeed.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    item.tipo === "venda_ht"
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : item.tipo === "reuniao_agendada"
                      ? "border-amber-500/40 bg-amber-500/10"
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
                  <h3 className="font-display text-lg font-bold text-white">Leads Não Atendidos (X1)</h3>
                  <p className="text-xs text-muted-foreground">Leads aguardando resposta na fila de atendimento</p>
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
              {unattendedLeads.map((lead) => (
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
                    <button
                      type="button"
                      onClick={() => {
                        setUnattendedLeads((prev) => prev.filter((l) => l.id !== lead.id));
                      }}
                      className="rounded-xl bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-colors"
                    >
                      Notificar Vendedor
                    </button>
                  </div>
                </div>
              ))}
              {unattendedLeads.length === 0 && (
                <div className="py-8 text-center text-sm text-emerald-400 font-semibold flex items-center justify-center gap-2">
                  <CheckCircleTwoTone className="!h-5 !w-5" />
                  Nenhum lead pendente! Todos os atendimentos estão em dia.
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
