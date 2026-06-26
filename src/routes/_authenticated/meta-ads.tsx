import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Activity, ChevronRight, Megaphone, Layers, ImageIcon,
  RefreshCw, Pencil, Loader2, Settings2,
  Eye, PlayCircle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listCampaigns, listAdSets, listAds,
  updateEntityStatus, updateAdSetBudget, updateCampaignBudget, getAdPreview,
  type Campaign, type AdSet, type Ad, type AdInsights, type AdPreview,
} from "@/lib/meta-ads-manager.functions";
import { getMetaAdsConfig, saveMetaAdsConfig } from "@/lib/meta-ads.functions";


export const Route = createFileRoute("/_authenticated/meta-ads")({
  component: MetaAdsManagerPage,
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

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${n.toFixed(2)}%`;

function StatusDot({ effective }: { effective: string }) {
  const active = effective === "ACTIVE";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-zinc-500"
      }`}
      title={effective}
    />
  );
}

function MetaToggle({
  active,
  onToggle,
  disabled,
}: {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={active ? "Desativar" : "Ativar"}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        active ? "bg-emerald-500" : "bg-zinc-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          active ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function MetricCells({ i }: { i: AdInsights }) {
  return (
    <>
      <td className="px-4 py-4 text-right font-mono text-sm font-semibold">{brl(i.spend)}</td>
      <td className="px-4 py-4 text-right text-sm">{num(i.results)}</td>
      <td className="px-4 py-4 text-right text-sm">{i.results ? brl(i.costPerResult) : "—"}</td>
      <td className="px-4 py-4 text-right text-sm">{num(i.impressions)}</td>
      <td className="px-4 py-4 text-right text-sm">{num(i.clicks)}</td>
      <td className="px-4 py-4 text-right text-sm">{pct(i.ctr)}</td>
      <td className="px-4 py-4 text-right text-sm">{brl(i.cpc)}</td>
      <td className="px-4 py-4 text-right text-sm">{brl(i.cpm)}</td>
    </>
  );
}

function MetricHeaders() {
  return (
    <>
      <th className="px-3 py-2 text-right">Gasto</th>
      <th className="px-3 py-2 text-right">Resultados</th>
      <th className="px-3 py-2 text-right">Custo/Result.</th>
      <th className="px-3 py-2 text-right">Impressões</th>
      <th className="px-3 py-2 text-right">Cliques</th>
      <th className="px-3 py-2 text-right">CTR</th>
      <th className="px-3 py-2 text-right">CPC</th>
      <th className="px-3 py-2 text-right">CPM</th>
    </>
  );
}

function MetaAdsManagerPage() {
  const [preset, setPreset] = useState<Preset>("last_7d");
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [selectedAdsets, setSelectedAdsets] = useState<Set<string>>(new Set());
  const [previewAd, setPreviewAd] = useState<Ad | null>(null);
  const [tab, setTab] = useState<"campaigns" | "adsets" | "ads">("campaigns");
  const [pixelOpen, setPixelOpen] = useState(false);


  const qc = useQueryClient();
  const listCampaignsFn = useServerFn(listCampaigns);
  const listAdSetsFn = useServerFn(listAdSets);
  const listAdsFn = useServerFn(listAds);
  const updateStatusFn = useServerFn(updateEntityStatus);
  const updateAdSetBudgetFn = useServerFn(updateAdSetBudget);
  const updateCampaignBudgetFn = useServerFn(updateCampaignBudget);
  const getAdPreviewFn = useServerFn(getAdPreview);

  const campaignsQ = useQuery({
    queryKey: ["meta-ads", "campaigns", preset],
    queryFn: () => listCampaignsFn({ data: { datePreset: preset } }),
    staleTime: 30_000,
  });

  const adsetsQueries = useQueries({
    queries: Array.from(selectedCampaigns).map((cid) => ({
      queryKey: ["meta-ads", "adsets", cid, preset],
      queryFn: () => listAdSetsFn({ data: { campaignId: cid, datePreset: preset } }),
      staleTime: 30_000,
    })),
  });

  const adsQueries = useQueries({
    queries: Array.from(selectedAdsets).map((aid) => ({
      queryKey: ["meta-ads", "ads", aid, preset],
      queryFn: () => listAdsFn({ data: { adsetId: aid, datePreset: preset } }),
      staleTime: 30_000,
    })),
  });

  const previewQ = useQuery({
    queryKey: ["meta-ads", "ad-preview", previewAd?.id],
    queryFn: () => getAdPreviewFn({ data: { adId: previewAd!.id } }),
    enabled: !!previewAd,
    staleTime: 5 * 60_000,
  });

  const campaigns = useMemo(
    () => (Array.isArray(campaignsQ.data) ? campaignsQ.data : []),
    [campaignsQ.data],
  );
  const adsetsLoading = adsetsQueries.some((q) => q.isLoading);
  const adsetsError = adsetsQueries.find((q) => q.error)?.error as Error | undefined;
  const adsets = useMemo(
    () => adsetsQueries.flatMap((q) => (Array.isArray(q.data) ? q.data : [])) as AdSet[],
    [adsetsQueries],
  );
  const adsLoading = adsQueries.some((q) => q.isLoading);
  const adsError = adsQueries.find((q) => q.error)?.error as Error | undefined;
  const ads = useMemo(
    () => adsQueries.flatMap((q) => (Array.isArray(q.data) ? q.data : [])) as Ad[],
    [adsQueries],
  );

  const toggleStatus = useMutation({
    mutationFn: (v: { id: string; status: "ACTIVE" | "PAUSED" }) =>
      updateStatusFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-ads"] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });

  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => {
        acc.spend += c.insights.spend;
        acc.results += c.insights.results;
        acc.clicks += c.insights.clicks;
        acc.impressions += c.insights.impressions;
        return acc;
      },
      { spend: 0, results: 0, clicks: 0, impressions: 0 },
    );
  }, [campaigns]);

  const [budgetEdit, setBudgetEdit] = useState<{
    kind: "campaign" | "adset"; id: string; value: string;
  } | null>(null);

  async function saveBudget() {
    if (!budgetEdit) return;
    const v = Number(budgetEdit.value.replace(",", "."));
    if (!v || v <= 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      if (budgetEdit.kind === "campaign") {
        await updateCampaignBudgetFn({ data: { id: budgetEdit.id, dailyBudget: v } });
      } else {
        await updateAdSetBudgetFn({ data: { id: budgetEdit.id, dailyBudget: v } });
      }
      toast.success("Orçamento atualizado");
      setBudgetEdit(null);
      qc.invalidateQueries({ queryKey: ["meta-ads"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar orçamento");
    }
  }

  function toggleCampaign(id: string) {
    setSelectedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setSelectedAdsets(new Set());
  }

  function toggleAdset(id: string) {
    setSelectedAdsets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearAll() {
    setSelectedCampaigns(new Set());
    setSelectedAdsets(new Set());
    setTab("campaigns");
  }

  return (
    <div className="space-y-5 p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-accent/15 p-2.5 text-accent">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gerenciador de Ads</h1>
            <p className="text-sm text-muted-foreground">
              Campanhas, conjuntos e anúncios direto da sua conta Meta.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPixelOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
          >
            <Settings2 className="h-4 w-4" /> Configurar Pixel
          </button>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["meta-ads"] })}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      {/* Period */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.v}
            onClick={() => setPreset(p.v)}
            className={`h-8 rounded-full px-3 text-xs font-medium transition ${
              preset === p.v
                ? "bg-accent text-accent-foreground shadow"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Gasto total", value: brl(totals.spend) },
          { label: "Resultados", value: num(totals.results) },
          { label: "Cliques", value: num(totals.clicks) },
          { label: "Impressões", value: num(totals.impressions) },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 p-5 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className="mt-2 text-2xl font-bold tracking-tight">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {([
          { v: "campaigns", label: "Campanhas", icon: Megaphone, disabled: false },
          { v: "adsets", label: `Conjuntos${selectedCampaigns.size ? ` (${selectedCampaigns.size})` : ""}`, icon: Layers, disabled: selectedCampaigns.size === 0 },
          { v: "ads", label: `Anúncios${selectedAdsets.size ? ` (${selectedAdsets.size})` : ""}`, icon: ImageIcon, disabled: selectedAdsets.size === 0 },
        ] as const).map((t) => (
          <button
            key={t.v}
            onClick={() => !t.disabled && setTab(t.v)}
            disabled={t.disabled}
            className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm transition ${
              tab === t.v
                ? "bg-accent text-accent-foreground"
                : t.disabled
                  ? "text-muted-foreground/40"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Breadcrumb sublevel */}
      {(selectedCampaigns.size > 0 || selectedAdsets.size > 0) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={clearAll} className="hover:text-foreground">
            Todas campanhas
          </button>
          {selectedCampaigns.size > 0 && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">
                {selectedCampaigns.size === 1
                  ? campaigns.find((c) => selectedCampaigns.has(c.id))?.name ?? "Campanha"
                  : `${selectedCampaigns.size} campanhas selecionadas`}
              </span>
            </>
          )}
          {selectedAdsets.size > 0 && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">
                {selectedAdsets.size === 1
                  ? adsets.find((a) => selectedAdsets.has(a.id))?.name ?? "Conjunto"
                  : `${selectedAdsets.size} conjuntos selecionados`}
              </span>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto scrollbar-fancy">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-36 px-3 py-2 text-left">Ações</th>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-right">Orçamento</th>
                <MetricHeaders />
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tab === "campaigns" &&
                (campaignsQ.isLoading ? (
                  <tr><td colSpan={12} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                ) : campaignsQ.error ? (
                  <tr><td colSpan={12} className="py-10 text-center text-destructive">{(campaignsQ.error as any)?.message}</td></tr>
                ) : !campaigns.length ? (
                  <tr><td colSpan={12} className="py-10 text-center text-muted-foreground">Nenhuma campanha encontrada</td></tr>
                ) : (
                  campaigns.map((c: Campaign) => (
                    <tr key={c.id} className={`group transition hover:bg-muted/30 ${selectedCampaigns.has(c.id) ? "bg-accent/5" : ""}`}>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedCampaigns.has(c.id)}
                            onCheckedChange={() => toggleCampaign(c.id)}
                            aria-label="Selecionar campanha"
                          />
                          <MetaToggle
                            active={c.status === "ACTIVE"}
                            disabled={toggleStatus.isPending}
                            onToggle={() => toggleStatus.mutate({ id: c.id, status: c.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => toggleCampaign(c.id)}
                          className="flex items-center gap-2 text-left font-medium hover:text-accent"
                        >
                          <StatusDot effective={c.effectiveStatus} />
                          <span className="line-clamp-1">{c.name}</span>
                        </button>
                        {c.objective && (
                          <div className="ml-4 text-[10px] uppercase tracking-wide text-muted-foreground">{c.objective}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {budgetEdit?.kind === "campaign" && budgetEdit.id === c.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              autoFocus
                              type="text"
                              value={budgetEdit.value}
                              onChange={(e) => setBudgetEdit({ ...budgetEdit, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") saveBudget(); if (e.key === "Escape") setBudgetEdit(null); }}
                              className="h-7 w-20 rounded border border-border bg-background px-2 text-right text-xs"
                            />
                            <button onClick={saveBudget} className="text-xs text-accent">OK</button>
                          </div>
                        ) : c.dailyBudget ? (
                          <button onClick={() => setBudgetEdit({ kind: "campaign", id: c.id, value: String(c.dailyBudget) })}
                            className="inline-flex items-center gap-1 text-xs hover:text-accent">
                            {brl(c.dailyBudget)}/dia <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                          </button>
                        ) : c.lifetimeBudget ? (
                          <span className="text-xs text-muted-foreground">{brl(c.lifetimeBudget)} total</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <MetricCells i={c.insights} />
                      <td className="px-3 py-3"></td>
                    </tr>
                  ))
                ))}

              {tab === "adsets" &&
                (adsetsQ.isLoading ? (
                  <tr><td colSpan={12} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                ) : adsetsQ.error ? (
                  <tr><td colSpan={12} className="py-10 text-center text-destructive text-xs">{(adsetsQ.error as any)?.message ?? "Erro ao carregar conjuntos"}</td></tr>
                ) : !adsets.length ? (
                  <tr><td colSpan={12} className="py-10 text-center text-muted-foreground">Nenhum conjunto</td></tr>
                ) : (
                  adsets.map((a: AdSet) => (
                    <tr key={a.id} className={`group transition hover:bg-muted/30 ${adsetId === a.id ? "bg-accent/5" : ""}`}>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2">
                          <MetaToggle
                            active={a.status === "ACTIVE"}
                            disabled={toggleStatus.isPending}
                            onToggle={() => toggleStatus.mutate({ id: a.id, status: a.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })}
                          />
                          <button
                            type="button"
                            onClick={() => selectAdset(a.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                          >
                            <MousePointerClick className="h-3.5 w-3.5" />
                            Selecionar
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => selectAdset(a.id)}
                          className="flex items-center gap-2 text-left font-medium hover:text-accent"
                        >
                          <StatusDot effective={a.effectiveStatus} />
                          <span className="line-clamp-1">{a.name}</span>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {budgetEdit?.kind === "adset" && budgetEdit.id === a.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <input autoFocus type="text" value={budgetEdit.value}
                              onChange={(e) => setBudgetEdit({ ...budgetEdit, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") saveBudget(); if (e.key === "Escape") setBudgetEdit(null); }}
                              className="h-7 w-20 rounded border border-border bg-background px-2 text-right text-xs" />
                            <button onClick={saveBudget} className="text-xs text-accent">OK</button>
                          </div>
                        ) : a.dailyBudget ? (
                          <button onClick={() => setBudgetEdit({ kind: "adset", id: a.id, value: String(a.dailyBudget) })}
                            className="inline-flex items-center gap-1 text-xs hover:text-accent">
                            {brl(a.dailyBudget)}/dia <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                          </button>
                        ) : a.lifetimeBudget ? (
                          <span className="text-xs text-muted-foreground">{brl(a.lifetimeBudget)} total</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <MetricCells i={a.insights} />
                      <td className="px-3 py-3"></td>
                    </tr>
                  ))
                ))}

              {tab === "ads" &&
                (adsQ.isLoading ? (
                  <tr><td colSpan={12} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                ) : adsQ.error ? (
                  <tr><td colSpan={12} className="py-10 text-center text-destructive text-xs">{(adsQ.error as any)?.message ?? "Erro ao carregar anúncios"}</td></tr>
                ) : !ads.length ? (
                  <tr><td colSpan={12} className="py-10 text-center text-muted-foreground">Nenhum anúncio</td></tr>
                ) : (
                  ads.map((a: Ad) => (
                    <tr key={a.id} className="group transition hover:bg-muted/30">
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2">
                          <MetaToggle
                            active={a.status === "ACTIVE"}
                            disabled={toggleStatus.isPending}
                            onToggle={() => toggleStatus.mutate({ id: a.id, status: a.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })}
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewAd(a)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => setPreviewAd(a)} className="flex items-center gap-3 text-left hover:text-accent">
                          {a.thumbnail ? (
                            <img src={a.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <StatusDot effective={a.effectiveStatus} />
                            <span className="line-clamp-1 font-medium">{a.name}</span>
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-muted-foreground">—</td>
                      <MetricCells i={a.insights} />
                      <td className="px-3 py-3"></td>
                    </tr>
                  ))
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <AdPreviewDialog
        ad={previewAd}
        preview={previewQ.data}
        isLoading={previewQ.isLoading || previewQ.isFetching}
        error={previewQ.error as Error | null}
        onOpenChange={(open) => !open && setPreviewAd(null)}
      />
      <PixelConfigDialog open={pixelOpen} onOpenChange={setPixelOpen} />
    </div>
  );
}

function PixelConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const getCfg = useServerFn(getMetaAdsConfig);
  const saveCfg = useServerFn(saveMetaAdsConfig);
  const qc = useQueryClient();
  const cfgQ = useQuery({
    queryKey: ["meta-ads-config"],
    queryFn: () => getCfg(),
    enabled: open,
  });
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");

  useEffect(() => {
    if (cfgQ.data) {
      setPixelId(cfgQ.data.pixelId ?? "");
      setTestEventCode(cfgQ.data.testEventCode ?? "");
      setAccessToken("");
    }
  }, [cfgQ.data]);

  const save = useMutation({
    mutationFn: () =>
      saveCfg({ data: { pixelId, accessToken: accessToken || undefined, testEventCode } }),
    onSuccess: () => {
      toast.success("Pixel salvo! Eventos de Purchase e ShowUp vão usar essa config.");
      qc.invalidateQueries({ queryKey: ["meta-ads-config"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-accent" /> Configurar Pixel
          </DialogTitle>
          <DialogDescription>
            Pixel da Meta usado pra mandar eventos de <strong>Purchase</strong> (Chase) e <strong>ShowUp</strong> via Conversions API.
          </DialogDescription>
        </DialogHeader>

        {cfgQ.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Pixel ID *</label>
              <Input
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="1234567890"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Access Token {cfgQ.data?.hasToken && <span className="text-emerald-500">(já configurado — preencha só se quiser trocar)</span>}
              </label>
              <Input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={cfgQ.data?.hasToken ? "•••••••••• (deixa vazio pra manter)" : "EAAG..."}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Test Event Code (opcional)</label>
              <Input
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                placeholder="TEST12345"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!pixelId || save.isPending || (cfgQ.isLoading)}
          >
            {save.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
            ) : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function AdPreviewDialog({
  ad,
  preview,
  isLoading,
  error,
  onOpenChange,
}: {
  ad: Ad | null;
  preview: AdPreview | undefined;
  isLoading: boolean;
  error: Error | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!ad} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-accent" />
            {ad?.name ?? "Preview do anúncio"}
          </DialogTitle>
          <DialogDescription>
            Abra o criativo do anúncio para conferir imagem, vídeo ou o preview oficial da Meta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-[520px] gap-0 md:grid-cols-[1fr_300px]">
          <div className="flex items-center justify-center bg-muted/30 p-4">
            {isLoading ? (
              <div className="text-center text-muted-foreground">
                <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin" />
                Carregando criativo...
              </div>
            ) : error ? (
              <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {error.message}
              </div>
            ) : preview?.videoUrl ? (
              <video
                controls
                playsInline
                poster={preview.thumbnailUrl ?? preview.imageUrl ?? undefined}
                className="max-h-[68vh] w-full rounded-lg bg-background object-contain shadow"
                src={preview.videoUrl}
              />
            ) : preview?.imageUrl ? (
              <img
                src={preview.imageUrl}
                alt={preview.name}
                className="max-h-[68vh] w-full rounded-lg object-contain shadow"
              />
            ) : preview?.previewHtml ? (
              <iframe
                title="Preview oficial da Meta"
                srcDoc={preview.previewHtml}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                className="h-[68vh] w-full rounded-lg border border-border bg-background"
              />
            ) : (
              <div className="text-center text-muted-foreground">
                <ImageIcon className="mx-auto mb-3 h-10 w-10" />
                Não foi possível carregar a mídia desse anúncio.
              </div>
            )}
          </div>

          <aside className="space-y-4 border-l border-border bg-card p-5">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Anúncio</div>
              <div className="mt-1 font-semibold leading-snug">{preview?.name ?? ad?.name ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Criativo</div>
              <div className="mt-1 text-sm text-muted-foreground">{preview?.creativeName ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Tipo exibido</div>
              <div className="mt-1 text-sm font-medium">
                {preview?.mediaType === "video" ? "Vídeo" : preview?.mediaType === "image" ? "Imagem" : preview?.mediaType === "preview" ? "Preview Meta" : "Indisponível"}
              </div>
            </div>
            {preview?.previewError && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                {preview.previewError}
              </div>
            )}
            {preview?.permalinkUrl && (
              <a
                href={preview.permalinkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-background text-sm hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4" /> Abrir na Meta
              </a>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
