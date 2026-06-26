import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, ChevronRight, Megaphone, Layers, ImageIcon,
  RefreshCw, Pencil, Loader2, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listCampaigns, listAdSets, listAds,
  updateEntityStatus, updateAdSetBudget, updateCampaignBudget,
  type Campaign, type AdSet, type Ad, type AdInsights,
} from "@/lib/meta-ads-manager.functions";

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
      <td className="px-3 py-3 text-right font-mono text-sm">{brl(i.spend)}</td>
      <td className="px-3 py-3 text-right text-sm">{num(i.results)}</td>
      <td className="px-3 py-3 text-right text-sm">{i.results ? brl(i.costPerResult) : "—"}</td>
      <td className="px-3 py-3 text-right text-sm">{num(i.impressions)}</td>
      <td className="px-3 py-3 text-right text-sm">{num(i.clicks)}</td>
      <td className="px-3 py-3 text-right text-sm">{pct(i.ctr)}</td>
      <td className="px-3 py-3 text-right text-sm">{brl(i.cpc)}</td>
      <td className="px-3 py-3 text-right text-sm">{brl(i.cpm)}</td>
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
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [adsetId, setAdsetId] = useState<string | null>(null);
  const [tab, setTab] = useState<"campaigns" | "adsets" | "ads">("campaigns");

  const qc = useQueryClient();
  const listCampaignsFn = useServerFn(listCampaigns);
  const listAdSetsFn = useServerFn(listAdSets);
  const listAdsFn = useServerFn(listAds);
  const updateStatusFn = useServerFn(updateEntityStatus);
  const updateAdSetBudgetFn = useServerFn(updateAdSetBudget);
  const updateCampaignBudgetFn = useServerFn(updateCampaignBudget);

  const campaignsQ = useQuery({
    queryKey: ["meta-ads", "campaigns", preset],
    queryFn: () => listCampaignsFn({ data: { datePreset: preset } }),
    staleTime: 30_000,
  });

  const adsetsQ = useQuery({
    queryKey: ["meta-ads", "adsets", campaignId, preset],
    queryFn: () => listAdSetsFn({ data: { campaignId: campaignId!, datePreset: preset } }),
    enabled: !!campaignId,
    staleTime: 30_000,
  });

  const adsQ = useQuery({
    queryKey: ["meta-ads", "ads", adsetId, preset],
    queryFn: () => listAdsFn({ data: { adsetId: adsetId!, datePreset: preset } }),
    enabled: !!adsetId,
    staleTime: 30_000,
  });

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
    const list = campaignsQ.data ?? [];
    return list.reduce(
      (acc, c) => {
        acc.spend += c.insights.spend;
        acc.results += c.insights.results;
        acc.clicks += c.insights.clicks;
        acc.impressions += c.insights.impressions;
        return acc;
      },
      { spend: 0, results: 0, clicks: 0, impressions: 0 },
    );
  }, [campaignsQ.data]);

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
          <Link
            to="/meta-ads/conversoes"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
          >
            <Settings2 className="h-4 w-4" /> Conversões API
          </Link>
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
          <div key={k.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-xl font-bold">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {([
          { v: "campaigns", label: "Campanhas", icon: Megaphone, disabled: false },
          { v: "adsets", label: "Conjuntos", icon: Layers, disabled: !campaignId },
          { v: "ads", label: "Anúncios", icon: ImageIcon, disabled: !adsetId },
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
      {(campaignId || adsetId) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={() => { setCampaignId(null); setAdsetId(null); setTab("campaigns"); }} className="hover:text-foreground">
            Todas campanhas
          </button>
          {campaignId && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">
                {campaignsQ.data?.find((c) => c.id === campaignId)?.name ?? "Campanha"}
              </span>
            </>
          )}
          {adsetId && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">
                {adsetsQ.data?.find((a) => a.id === adsetId)?.name ?? "Conjunto"}
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
                <th className="w-10 px-3 py-2"></th>
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
                ) : !campaignsQ.data?.length ? (
                  <tr><td colSpan={12} className="py-10 text-center text-muted-foreground">Nenhuma campanha encontrada</td></tr>
                ) : (
                  campaignsQ.data.map((c: Campaign) => (
                    <tr key={c.id} className={`group transition hover:bg-muted/30 ${campaignId === c.id ? "bg-accent/5" : ""}`}>
                      <td className="px-3 py-4">
                        <MetaToggle
                          active={c.status === "ACTIVE"}
                          disabled={toggleStatus.isPending}
                          onToggle={() => toggleStatus.mutate({ id: c.id, status: c.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => { setCampaignId(c.id); setAdsetId(null); setTab("adsets"); }}
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
                ) : !adsetsQ.data?.length ? (
                  <tr><td colSpan={12} className="py-10 text-center text-muted-foreground">Nenhum conjunto</td></tr>
                ) : (
                  adsetsQ.data.map((a: AdSet) => (
                    <tr key={a.id} className={`group transition hover:bg-muted/30 ${adsetId === a.id ? "bg-accent/5" : ""}`}>
                      <td className="px-3 py-4">
                        <MetaToggle
                          active={a.status === "ACTIVE"}
                          disabled={toggleStatus.isPending}
                          onToggle={() => toggleStatus.mutate({ id: a.id, status: a.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => { setAdsetId(a.id); setTab("ads"); }}
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
                ) : !adsQ.data?.length ? (
                  <tr><td colSpan={12} className="py-10 text-center text-muted-foreground">Nenhum anúncio</td></tr>
                ) : (
                  adsQ.data.map((a: Ad) => (
                    <tr key={a.id} className="group transition hover:bg-muted/30">
                      <td className="px-3 py-4">
                        <MetaToggle
                          active={a.status === "ACTIVE"}
                          disabled={toggleStatus.isPending}
                          onToggle={() => toggleStatus.mutate({ id: a.id, status: a.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
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
                        </div>
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
    </div>
  );
}
