import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, ShieldAlert, ShieldCheck, Wifi, ImageDown, Settings2, QrCode, LogOut, RefreshCw, Copy, Link as LinkIcon } from "lucide-react";
import {
  getUazConfig, saveUazConfig, testUazConnection, getUazProfilePic,
  getUazInstanceStatus, connectUazInstance, disconnectUazInstance,
} from "@/lib/uaz.functions";
import { getVendorSession } from "@/lib/vendor-session";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

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

  // Auto-poll enquanto tem QR na tela
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Settings2 className="h-6 w-6 text-accent" />
          Administração
        </h1>
        <p className="text-sm text-muted-foreground">
          Integrações internas. A UAZ API é usada só pra puxar foto de perfil do WhatsApp (a API oficial não expõe isso).
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <LinkIcon className="h-4 w-4" /> Webhook URL da instância UAZ
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Cola essa URL no campo <b>Webhook</b> da sua instância no painel da UAZ. Aceita POST, sem auth, sem CORS.
          </p>
          {(() => {
            const webhookUrl = `https://wvcwrozwnwdlpandwubp.supabase.co/functions/v1/uaz-webhook`;

            return (
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    toast.success("URL copiada");
                  }}
                >
                  <Copy className="h-4 w-4" /> Copiar
                </Button>
              </div>
            );
          })()}
        </CardContent>
      </Card>


      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              UAZ API (uazapiGO)
            </h2>
            {cfg?.has_token ? (
              <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> configurado
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-300">
                <ShieldAlert className="h-3 w-3" /> não configurado
              </Badge>
            )}
          </div>

          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Server URL</Label>
              <Input
                placeholder="https://SEU-SUBDOMINIO.uazapi.com"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                URL base da sua instância UAZ (sem barra no final).
              </p>
            </div>
            <div>
              <Label className="text-xs">Instance Token</Label>
              <Input
                placeholder={cfg?.has_token ? `Atual: ${cfg.token_preview} — cola aqui pra substituir` : "Cole o token da instância"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type="password"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Token da instância (header <code className="font-mono">token</code>). Fica salvo criptografado no banco.
              </p>
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
            <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px]">
              HTTP {testResult.status} {testResult.ok ? "OK" : "FAIL"}
              {"\n"}
              {typeof testResult.body === "string" ? testResult.body : JSON.stringify(testResult.body, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Conectar WhatsApp via QR / Pair code */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Conectar WhatsApp
            </h2>
            {statusQ.data && (
              <Badge
                variant="outline"
                className={
                  statusQ.data.connected
                    ? "gap-1 bg-emerald-500/10 text-emerald-300"
                    : "gap-1 bg-amber-500/10 text-amber-300"
                }
              >
                {statusQ.data.state ?? "desconhecido"}
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="(opcional) DDI+DDD+número pra pair code, ex: 5511999999999"
              value={pairPhone}
              onChange={(e) => setPairPhone(e.target.value)}
            />
            <Button onClick={handleConnect} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              Gerar QR / Pair code
            </Button>
            <Button onClick={handleRefreshStatus} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Status
            </Button>
            {statusQ.data?.connected && (
              <Button onClick={handleDisconnect} variant="destructive" className="gap-2">
                <LogOut className="h-4 w-4" /> Desconectar
              </Button>
            )}
          </div>

          {qrData?.paircode && (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-center">
              <p className="text-xs text-muted-foreground">Pair code (digita no WhatsApp &gt; Aparelhos conectados)</p>
              <p className="mt-1 font-mono text-2xl tracking-widest">{qrData.paircode}</p>
            </div>
          )}
          {qrData?.qrcode && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-white p-4">
              <img
                src={qrData.qrcode.startsWith("data:") ? qrData.qrcode : `data:image/png;base64,${qrData.qrcode}`}
                alt="QR Code UAZ"
                className="h-64 w-64 object-contain"
              />
              <p className="text-xs text-muted-foreground">Escaneia no WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Dica: se der <b>401 invalid token</b>, o token da instância está errado — verifica no painel da UAZ e cola de novo no campo acima.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Testar busca de foto
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Ex: 5511999999999 (com DDI)"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetchPic()}
            />
            <Button onClick={handleFetchPic} disabled={picLoading} className="gap-2">
              {picLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
              Buscar foto
            </Button>
          </div>

          {picResult && (
            <div className="flex items-center gap-4 rounded-md border border-border bg-muted/30 p-4">
              {picResult.image ? (
                <img
                  src={picResult.image}
                  alt={picResult.name ?? "perfil"}
                  className="h-20 w-20 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border text-xs text-muted-foreground">
                  sem foto
                </div>
              )}
              <div className="space-y-1 text-sm">
                <div><b>Nome:</b> {picResult.name ?? "—"}</div>
                <div className="break-all text-xs text-muted-foreground">
                  <b>URL:</b> {picResult.image ?? "—"}
                </div>
                {picResult.error && <div className="text-xs text-rose-300">Erro: {picResult.error}</div>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
