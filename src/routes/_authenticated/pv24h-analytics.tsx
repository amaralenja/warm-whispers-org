import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2, RefreshCw, Save, KeyRound, Check, Settings } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getPv24hConfig, savePv24hToken, listPv24hAdAccounts,
  selectPv24hAdAccount, listPv24hCampaigns, togglePv24hStatus,
} from "@/lib/pv24h.functions";

export const Route = createFileRoute("/_authenticated/pv24h-analytics")({
  head: () => ({ meta: [{ title: "Operação PV24H" }] }),
  component: PV24HAnalyticsPage,
});

const PRESETS = [
  { v: "today", label: "Hoje" },
  { v: "yesterday", label: "Ontem" },
  { v: "last_7d", label: "7 dias" },
  { v: "last_30d", label: "30 dias" },
  { v: "this_month", label: "Este mês" },
] as const;
type Preset = (typeof PRESETS)[number]["v"];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

function PV24HAnalyticsPage() {
  const qc = useQueryClient();
  const getConfig = useServerFn(getPv24hConfig);
  const saveToken = useServerFn(savePv24hToken);
  const listAccounts = useServerFn(listPv24hAdAccounts);
  const selectAccount = useServerFn(selectPv24hAdAccount);
  const listCampaigns = useServerFn(listPv24hCampaigns);
  const toggleStatus = useServerFn(togglePv24hStatus);

  const [tokenInput, setTokenInput] = useState("");
  const [preset, setPreset] = useState<Preset>("last_7d");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const configQ = useQuery({
    queryKey: ["pv24h", "config"],
    queryFn: () => getConfig({}),
  });

  const accountsQ = useQuery({
    queryKey: ["pv24h", "accounts"],
    queryFn: () => listAccounts({}),
    enabled: !!configQ.data?.hasToken,
  });

  const campaignsQ = useQuery({
    queryKey: ["pv24h", "campaigns", preset],
    queryFn: () => listCampaigns({ data: { datePreset: preset } }),
    enabled: !!configQ.data?.hasToken && !!configQ.data?.adAccountId,
  });

  const saveTokenMut = useMutation({
    mutationFn: (t: string) => saveToken({ data: { accessToken: t } }),
    onSuccess: () => {
      toast.success("Token salvo");
      setTokenInput("");
      qc.invalidateQueries({ queryKey: ["pv24h"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Token inválido"),
  });

  const selectAccountMut = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      selectAccount({ data: { adAccountId: v.id, adAccountName: v.name } }),
    onSuccess: () => {
      toast.success("Conta selecionada");
      qc.invalidateQueries({ queryKey: ["pv24h"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; status: "ACTIVE" | "PAUSED" }) => toggleStatus({ data: v }),
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["pv24h", "campaigns"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const cfg = configQ.data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-accent" />
        <h1 className="text-2xl font-semibold">Operação PV24H</h1>
      </div>

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Configuração Facebook Ads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Access Token</Label>
            {cfg?.hasToken && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" /> Token salvo: <code>{cfg.tokenPreview}</code>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="EAAG... (System User ou User Access Token com ads_management)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <Button
                onClick={() => tokenInput && saveTokenMut.mutate(tokenInput)}
                disabled={!tokenInput || saveTokenMut.isPending}
              >
                {saveTokenMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>

          {cfg?.hasToken && (
            <div className="space-y-2">
              <Label>Conta de anúncios</Label>
              <Select
                value={cfg.adAccountId ?? ""}
                onValueChange={(v) => {
                  const acc = (accountsQ.data ?? []).find((a: any) => a.id === v);
                  if (acc) selectAccountMut.mutate({ id: acc.id, name: acc.name });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    accountsQ.isLoading ? "Carregando contas..." :
                    accountsQ.error ? "Erro ao carregar" :
                    "Selecione uma conta"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {(accountsQ.data ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — {a.currency} ({a.accountId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accountsQ.error && (
                <p className="text-xs text-destructive">{(accountsQ.error as Error).message}</p>
              )}
              {cfg.adAccountName && (
                <p className="text-xs text-muted-foreground">Ativa: <strong>{cfg.adAccountName}</strong></p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaigns */}
      {cfg?.hasToken && cfg?.adAccountId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Campanhas</CardTitle>
            <div className="flex items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.v}
                  onClick={() => setPreset(p.v)}
                  className={`h-8 rounded-full px-3 text-xs font-medium ${
                    preset === p.v
                      ? "bg-accent text-accent-foreground"
                      : "border border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => qc.invalidateQueries({ queryKey: ["pv24h", "campaigns"] })}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {campaignsQ.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            )}
            {campaignsQ.error && (
              <p className="text-sm text-destructive">{(campaignsQ.error as Error).message}</p>
            )}
            {!campaignsQ.isLoading && !campaignsQ.error && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Nome</th>
                      <th className="px-3 py-2 text-right">Orçamento</th>
                      <th className="px-3 py-2 text-right">Gasto</th>
                      <th className="px-3 py-2 text-right">Cliques</th>
                      <th className="px-3 py-2 text-right">CTR</th>
                      <th className="px-3 py-2 text-right">CPC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(campaignsQ.data ?? []).map((c) => {
                      const active = c.effectiveStatus === "ACTIVE";
                      return (
                        <tr key={c.id}>
                          <td className="px-3 py-2">
                            <button
                              onClick={() =>
                                toggleMut.mutate({ id: c.id, status: active ? "PAUSED" : "ACTIVE" })
                              }
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                active ? "bg-emerald-500" : "bg-zinc-600"
                              }`}
                              title={active ? "Desativar" : "Ativar"}
                            >
                              <span
                                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                  active ? "translate-x-[18px]" : "translate-x-0.5"
                                }`}
                              />
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-muted-foreground">{c.objective}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {c.dailyBudget ? `${brl(c.dailyBudget)}/dia` : c.lifetimeBudget ? brl(c.lifetimeBudget) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{brl(c.spend)}</td>
                          <td className="px-3 py-2 text-right">{num(c.clicks)}</td>
                          <td className="px-3 py-2 text-right">{c.ctr.toFixed(2)}%</td>
                          <td className="px-3 py-2 text-right">{brl(c.cpc)}</td>
                        </tr>
                      );
                    })}
                    {(campaignsQ.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                          Nenhuma campanha encontrada
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
