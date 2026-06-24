import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Save, Send, KeyRound, Eye, EyeOff, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getMetaAdsConfig,
  saveMetaAdsConfig,
  sendMetaEvent,
} from "@/lib/meta-ads.functions";

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
  { name: "PageView", desc: "Visualização de página" },
  { name: "ViewContent", desc: "Visualização de conteúdo" },
  { name: "Lead", desc: "Lead capturado" },
  { name: "InitiateCheckout", desc: "Início de checkout" },
  { name: "Purchase", desc: "Compra realizada" },
  { name: "CompleteRegistration", desc: "Cadastro completo" },
];

function MetaAdsPage() {
  const qc = useQueryClient();
  const getCfg = useServerFn(getMetaAdsConfig);
  const saveCfg = useServerFn(saveMetaAdsConfig);
  const sendEv = useServerFn(sendMetaEvent);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["meta-ads-config"],
    queryFn: () => getCfg(),
  });

  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState("Purchase");
  const [eventValue, setEventValue] = useState("");
  const [eventCurrency, setEventCurrency] = useState("BRL");

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
    mutationFn: (vars: { eventName: string; value?: number; currency?: string; eventSourceUrl?: string }) =>
      sendEv({ data: vars }),
    onSuccess: (r) =>
      toast.success("Evento enviado!", {
        description: `${selectedEvent} → ${r.eventsReceived} recebido(s)`,
      }),
    onError: (e: any) => toast.error("Falha ao enviar evento", { description: e?.message }),
  });

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

  function handleSend() {
    sendMut.mutate({
      eventName: selectedEvent,
      value: eventValue ? Number(eventValue) : undefined,
      currency: eventCurrency,
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/15 p-2.5">
              <Activity className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Meta Ads</h1>
              <p className="text-sm text-muted-foreground">
                Pixel e Conversions API integrados ao backend.
              </p>
            </div>
          </div>
          {cfg?.hasToken && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              Token configurado
            </div>
          )}
        </div>

        {/* Config */}
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
                  <span className="ml-2 text-[10px] normal-case text-green-500">
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

        {/* Send Event */}
        <div className="rounded-2xl border border-border bg-card/50 p-6 backdrop-blur">
          <div className="mb-5 flex items-center gap-2">
            <Send className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Disparar evento</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Evento
              </label>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {EVENTS.map((ev) => (
                  <button
                    key={ev.name}
                    onClick={() => setSelectedEvent(ev.name)}
                    className={[
                      "rounded-lg border px-3 py-2.5 text-left text-sm transition",
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
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Valor (opcional)
              </label>
              <input
                type="number"
                value={eventValue}
                onChange={(e) => setEventValue(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Moeda
              </label>
              <input
                type="text"
                value={eventCurrency}
                onChange={(e) => setEventCurrency(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSend}
                disabled={sendMut.isPending || !cfg?.hasToken}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar evento
              </button>
            </div>
          </div>
          {!cfg?.hasToken && (
            <p className="mt-3 text-xs text-muted-foreground">
              Salve Pixel ID + Access Token primeiro pra liberar o disparo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
