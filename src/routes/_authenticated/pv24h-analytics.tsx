import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3, Loader2, RefreshCw, Save, KeyRound, Check, Settings,
  ChevronRight, TrendingUp, DollarSign, ShoppingCart, Percent, Wallet, Layers, Megaphone, ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getPv24hConfig, savePv24hToken, listPv24hAdAccounts, selectPv24hAdAccount,
  listPv24hCampaigns, listPv24hAdSets, listPv24hAds, getPv24hAccountSummary,
  togglePv24hStatus,
  type Pv24hCampaign, type Pv24hAdSet, type Pv24hAd, type Pv24hInsights,
} from "@/lib/pv24h.functions";

export const Route = createFileRoute("/_authenticated/pv24h-analytics")({
  head: () => ({ meta: [{ title: "Operação PV24H" }] }),
  component: PV24HAnalyticsPage,
});

const PRESETS = [
  { v: "today", label: "Hoje" },
  { v: "yesterday", label: "Ontem" },
  { v: "last_7d", label: "7 dias" },
  { v: "last_14d", label: "14 dias" },
  { v: "last_30d", label: "30 dias" },
  { v: "this_month", label: "Este mês" },
  { v: "maximum", label: "Máximo" },
] as const;
type Preset = (typeof PRESETS)[number]["v"];

const brl = (n: number) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => (n || 0).toLocaleString("pt-BR");
const pct = (n: number) => `${(n || 0).toFixed(2)}%`;

function Dot({ active }: { active: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-zinc-500"}`} />;
}

function Toggle({ active, onToggle, disabled }: { active: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${active ? "bg-emerald-500" : "bg-zinc-600"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${active ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

function MetricCells({ i }: { i: Pv24hInsights }) {
  return (
    <>
      <td className="px-3 py-3 text-right font-mono text-sm font-semibold">{brl(i.spend)}</td>
      <td className="px-3 py-3 text-right text-sm text-emerald-400">{brl(i.revenue)}</td>
      <td className="px-3 py-3 text-right text-sm">{num(i.purchases)}</td>
      <td className="px-3 py-3 text-right text-sm">{i.roas ? i.roas.toFixed(2) + "x" : "—"}</td>
      <td className="px-3 py-3 text-right text-sm">{i.purchases ? brl(i.cpa) : "—"}</td>
      <td className="px-3 py-3 text-right text-sm">{num(i.impressions)}</td>
      <td className="px-3 py-3 text-right text-sm">{num(i.clicks)}</td>
      <td className="px-3 py-3 text-right text-sm">{pct(i.ctr)}</td>
      <td className="px-3 py-3 text-right text-sm">{brl(i.cpc)}</td>
    </>
  );
}

function MetricHeaders() {
  return (
    <>
      <th className="px-3 py-2 text-right">Gasto</th>
      <th className="px-3 py-2 text-right">Faturamento</th>
      <th className="px-3 py-2 text-right">Vendas</th>
      <th className="px-3 py-2 text-right">ROAS</th>
      <th className="px-3 py-2 text-right">CPA</th>
      <th className="px-3 py-2 text-right">Impr.</th>
      <th className="px-3 py-2 text-right">Cliques</th>
      <th className="px-3 py-2 text-right">CTR</th>
      <th className="px-3 py-2 text-right">CPC</th>
    </>
  );
}

function Kpi({ icon, label, value, accent, sub }: { icon: React.ReactNode; label: string; value: string; accent?: string; sub?: string }) {
  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase tracking-[0.18em]">
          {icon}{label}
        </div>
        <div className={`text-2xl font-bold mt-2 tabular-nums ${accent || ""}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function PV24HAnalyticsPage() {
  const qc = useQueryClient();
  const getConfig = useServerFn(getPv24hConfig);
  const saveToken = useServerFn(savePv24hToken);
  const listAccounts = useServerFn(listPv24hAdAccounts);
  const selectAccount = useServerFn(selectPv24hAdAccount);
  const listCampaigns = useServerFn(listPv24hCampaigns);
  const listAdSetsFn = useServerFn(listPv24hAdSets);
  const listAdsFn = useServerFn(listPv24hAds);
  const getSummary = useServerFn(getPv24hAccountSummary);
  const toggleStatus = useServerFn(togglePv24hStatus);

  const [tokenInput, setTokenInput] = useState("");
  const [preset, setPreset] = useState<Preset>("last_7d");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<"campaigns" | "adsets" | "ads">("campaigns");
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [selectedAdsets, setSelectedAdsets] = useState<Set<string>>(new Set());

  const configQ = useQuery({
    queryKey: ["pv24h", "config"],
    queryFn: () => getConfig({}),
  });

  const accountsQ = useQuery({
    queryKey: ["pv24h", "accounts"],
    queryFn: () => listAccounts({}),
    enabled: !!configQ.data?.hasToken,
  });

  const cfg = configQ.data;
  const enabled = !!cfg?.hasToken && !!cfg?.adAccountId;

  const summaryQ = useQuery({
    queryKey: ["pv24h", "summary", preset],
    queryFn: () => getSummary({ data: { datePreset: preset } }),
    enabled,
  });

  const campaignsQ = useQuery({
    queryKey: ["pv24h", "campaigns", preset],
    queryFn: () => listCampaigns({ data: { datePreset: preset } }),
    enabled,
  });

  const adsetsQueries = useQueries({
    queries: Array.from(selectedCampaigns).map((cid) => ({
      queryKey: ["pv24h", "adsets", cid, preset],
      queryFn: () => listAdSetsFn({ data: { campaignId: cid, datePreset: preset } }),
      staleTime: 30_000,
    })),
  });

  const adsQueries = useQueries({
    queries: Array.from(selectedAdsets).map((aid) => ({
      queryKey: ["pv24h", "ads", aid, preset],
      queryFn: () => listAdsFn({ data: { adsetId: aid, datePreset: preset } }),
      staleTime: 30_000,
    })),
  });

  const campaigns = campaignsQ.data ?? [];
  const adsets = useMemo(() => adsetsQueries.flatMap((q) => (Array.isArray(q.data) ? q.data : [])) as Pv24hAdSet[], [adsetsQueries]);
  const ads = useMemo(() => adsQueries.flatMap((q) => (Array.isArray(q.data) ? q.data : [])) as Pv24hAd[], [adsQueries]);

  const saveTokenMut = useMutation({
    mutationFn: (t: string) => saveToken({ data: { accessToken: t } }),
    onSuccess: () => { toast.success("Token salvo"); setTokenInput(""); qc.invalidateQueries({ queryKey: ["pv24h"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Token inválido"),
  });

  const selectAccountMut = useMutation({
    mutationFn: (v: { id: string; name: string }) => selectAccount({ data: { adAccountId: v.id, adAccountName: v.name } }),
    onSuccess: () => { toast.success("Conta selecionada"); qc.invalidateQueries({ queryKey: ["pv24h"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; status: "ACTIVE" | "PAUSED" }) => toggleStatus({ data: v }),
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["pv24h"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const isConfigured = enabled;
  const showSettings = !isConfigured || settingsOpen;

  const toggleSet = (set: Set<string>, updater: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    updater(next);
  };

  const s = summaryQ.data;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-accent" />
          <div>
            <h1 className="text-2xl font-semibold">Operação PV24H</h1>
            {isConfigured && cfg?.adAccountName && (
              <p className="text-xs text-muted-foreground">Conta: <strong>{cfg.adAccountName}</strong></p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured && (
            <div className="flex items-center gap-1">
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
              <Button variant="outline" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["pv24h"] })} title="Atualizar">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
          {isConfigured && (
            <Button variant="outline" size="icon" onClick={() => setSettingsOpen((v) => !v)} title="Configurações">
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      {isConfigured && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi icon={<DollarSign className="h-4 w-4" />} label="Faturamento" value={brl(s?.revenue ?? 0)} accent="text-emerald-400" />
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Gasto" value={brl(s?.spend ?? 0)} />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Lucro" value={brl(s?.profit ?? 0)} accent={(s?.profit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
          <Kpi icon={<Percent className="h-4 w-4" />} label="ROI" value={pct(s?.roi ?? 0)} accent={(s?.roi ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
          <Kpi icon={<Percent className="h-4 w-4" />} label="ROAS" value={s?.roas ? `${s.roas.toFixed(2)}x` : "—"} />
          <Kpi icon={<ShoppingCart className="h-4 w-4" />} label="Vendas" value={num(s?.purchases ?? 0)} />
        </div>
      )}

      {/* Config */}
      {showSettings && (
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
                <Button onClick={() => tokenInput && saveTokenMut.mutate(tokenInput)} disabled={!tokenInput || saveTokenMut.isPending}>
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
                    <SelectValue placeholder={accountsQ.isLoading ? "Carregando contas..." : accountsQ.error ? "Erro" : "Selecione uma conta"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(accountsQ.data ?? []).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} — {a.currency} ({a.accountId})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {accountsQ.error && <p className="text-xs text-destructive">{(accountsQ.error as Error).message}</p>}
              </div>
            )}
            {isConfigured && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(false)}>Fechar</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs + Tables */}
      {isConfigured && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <TabBtn active={tab === "campaigns"} onClick={() => setTab("campaigns")} icon={<Megaphone className="h-4 w-4" />}>
                Campanhas
              </TabBtn>
              <TabBtn active={tab === "adsets"} onClick={() => setTab("adsets")} icon={<Layers className="h-4 w-4" />}>
                Conjuntos {selectedCampaigns.size > 0 && <span className="text-xs opacity-70">({selectedCampaigns.size})</span>}
              </TabBtn>
              <TabBtn active={tab === "ads"} onClick={() => setTab("ads")} icon={<ImageIcon className="h-4 w-4" />}>
                Anúncios {selectedAdsets.size > 0 && <span className="text-xs opacity-70">({selectedAdsets.size})</span>}
              </TabBtn>
            </div>
          </CardHeader>
          <CardContent>
            {tab === "campaigns" && (
              <Table
                loading={campaignsQ.isLoading}
                error={campaignsQ.error as Error | undefined}
                rows={campaigns}
                empty="Nenhuma campanha"
                renderRow={(c) => {
                  const active = c.effectiveStatus === "ACTIVE";
                  const checked = selectedCampaigns.has(c.id);
                  return (
                    <tr key={c.id} className={`border-t border-border/50 hover:bg-muted/20 ${checked ? "bg-accent/5" : ""}`}>
                      <td className="px-3 py-3">
                        <Checkbox checked={checked} onCheckedChange={() => toggleSet(selectedCampaigns, setSelectedCampaigns, c.id)} />
                      </td>
                      <td className="px-3 py-3"><Toggle active={active} onToggle={() => toggleMut.mutate({ id: c.id, status: active ? "PAUSED" : "ACTIVE" })} /></td>
                      <td className="px-3 py-3"><Dot active={active} /></td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.objective}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm">
                        {c.dailyBudget ? `${brl(c.dailyBudget)}/dia` : c.lifetimeBudget ? brl(c.lifetimeBudget) : "—"}
                      </td>
                      <MetricCells i={c.insights} />
                    </tr>
                  );
                }}
                headers={<>
                  <th className="w-8 px-3 py-2"></th>
                  <th className="w-14 px-3 py-2 text-left">On/Off</th>
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-right">Orçamento</th>
                  <MetricHeaders />
                </>}
              />
            )}

            {tab === "adsets" && (
              selectedCampaigns.size === 0 ? (
                <EmptyHint text="Selecione campanhas na aba anterior pra ver os conjuntos" />
              ) : (
                <Table
                  loading={adsetsQueries.some((q) => q.isLoading)}
                  error={adsetsQueries.find((q) => q.error)?.error as Error | undefined}
                  rows={adsets}
                  empty="Nenhum conjunto"
                  renderRow={(a) => {
                    const active = a.effectiveStatus === "ACTIVE";
                    const checked = selectedAdsets.has(a.id);
                    return (
                      <tr key={a.id} className={`border-t border-border/50 hover:bg-muted/20 ${checked ? "bg-accent/5" : ""}`}>
                        <td className="px-3 py-3">
                          <Checkbox checked={checked} onCheckedChange={() => toggleSet(selectedAdsets, setSelectedAdsets, a.id)} />
                        </td>
                        <td className="px-3 py-3"><Toggle active={active} onToggle={() => toggleMut.mutate({ id: a.id, status: active ? "PAUSED" : "ACTIVE" })} /></td>
                        <td className="px-3 py-3"><Dot active={active} /></td>
                        <td className="px-3 py-3 font-medium">{a.name}</td>
                        <td className="px-3 py-3 text-right font-mono text-sm">
                          {a.dailyBudget ? `${brl(a.dailyBudget)}/dia` : a.lifetimeBudget ? brl(a.lifetimeBudget) : "—"}
                        </td>
                        <MetricCells i={a.insights} />
                      </tr>
                    );
                  }}
                  headers={<>
                    <th className="w-8 px-3 py-2"></th>
                    <th className="w-14 px-3 py-2 text-left">On/Off</th>
                    <th className="w-8 px-3 py-2"></th>
                    <th className="px-3 py-2 text-left">Nome</th>
                    <th className="px-3 py-2 text-right">Orçamento</th>
                    <MetricHeaders />
                  </>}
                />
              )
            )}

            {tab === "ads" && (
              selectedAdsets.size === 0 ? (
                <EmptyHint text="Selecione conjuntos na aba anterior pra ver os anúncios" />
              ) : (
                <Table
                  loading={adsQueries.some((q) => q.isLoading)}
                  error={adsQueries.find((q) => q.error)?.error as Error | undefined}
                  rows={ads}
                  empty="Nenhum anúncio"
                  renderRow={(a) => {
                    const active = a.effectiveStatus === "ACTIVE";
                    return (
                      <tr key={a.id} className="border-t border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-3"><Toggle active={active} onToggle={() => toggleMut.mutate({ id: a.id, status: active ? "PAUSED" : "ACTIVE" })} /></td>
                        <td className="px-3 py-3"><Dot active={active} /></td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {a.thumbnail ? (
                              <img src={a.thumbnail} alt="" className="h-10 w-10 rounded object-cover border border-border/50" />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                            )}
                            <span className="font-medium">{a.name}</span>
                          </div>
                        </td>
                        <MetricCells i={a.insights} />
                      </tr>
                    );
                  }}
                  headers={<>
                    <th className="w-14 px-3 py-2 text-left">On/Off</th>
                    <th className="w-8 px-3 py-2"></th>
                    <th className="px-3 py-2 text-left">Anúncio</th>
                    <MetricHeaders />
                  </>}
                />
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
      }`}
    >
      {icon}{children}
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
      <ChevronRight className="h-4 w-4" />{text}
    </div>
  );
}

function Table<T>({ loading, error, rows, empty, renderRow, headers }: {
  loading: boolean; error?: Error; rows: T[]; empty: string;
  renderRow: (r: T) => React.ReactNode; headers: React.ReactNode;
}) {
  if (loading) return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;
  if (error) return <p className="py-8 text-sm text-destructive">{error.message}</p>;
  if (!rows.length) return <div className="py-12 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>{headers}</tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
