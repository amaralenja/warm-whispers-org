import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Loader2, Save, ShieldAlert, ShieldCheck, Wifi, ImageDown,
  Settings2, QrCode, LogOut, RefreshCw, Copy, Link as LinkIcon,
  Webhook, KeyRound, Smartphone, Sparkles,
} from "lucide-react";
import {
  getUazConfig, saveUazConfig, testUazConnection, getUazProfilePic,
  getUazInstanceStatus, connectUazInstance, disconnectUazInstance,
} from "@/lib/uaz.functions";
import { getVendorSession } from "@/lib/vendor-session";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function SectionHeader({
  step, icon: Icon, title, subtitle, right,
}: {
  step: string; icon: any; title: string; subtitle?: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-gradient-to-br from-accent/20 to-transparent">
          <Icon className="h-4 w-4 text-accent" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Passo {step}
            </span>
          </div>
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

function AdminPage() {
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => { setIsAdmin(getVendorSession() === null); }, []);

  const getCfg = useServerFn(getUazConfig);
  const saveCfg = useServerFn(saveUazConfig);
  const testCfg = useServerFn(testUazConnection);
  const getPic = useServerFn(getUazProfilePic);
  const getStatus = useServerFn(getUazInstanceStatus);
  const connectInst = useServerFn(connectUazInstance);
  const disconnectInst = useServerFn(disconnectUazInstance);

  const statusQ = useQuery({
    queryKey: ["uaz-status"],
    queryFn: () => getStatus(),
    enabled: false,
  });

  const [pairPhone, setPairPhone] = useState("");
  const [qrData, setQrData] = useState<{ qrcode: string | null; paircode: string | null } | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    setQrData(null);
    try {
      const r = await connectInst({ data: { phone: pairPhone.trim() || undefined } });
      if (!r.ok) {
        toast.error(`Falha ${r.status}: ${r.raw.slice(0, 200)}`);
        return;
      }
      setQrData({ qrcode: r.qrcode, paircode: r.paircode });
      statusQ.refetch();
      toast.success(r.paircode ? `Pair code: ${r.paircode}` : "QR code gerado — escaneia aí");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setConnecting(false);
    }
  }

  async function handleRefreshStatus() {
    const r = await statusQ.refetch();
    if (r.data?.connected) {
      setQrData(null);
      toast.success("Conectado!");
    } else if (r.data?.qrcode) {
      setQrData({ qrcode: r.data.qrcode, paircode: r.data.paircode });
    }
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar essa instância do WhatsApp?")) return;
    try {
      await disconnectInst();
      setQrData(null);
      statusQ.refetch();
      toast.success("Desconectado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  useEffect(() => {
    if (!qrData?.qrcode && !qrData?.paircode) return;
    const int = setInterval(() => {
      statusQ.refetch().then((r) => {
        if (r.data?.connected) {
          setQrData(null);
          toast.success("WhatsApp conectado!");
        }
      });
    }, 4000);
    return () => clearInterval(int);
  }, [qrData?.qrcode, qrData?.paircode]);

  const cfgQ = useQuery({
    queryKey: ["uaz-config"],
    queryFn: () => getCfg(),
    enabled: isAdmin === true,
  });

  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; body: string } | null>(null);

  const [testPhone, setTestPhone] = useState("");
  const [picLoading, setPicLoading] = useState(false);
  const [picResult, setPicResult] = useState<{ image: string | null; name: string | null; error: string | null } | null>(null);

  useEffect(() => {
    if (cfgQ.data?.server_url) setServerUrl(cfgQ.data.server_url);
  }, [cfgQ.data?.server_url]);

  async function handleSave() {
    if (!serverUrl.trim()) return toast.error("Server URL é obrigatório");
    setSaving(true);
    try {
      await saveCfg({ data: { server_url: serverUrl.trim(), instance_token: token.trim() || undefined } });
      setToken("");
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["uaz-config"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testCfg();
      setTestResult(r);
      if (r.ok) toast.success("Conectado na UAZ");
      else toast.error(`Falha: HTTP ${r.status}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro no teste");
    } finally {
      setTesting(false);
    }
  }

  async function handleFetchPic() {
    const phone = testPhone.trim();
    if (!phone) return toast.error("Coloca um número (com DDI)");
    setPicLoading(true);
    setPicResult(null);
    try {
      const r = await getPic({ data: { phone } });
      setPicResult(r);
      if (r.error === "uaz_not_configured") toast.error("Configura UAZ primeiro");
      else if (!r.image && !r.name) toast.error("Nada encontrado");
      else toast.success("Foto carregada");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao buscar");
    } finally {
      setPicLoading(false);
    }
  }

  if (isAdmin === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ShieldAlert className="h-10 w-10 text-amber-400" />
            <h2 className="text-lg font-semibold">Área restrita</h2>
            <p className="text-sm text-muted-foreground">Só administradores.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cfg = cfgQ.data;
  const webhookUrl = `https://wvcwrozwnwdlpandwubp.supabase.co/functions/v1/uaz-webhook`;
  const wppConnected = !!statusQ.data?.connected;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-accent/10 via-background to-background">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3 w-3 text-accent" /> Painel interno
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
            Administração
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Integrações internas do sistema. A UAZ API é usada só pra puxar a foto de perfil do WhatsApp que a API oficial não expõe.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={cfg?.has_token
                ? "gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-300"}
            >
              {cfg?.has_token ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
              UAZ {cfg?.has_token ? "configurada" : "pendente"}
            </Badge>
            <Badge
              variant="outline"
              className={wppConnected
                ? "gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "gap-1.5 border-border bg-muted/40 text-muted-foreground"}
            >
              <Smartphone className="h-3 w-3" />
              WhatsApp {statusQ.data?.state ?? "desconhecido"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
        {/* Webhook */}
        <Card className="overflow-hidden border-border/60 bg-card/40 backdrop-blur">
          <CardContent className="space-y-4 pt-6">
            <SectionHeader
              step="01"
              icon={Webhook}
              title="Webhook da instância UAZ"
              subtitle="Cola essa URL no campo Webhook do painel da UAZ. Aceita POST, sem auth, sem CORS."
            />
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada"); }}
              >
                <Copy className="h-4 w-4" /> Copiar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Credenciais */}
        <Card className="overflow-hidden border-border/60 bg-card/40 backdrop-blur">
          <CardContent className="space-y-5 pt-6">
            <SectionHeader
              step="02"
              icon={KeyRound}
              title="Credenciais UAZ (uazapiGO)"
              subtitle="Server URL e token da instância. O token fica criptografado no banco."
              right={
                cfg?.has_token ? (
                  <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> ok
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-300">
                    <ShieldAlert className="h-3 w-3" /> pendente
                  </Badge>
                )
              }
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Server URL</Label>
                <Input
                  placeholder="https://SEU-SUBDOMINIO.uazapi.com"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Instance Token</Label>
                <Input
                  placeholder={cfg?.has_token ? `Atual: ${cfg.token_preview} — cola aqui pra substituir` : "Cole o token da instância"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  type="password"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
              <Button onClick={handleTest} disabled={testing} variant="outline" className="gap-2">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                Testar conexão
              </Button>
            </div>

            {testResult && (
              <div className="rounded-lg border border-border/60 bg-muted/30">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                    Resposta
                  </span>
                  <Badge
                    variant="outline"
                    className={testResult.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-300"}
                  >
                    HTTP {testResult.status} {testResult.ok ? "OK" : "FAIL"}
                  </Badge>
                </div>
                <pre className="max-h-48 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
                  {typeof testResult.body === "string" ? testResult.body : JSON.stringify(testResult.body, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conectar WhatsApp */}
        <Card className="overflow-hidden border-border/60 bg-card/40 backdrop-blur">
          <CardContent className="space-y-5 pt-6">
            <SectionHeader
              step="03"
              icon={Smartphone}
              title="Conectar WhatsApp"
              subtitle="Gera QR code ou pair code pra parear com o número da instância."
              right={
                statusQ.data && (
                  <Badge
                    variant="outline"
                    className={wppConnected
                      ? "gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "gap-1 border-amber-500/30 bg-amber-500/10 text-amber-300"}
                  >
                    {statusQ.data.state ?? "desconhecido"}
                  </Badge>
                )
              }
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="(opcional) DDI+DDD+número pra pair code, ex: 5511999999999"
                value={pairPhone}
                onChange={(e) => setPairPhone(e.target.value)}
                className="font-mono text-xs"
              />
              <Button onClick={handleConnect} disabled={connecting} className="gap-2">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Gerar QR / Pair
              </Button>
              <Button onClick={handleRefreshStatus} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" /> Status
              </Button>
              {wppConnected && (
                <Button onClick={handleDisconnect} variant="destructive" className="gap-2">
                  <LogOut className="h-4 w-4" /> Desconectar
                </Button>
              )}
            </div>

            {(qrData?.qrcode || qrData?.paircode) && (
              <div className="grid gap-4 md:grid-cols-2">
                {qrData?.paircode && (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-transparent p-6 text-center">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                      Pair code
                    </p>
                    <p className="mt-3 font-mono text-3xl font-bold tracking-[0.3em] text-accent">
                      {qrData.paircode}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      WhatsApp &gt; Aparelhos conectados &gt; Conectar com número
                    </p>
                  </div>
                )}
                {qrData?.qrcode && (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-white p-4">
                    <img
                      src={qrData.qrcode.startsWith("data:") ? qrData.qrcode : `data:image/png;base64,${qrData.qrcode}`}
                      alt="QR Code UAZ"
                      className="h-56 w-56 object-contain"
                    />
                    <p className="text-center text-[11px] text-neutral-600">
                      Escaneia no WhatsApp &gt; Aparelhos conectados
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              💡 Se der <b>401 invalid token</b>, o token da instância tá errado — confere no painel da UAZ e cola de novo acima.
            </div>
          </CardContent>
        </Card>

        {/* Testar foto */}
        <Card className="overflow-hidden border-border/60 bg-card/40 backdrop-blur">
          <CardContent className="space-y-5 pt-6">
            <SectionHeader
              step="04"
              icon={ImageDown}
              title="Testar busca de foto"
              subtitle="Valida se a UAZ tá puxando foto e nome pelo número informado."
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Ex: 5511999999999 (com DDI)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetchPic()}
                className="font-mono text-xs"
              />
              <Button onClick={handleFetchPic} disabled={picLoading} className="gap-2">
                {picLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
                Buscar foto
              </Button>
            </div>

            {picResult && (
              <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                {picResult.image ? (
                  <img
                    src={picResult.image}
                    alt={picResult.name ?? "perfil"}
                    className="h-20 w-20 rounded-full border-2 border-accent/30 object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-border text-xs text-muted-foreground">
                    sem foto
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div><span className="text-muted-foreground">Nome:</span> <b>{picResult.name ?? "—"}</b></div>
                  <div className="truncate text-xs text-muted-foreground">
                    <span>URL:</span> <span className="font-mono">{picResult.image ?? "—"}</span>
                  </div>
                  {picResult.error && (
                    <div className="text-xs text-rose-300">Erro: {picResult.error}</div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
