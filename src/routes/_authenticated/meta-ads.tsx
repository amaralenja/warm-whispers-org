import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Save, Send, KeyRound, Eye, EyeOff, CheckCircle2, Loader2, Clock3, ShieldCheck, AlertCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import {
  getMetaAdsConfig,
  listMetaEventLogs,
  saveMetaAdsConfig,
  sendMetaEvent,
} from "@/lib/meta-ads.functions";

const QUIZ_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";
const quizClient = createClient(QUIZ_URL, QUIZ_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
});

type QuizLead = {
  id: string;
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
  instagram: string | null;
  faturamento: string | null;
  caixa_letra: string | null;
  lead_score: number | null;
  fbp: string | null;
  fbc: string | null;
};

export const Route = createFileRoute("/_authenticated/meta-ads")({
  head: () => ({
    meta: [
      { title: "Meta Ads — MULTIUM" },
      { name: "description", content: "Configure Pixel e Conversions API da Meta e dispare eventos." },
    ],
  }),
  component: MetaAdsPage,
});

const EVENTS = [
  { name: "Purchase", desc: "Venda fechada (com valor R$)", needsValue: true },
  { name: "ShowUp", desc: "Comparecimento na call", needsValue: false },
];

function getCookieValue(name: string) {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

function formatCurrency(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function MetaAdsPage() {
  const qc = useQueryClient();
  const getCfg = useServerFn(getMetaAdsConfig);
  const listLogs = useServerFn(listMetaEventLogs);
  const saveCfg = useServerFn(saveMetaAdsConfig);
  const sendEv = useServerFn(sendMetaEvent);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["meta-ads-config"],
    queryFn: () => getCfg(),
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["meta-ads-event-logs"],
    queryFn: () => listLogs({ data: { limit: 12 } }),
  });

  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState("Purchase");
  const [eventValue, setEventValue] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadFirstName, setLeadFirstName] = useState("");
  const [leadLastName, setLeadLastName] = useState("");
  const needsValue = EVENTS.find((e) => e.name === selectedEvent)?.needsValue ?? false;

  useEffect(() => {
    if (cfg) {
      setPixelId(cfg.pixelId);
      setTestEventCode(cfg.testEventCode);
    }
  }, [cfg]);

  const saveMut = useMutation({
    mutationFn: (vars: { pixelId: string; accessToken?: string; testEventCode?: string }) =>
      saveCfg({ data: vars }),
    onSuccess: () => {
      toast.success("Configuração salva no backend");
      setAccessToken("");
      qc.invalidateQueries({ queryKey: ["meta-ads-config"] });
    },
    onError: (e: any) => toast.error("Falha ao salvar", { description: e?.message }),
  });

  const sendMut = useMutation({
    mutationFn: (vars: {
      eventName: "Purchase" | "ShowUp";
      value?: number;
      currency?: "BRL";
      eventSourceUrl?: string;
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      fbp?: string;
      fbc?: string;
    }) =>
      sendEv({ data: vars }),
    onSuccess: (r) => {
      toast.success("Evento enviado!", {
        description: `${selectedEvent} → ${r.eventsReceived} recebido(s) • match ${r.matchQualityScore}/100`,
      });
      qc.invalidateQueries({ queryKey: ["meta-ads-event-logs"] });
    },
    onError: (e: any) => {
      toast.error("Falha ao enviar evento", { description: e?.message });
      qc.invalidateQueries({ queryKey: ["meta-ads-event-logs"] });
    },
  });

  const estimatedQuality = (() => {
    let score = 10;
    if (leadEmail.trim()) score += 28;
    if (leadPhone.trim()) score += 28;
    if (leadFirstName.trim()) score += 6;
    if (leadLastName.trim()) score += 6;
    if (typeof document !== "undefined" && getCookieValue("_fbp")) score += 8;
    if (typeof document !== "undefined" && getCookieValue("_fbc")) score += 8;
    score += 12;
    return Math.min(100, score);
  })();

  const qualityTone = estimatedQuality >= 80 ? "text-accent" : estimatedQuality >= 60 ? "text-foreground" : "text-muted-foreground";

  function clearLeadFields() {
    setLeadEmail("");
    setLeadPhone("");
    setLeadFirstName("");
    setLeadLastName("");
  }

  function handleSend() {
    if (needsValue && (!eventValue || Number(eventValue) <= 0)) {
      return toast.error("Informe o valor da venda em R$");
    }
    if (!leadEmail.trim() && !leadPhone.trim()) {
      return toast.error("Informe email ou telefone do lead pra Meta fazer match melhor");
    }
    sendMut.mutate({
      eventName: selectedEvent as "Purchase" | "ShowUp",
      value: needsValue ? Number(eventValue) : undefined,
      currency: needsValue ? "BRL" : undefined,
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      email: leadEmail.trim() || undefined,
      phone: leadPhone.trim() || undefined,
      firstName: leadFirstName.trim() || undefined,
      lastName: leadLastName.trim() || undefined,
      fbp: getCookieValue("_fbp"),
      fbc: getCookieValue("_fbc"),
    }, {
      onSuccess: () => {
        if (needsValue) setEventValue("");
        clearLeadFields();
      },
    });
  }

  function handleSave() {
    if (!pixelId.trim()) return toast.error("Pixel ID é obrigatório");
    if (!cfg?.hasToken && !accessToken.trim())
      return toast.error("Access Token é obrigatório na primeira vez");
    saveMut.mutate({
      pixelId: pixelId.trim(),
      accessToken: accessToken.trim() || undefined,
      testEventCode: testEventCode.trim(),
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/15 p-2.5">
              <Activity className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Meta Ads</h1>
              <p className="text-sm text-muted-foreground">
                Pixel, Conversions API, ShowUp e vendas em BRL com logs reais.
              </p>
            </div>
          </div>
          {cfg?.hasToken && (
            <div className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-1.5 text-sm text-accent">
              <CheckCircle2 className="h-4 w-4" />
              Token configurado
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card/50 p-6 backdrop-blur">
          <div className="mb-5 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Credenciais</h2>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pixel ID
              </label>
              <input
                type="text"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="123456789012345"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Access Token (Conversions API)
                {cfg?.hasToken && (
                  <span className="ml-2 text-[10px] normal-case text-accent">
                    salvo • deixe vazio pra manter
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder={cfg?.hasToken ? "••••••••••••• (clique e cole pra trocar)" : "EAAxxxxxxxxxxxxx..."}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Test Event Code (opcional)
              </label>
              <input
                type="text"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                placeholder="TEST12345"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar configuração
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-border bg-card/50 p-6 backdrop-blur">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-semibold">Disparar evento</h2>
              </div>
              <div className={`flex items-center gap-1.5 text-sm font-semibold ${qualityTone}`}>
                <ShieldCheck className="h-4 w-4" />
                Match {estimatedQuality}/100
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Evento
                </label>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {EVENTS.map((ev) => (
                    <button
                      key={ev.name}
                      onClick={() => setSelectedEvent(ev.name)}
                      className={[
                        "rounded-lg border px-4 py-3 text-left text-sm transition",
                        selectedEvent === ev.name
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-background hover:border-accent/50",
                      ].join(" ")}
                    >
                      <div className="font-semibold">{ev.name}</div>
                      <div className="text-xs text-muted-foreground">{ev.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {needsValue && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Valor da venda (BRL)
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      R$
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={eventValue}
                      onChange={(e) => setEventValue(e.target.value)}
                      placeholder="0,00"
                      className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-base font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Email do lead
                  </label>
                  <input
                    type="email"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="lead@email.com"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={leadFirstName}
                    onChange={(e) => setLeadFirstName(e.target.value)}
                    placeholder="Nome"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sobrenome
                  </label>
                  <input
                    type="text"
                    value={leadLastName}
                    onChange={(e) => setLeadLastName(e.target.value)}
                    placeholder="Sobrenome"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              </div>

              <button
                onClick={handleSend}
                disabled={sendMut.isPending || !cfg?.hasToken}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Disparar {selectedEvent}
                {needsValue && eventValue ? ` • R$ ${eventValue}` : ""}
              </button>
            </div>
            {!cfg?.hasToken && (
              <p className="mt-3 text-xs text-muted-foreground">
                Salve Pixel ID + Access Token primeiro pra liberar o disparo.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card/50 p-6 backdrop-blur">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-semibold">Últimos logs</h2>
              </div>
              {logsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="space-y-3">
              {logs.length === 0 && !logsLoading ? (
                <div className="rounded-lg border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
                  Nenhum evento enviado ainda.
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border bg-background/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {log.status === "success" ? (
                            <CheckCircle2 className="h-4 w-4 text-accent" />
                          ) : log.status === "error" ? (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          <span className="font-semibold">{log.eventName}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatDate(log.createdAt)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatCurrency(log.value)}</div>
                        <div className="text-xs text-muted-foreground">Match {log.matchQualityScore}/100</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Email: {log.hasEmail ? "hash enviado" : "—"}</span>
                      <span>Telefone: {log.hasPhone ? "hash enviado" : "—"}</span>
                      <span>Nome: {log.hasFirstName ? "hash enviado" : "—"}</span>
                      <span>Sobrenome: {log.hasLastName ? "hash enviado" : "—"}</span>
                      <span>Recebidos: {log.eventsReceived ?? "—"}</span>
                      <span>ID: {log.eventId.slice(0, 8)}…</span>
                    </div>
                    {log.errorMessage && <div className="mt-2 text-xs text-destructive">{log.errorMessage}</div>}
                    {log.fbtraceId && <div className="mt-2 text-[11px] text-muted-foreground">fbtrace: {log.fbtraceId}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
