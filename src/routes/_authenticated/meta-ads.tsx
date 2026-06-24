import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Save, Send, KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/meta-ads")({
  head: () => ({
    meta: [
      { title: "Meta Ads — MULTIUM" },
      { name: "description", content: "Configure Pixel e Conversions API da Meta e dispare eventos." },
    ],
  }),
  component: MetaAdsPage,
});

type MetaConfig = {
  pixelId: string;
  accessToken: string;
  testEventCode: string;
};

const STORAGE_KEY = "multium.meta_ads.config";

const EVENTS = [
  { name: "PageView", desc: "Visualização de página" },
  { name: "ViewContent", desc: "Visualização de conteúdo" },
  { name: "Lead", desc: "Lead capturado" },
  { name: "InitiateCheckout", desc: "Início de checkout" },
  { name: "Purchase", desc: "Compra realizada" },
  { name: "CompleteRegistration", desc: "Cadastro completo" },
];

function MetaAdsPage() {
  const [config, setConfig] = useState<MetaConfig>({ pixelId: "", accessToken: "", testEventCode: "" });
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState("Purchase");
  const [eventValue, setEventValue] = useState("");
  const [eventCurrency, setEventCurrency] = useState("BRL");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setConfig(JSON.parse(raw));
        setSaved(true);
      } catch {}
    }
  }, []);

  function handleSave() {
    if (!config.pixelId.trim()) {
      toast.error("Pixel ID é obrigatório");
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSaved(true);
    toast.success("Configuração salva", { description: "Pixel e API configurados localmente." });
  }

  async function handleSendTestEvent() {
    if (!config.pixelId || !config.accessToken) {
      toast.error("Configure Pixel ID e Access Token primeiro");
      return;
    }
    setSending(true);
    try {
      const payload = {
        data: [
          {
            event_name: selectedEvent,
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            event_source_url: window.location.href,
            user_data: {},
            custom_data: eventValue
              ? { value: Number(eventValue), currency: eventCurrency }
              : {},
          },
        ],
        ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
      };
      const url = `https://graph.facebook.com/v19.0/${config.pixelId}/events?access_token=${encodeURIComponent(config.accessToken)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error("Falha ao enviar evento", { description: json.error?.message ?? "Erro desconhecido" });
      } else {
        toast.success("Evento enviado!", { description: `${selectedEvent} → ${json.events_received ?? 1} recebido(s)` });
      }
    } catch (e: any) {
      toast.error("Erro de rede", { description: e?.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-accent/15 p-2.5">
                <Activity className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Meta Ads</h1>
                <p className="text-sm text-muted-foreground">
                  Configure seu Pixel e Conversions API para disparar eventos.
                </p>
              </div>
            </div>
          </div>
          {saved && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              Configurado
            </div>
          )}
        </div>

        {/* Config Card */}
        <div className="rounded-2xl border border-border bg-card/50 p-6 backdrop-blur">
          <div className="mb-5 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Credenciais</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pixel ID
              </label>
              <input
                type="text"
                value={config.pixelId}
                onChange={(e) => setConfig({ ...config, pixelId: e.target.value })}
                placeholder="123456789012345"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Access Token (Conversions API)
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={config.accessToken}
                  onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
                  placeholder="EAAxxxxxxxxxxxxx..."
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
                value={config.testEventCode}
                onChange={(e) => setConfig({ ...config, testEventCode: e.target.value })}
                placeholder="TEST12345"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
            >
              <Save className="h-4 w-4" />
              Salvar configuração
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            ⚠️ Por enquanto as credenciais ficam no navegador (localStorage). Em breve vamos mover pro backend com server functions seguras.
          </p>
        </div>

        {/* Send Event Card */}
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
                onClick={handleSendTestEvent}
                disabled={sending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {sending ? "Enviando..." : "Enviar evento"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
