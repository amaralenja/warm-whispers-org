import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3, Loader2, RefreshCw, Save, KeyRound, Check, Settings,
  ChevronRight, TrendingUp, DollarSign, ShoppingCart, Percent, Wallet, Layers, Megaphone, ImageIcon,
  ShieldAlert, Copy, Webhook, Link, Tag, Globe, Search, Zap, CheckCircle2, ArrowUpRight, Filter,
  RotateCcw, CreditCard, AlertTriangle, FileJson, User, Mail, Phone, Code2, Eye
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getPv24hConfig, savePv24hToken, listPv24hAdAccounts, selectPv24hAdAccount,
  listPv24hCampaigns, listPv24hAdSets, listPv24hAds, getPv24hAccountSummary,
  togglePv24hStatus, listPv24hSales,
  type Pv24hCampaign, type Pv24hAdSet, type Pv24hAd, type Pv24hInsights, type Pv24hSale
} from "@/lib/pv24h.functions";
import { getVendorSession } from "@/lib/vendor-session";

export const Route = createFileRoute("/_authenticated/pv24h-analytics")({
  head: () => ({ meta: [{ title: "Operação PV24H" }] }),
  component: PV24HGate,
});

function PV24HGate() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => { setIsAdmin(getVendorSession() === null); }, []);

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
            <p className="text-sm text-muted-foreground">Só administradores acessam a Operação PV24H.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <PV24HAnalyticsPage />;
}

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
  const listSalesFn = useServerFn(listPv24hSales);

  const [tokenInput, setTokenInput] = useState("");
  const [preset, setPreset] = useState<Preset>("last_7d");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<"campaigns" | "adsets" | "ads" | "sales">("sales");
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [selectedAdsets, setSelectedAdsets] = useState<Set<string>>(new Set());

  // Webhook e Vendas da Cakto
  const [salesFilter, setSalesFilter] = useState<"todos" | "pago" | "organico">("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | "approved" | "refunded" | "chargeback" | "pix" | "abandon" | "refused">("todos");
  const [salesSearch, setSalesSearch] = useState("");
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [selectedSalePayload, setSelectedSalePayload] = useState<Pv24hSale | null>(null);

  const salesQ = useQuery({
    queryKey: ["pv24h", "sales"],
    queryFn: () => listSalesFn({}),
    refetchInterval: 15_000,
  });

  const salesList = salesQ.data ?? [];

  const salesStats = useMemo(() => {
    let totalRevenue = 0;
    let totalCount = salesList.length;

    let approvedRevenue = 0;
    let approvedCount = 0;
    let pagoApprovedRevenue = 0;
    let pagoApprovedCount = 0;
    let organicoApprovedRevenue = 0;
    let organicoApprovedCount = 0;

    let refundRevenue = 0;
    let refundCount = 0;
    let pagoRefundRevenue = 0;
    let pagoRefundCount = 0;
    let organicoRefundRevenue = 0;
    let organicoRefundCount = 0;

    let chargebackRevenue = 0;
    let chargebackCount = 0;

    let pixRevenue = 0;
    let pixCount = 0;

    let abandonRevenue = 0;
    let abandonCount = 0;

    for (const sale of salesList) {
      const st = (sale.status || sale.event || "").toLowerCase();
      const isApproved = st === "approved" || st.includes("paid") || st.includes("renew");
      const isRefund = st === "refunded" || st.includes("refund");
      const isChargeback = st === "chargeback" || st.includes("chargeback");
      const isPix = st === "pix_generated" || st.includes("pix");
      const isAbandon = st === "cart_abandonment" || st.includes("abandon");

      totalRevenue += sale.valor;

      if (isApproved) {
        approvedRevenue += sale.valor;
        approvedCount++;
        if (sale.origem === "pago") {
          pagoApprovedRevenue += sale.valor;
          pagoApprovedCount++;
        } else {
          organicoApprovedRevenue += sale.valor;
          organicoApprovedCount++;
        }
      } else if (isRefund) {
        refundRevenue += sale.valor;
        refundCount++;
        if (sale.origem === "pago") {
          pagoRefundRevenue += sale.valor;
          pagoRefundCount++;
        } else {
          organicoRefundRevenue += sale.valor;
          organicoRefundCount++;
        }
      } else if (isChargeback) {
        chargebackRevenue += sale.valor;
        chargebackCount++;
        if (sale.origem === "pago") {
          pagoRefundRevenue += sale.valor;
          pagoRefundCount++;
        } else {
          organicoRefundRevenue += sale.valor;
          organicoRefundCount++;
        }
      } else if (isPix) {
        pixRevenue += sale.valor;
        pixCount++;
      } else if (isAbandon) {
        abandonRevenue += sale.valor;
        abandonCount++;
      }
    }

    const ticketMedio = approvedCount > 0 ? approvedRevenue / approvedCount : 0;
    const pagoPct = approvedCount > 0 ? (pagoApprovedCount / approvedCount) * 100 : 0;
    const organicoPct = approvedCount > 0 ? (organicoApprovedCount / approvedCount) * 100 : 0;

    return {
      totalRevenue,
      totalCount,
      approvedRevenue,
      approvedCount,
      pagoApprovedRevenue,
      pagoApprovedCount,
      pagoPct,
      organicoApprovedRevenue,
      organicoApprovedCount,
      organicoPct,
      refundRevenue,
      refundCount,
      pagoRefundRevenue,
      pagoRefundCount,
      organicoRefundRevenue,
      organicoRefundCount,
      chargebackRevenue,
      chargebackCount,
      pixRevenue,
      pixCount,
      abandonRevenue,
      abandonCount,
      ticketMedio,
    };
  }, [salesList]);

  const filteredSales = useMemo(() => {
    return salesList.filter((sale) => {
      if (salesFilter !== "todos" && sale.origem !== salesFilter) return false;

      const st = (sale.status || sale.event || "").toLowerCase();
      if (statusFilter === "approved" && !(st === "approved" || st.includes("paid") || st.includes("renew"))) return false;
      if (statusFilter === "refunded" && !(st === "refunded" || st.includes("refund"))) return false;
      if (statusFilter === "chargeback" && !(st === "chargeback" || st.includes("chargeback"))) return false;
      if (statusFilter === "pix" && !(st === "pix_generated" || st.includes("pix"))) return false;
      if (statusFilter === "abandon" && !(st === "cart_abandonment" || st.includes("abandon"))) return false;
      if (statusFilter === "refused" && !(st === "refused" || st.includes("cancel") || st.includes("refus"))) return false;

      if (salesSearch.trim()) {
        const q = salesSearch.toLowerCase();
        const haystack = `${sale.cliente_nome ?? ""} ${sale.cliente_email ?? ""} ${sale.cliente_telefone ?? ""} ${sale.transaction_id ?? ""} ${sale.utm_source ?? ""} ${sale.utm_campaign ?? ""} ${sale.status ?? ""} ${sale.event ?? ""} ${sale.produto_nome ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [salesList, salesFilter, statusFilter, salesSearch]);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/hooks/pv24h-cakto`
    : "https://seu-dominio.com/api/public/hooks/pv24h-cakto";

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    toast.success("Link do Webhook do Supabase/PV24H copiado!");
    setTimeout(() => setCopiedWebhook(false), 3000);
  };

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

      {/* Webhook Cakto Banner */}
      <Card className="border-accent/40 bg-gradient-to-r from-accent/10 via-card to-card">
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0">
                <Webhook className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  Webhook de Vendas Cakto (Supabase)
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cole este link na Cakto em <strong>Webhooks de Checkout</strong>. As vendas com UTM serão classificadas em <strong>Tráfego Pago</strong> e as sem UTM em <strong>Orgânica</strong>.
                </p>
              </div>
            </div>
            <Button
              onClick={handleCopyWebhook}
              className={`shrink-0 gap-2 ${copiedWebhook ? "bg-emerald-600 text-white" : "bg-accent text-accent-foreground hover:bg-accent/90"}`}
            >
              {copiedWebhook ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedWebhook ? "Copiado!" : "Copiar Link do Webhook"}
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Input
              readOnly
              value={webhookUrl}
              className="font-mono text-xs bg-background/80 border-accent/30 selection:bg-accent selection:text-accent-foreground"
            />
          </div>
        </CardContent>
      </Card>

      {/* KPIs de Vendas e Eventos Cakto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-border/50 bg-card/60 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-emerald-400" /> Aprovadas
              </span>
              <Badge variant="secondary" className="text-[10px]">{salesStats.approvedCount} vendas</Badge>
            </div>
            <div className="text-2xl font-bold mt-2 font-mono text-emerald-400">
              {brl(salesStats.approvedRevenue)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Ticket Médio: <strong className="text-foreground">{brl(salesStats.ticketMedio)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border-violet-500/30 bg-violet-500/5 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                <Megaphone className="h-4 w-4 text-violet-400" /> Tráfego Pago
              </span>
              <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 text-[10px]">
                {salesStats.pagoPct.toFixed(0)}%
              </Badge>
            </div>
            <div className="text-2xl font-bold mt-2 font-mono text-violet-300">
              {brl(salesStats.pagoApprovedRevenue)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              <strong className="text-violet-200">{salesStats.pagoApprovedCount}</strong> vendas com UTMs
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-emerald-400" /> Orgânico
              </span>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                {salesStats.organicoPct.toFixed(0)}%
              </Badge>
            </div>
            <div className="text-2xl font-bold mt-2 font-mono text-emerald-300">
              {brl(salesStats.organicoApprovedRevenue)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              <strong className="text-emerald-200">{salesStats.organicoApprovedCount}</strong> vendas diretas
            </div>
          </CardContent>
        </Card>

        {/* Card Reembolso & Chargeback */}
        <Card className="border-rose-500/30 bg-rose-500/5 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <RotateCcw className="h-4 w-4 text-rose-400" /> Reembolso / Chargeback
              </span>
              <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px]">
                {salesStats.refundCount + salesStats.chargebackCount} estornos
              </Badge>
            </div>
            <div className="text-2xl font-bold mt-2 font-mono text-rose-400">
              {brl(salesStats.refundRevenue + salesStats.chargebackRevenue)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 flex justify-between">
              <span>Pago: <strong className="text-rose-300">{brl(salesStats.pagoRefundRevenue)}</strong></span>
              <span>Org: <strong className="text-rose-300">{brl(salesStats.organicoRefundRevenue)}</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* Card PIX & Abandono */}
        <Card className="border-amber-500/30 bg-amber-500/5 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-400" /> PIX & Abandonos
              </span>
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                {salesStats.pixCount + salesStats.abandonCount} potenciais
              </Badge>
            </div>
            <div className="text-2xl font-bold mt-2 font-mono text-amber-300">
              {brl(salesStats.pixRevenue + salesStats.abandonRevenue)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              PIX: <strong>{salesStats.pixCount}</strong> · Abandonos: <strong>{salesStats.abandonCount}</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Meta Ads KPIs */}
      {isConfigured && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi icon={<DollarSign className="h-4 w-4" />} label="Meta Faturam." value={brl(s?.revenue ?? 0)} accent="text-emerald-400" />
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Meta Gasto" value={brl(s?.spend ?? 0)} />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Lucro Meta" value={brl(s?.profit ?? 0)} accent={(s?.profit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
          <Kpi icon={<Percent className="h-4 w-4" />} label="ROI Meta" value={pct(s?.roi ?? 0)} accent={(s?.roi ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
          <Kpi icon={<Percent className="h-4 w-4" />} label="ROAS Meta" value={s?.roas ? `${s.roas.toFixed(2)}x` : "—"} />
          <Kpi icon={<ShoppingCart className="h-4 w-4" />} label="Vendas Meta" value={num(s?.purchases ?? 0)} />
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
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
          <div className="flex items-center gap-1 overflow-x-auto">
            <TabBtn active={tab === "sales"} onClick={() => setTab("sales")} icon={<ShoppingCart className="h-4 w-4" />}>
              Eventos & Vendas Cakto ({salesList.length})
            </TabBtn>
            {isConfigured && (
              <>
                <TabBtn active={tab === "campaigns"} onClick={() => setTab("campaigns")} icon={<Megaphone className="h-4 w-4" />}>
                  Campanhas
                </TabBtn>
                <TabBtn active={tab === "adsets"} onClick={() => setTab("adsets")} icon={<Layers className="h-4 w-4" />}>
                  Conjuntos {selectedCampaigns.size > 0 && <span className="text-xs opacity-70">({selectedCampaigns.size})</span>}
                </TabBtn>
                <TabBtn active={tab === "ads"} onClick={() => setTab("ads")} icon={<ImageIcon className="h-4 w-4" />}>
                  Anúncios {selectedAdsets.size > 0 && <span className="text-xs opacity-70">({selectedAdsets.size})</span>}
                </TabBtn>
              </>
            )}
          </div>

          {tab === "sales" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente, email, UTM..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  className="h-8 pl-8 text-xs w-44 bg-background/80"
                />
              </div>

              {/* Filtro por Origem */}
              <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
                <button
                  type="button"
                  onClick={() => setSalesFilter("todos")}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition ${salesFilter === "todos" ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setSalesFilter("pago")}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition ${salesFilter === "pago" ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Pago ({salesStats.pagoApprovedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSalesFilter("organico")}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition ${salesFilter === "organico" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Orgânico ({salesStats.organicoApprovedCount})
                </button>
              </div>

              {/* Filtro por Evento/Status */}
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="h-8 text-xs w-36 bg-background/80">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Eventos</SelectItem>
                  <SelectItem value="approved">Aprovados</SelectItem>
                  <SelectItem value="refunded">Reembolsos ({salesStats.refundCount})</SelectItem>
                  <SelectItem value="chargeback">Chargebacks ({salesStats.chargebackCount})</SelectItem>
                  <SelectItem value="pix">PIX Gerado ({salesStats.pixCount})</SelectItem>
                  <SelectItem value="abandon">Abandonos ({salesStats.abandonCount})</SelectItem>
                  <SelectItem value="refused">Recusados/Cancelados</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => salesQ.refetch()}
                disabled={salesQ.isFetching}
                title="Atualizar Vendas"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${salesQ.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-4">
          {tab === "sales" && (
            <Table
              loading={salesQ.isLoading}
              error={salesQ.error as Error | undefined}
              rows={filteredSales}
              empty="Nenhum evento/venda encontrado com os filtros selecionados."
              headers={
                <>
                  <th className="px-3 py-2 text-left">Data & ID</th>
                  <th className="px-3 py-2 text-left">Evento / Status</th>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Origem</th>
                  <th className="px-3 py-2 text-left">Parâmetros (UTMs)</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-center">Payload</th>
                </>
              }
              renderRow={(sale: Pv24hSale) => {
                const isPago = sale.origem === "pago";
                const dateStr = sale.created_at
                  ? new Date(sale.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";

                const st = (sale.status || sale.event || "").toLowerCase();
                let statusBadge = (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] uppercase">
                    Aprovada
                  </Badge>
                );

                if (st.includes("refund")) {
                  statusBadge = (
                    <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px] uppercase flex items-center gap-1">
                      <RotateCcw className="h-3 w-3 text-rose-400" /> Reembolso
                    </Badge>
                  );
                } else if (st.includes("chargeback")) {
                  statusBadge = (
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] uppercase flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-amber-400" /> Chargeback
                    </Badge>
                  );
                } else if (st.includes("pix")) {
                  statusBadge = (
                    <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-[10px] uppercase flex items-center gap-1">
                      <Zap className="h-3 w-3 text-sky-400" /> PIX Gerado
                    </Badge>
                  );
                } else if (st.includes("abandon")) {
                  statusBadge = (
                    <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[10px] uppercase">
                      Carrinho Abandonado
                    </Badge>
                  );
                } else if (st.includes("renew")) {
                  statusBadge = (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] uppercase">
                      Assinatura Renovada
                    </Badge>
                  );
                } else if (st.includes("cancel")) {
                  statusBadge = (
                    <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30 text-[10px] uppercase">
                      Cancelada
                    </Badge>
                  );
                } else if (st.includes("refus")) {
                  statusBadge = (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] uppercase">
                      Cartão Recusado
                    </Badge>
                  );
                }

                return (
                  <tr
                    key={sale.id}
                    className="border-t border-border/50 hover:bg-muted/20 cursor-pointer transition"
                    onClick={() => setSelectedSalePayload(sale)}
                  >
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs font-semibold">{dateStr}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]" title={sale.transaction_id || sale.id}>
                        {sale.transaction_id || sale.id}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      {statusBadge}
                      {sale.produto_nome && (
                        <div className="text-[11px] text-muted-foreground mt-1 truncate max-w-[150px]">
                          {sale.produto_nome}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-semibold text-sm">{sale.cliente_nome || "Cliente Cakto"}</div>
                      <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
                        {sale.cliente_email && <span>{sale.cliente_email}</span>}
                        {sale.cliente_telefone && <span className="font-mono text-[11px] text-emerald-400">{sale.cliente_telefone}</span>}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      {isPago ? (
                        <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/30 flex items-center gap-1 w-fit">
                          <Megaphone className="h-3 w-3 text-violet-400" /> Tráfego Pago
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 flex items-center gap-1 w-fit">
                          <Globe className="h-3 w-3 text-emerald-400" /> Orgânico
                        </Badge>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {isPago ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {sale.utm_source && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                              src: {sale.utm_source}
                            </span>
                          )}
                          {sale.utm_campaign && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                              camp: {sale.utm_campaign}
                            </span>
                          )}
                          {sale.utm_medium && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card text-muted-foreground border border-border">
                              med: {sale.utm_medium}
                            </span>
                          )}
                          {sale.utm_content && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card text-muted-foreground border border-border">
                              ad: {sale.utm_content}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Venda direta (sem UTM)</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-mono font-bold text-sm text-emerald-400">
                      {brl(sale.valor)}
                    </td>

                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedSalePayload(sale)}
                        title="Inspecionar Payload JSON"
                      >
                        <FileJson className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              }}
            />
          )}

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
      {/* Dialog Inspetor de Payload JSON */}
      <Dialog open={!!selectedSalePayload} onOpenChange={(open) => !open && setSelectedSalePayload(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileJson className="h-5 w-5 text-accent" /> Inspetor de Evento / Payload Cakto
            </DialogTitle>
            <DialogDescription>
              Detalhes completos da transação e o payload bruto enviado pelo Webhook.
            </DialogDescription>
          </DialogHeader>

          {selectedSalePayload && (
            <div className="space-y-4 pt-2">
              {/* Resumo do Evento */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Evento / Status</span>
                  <span className="font-semibold text-foreground capitalize">{selectedSalePayload.event || selectedSalePayload.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Origem</span>
                  <span className={`font-semibold ${selectedSalePayload.origem === "pago" ? "text-violet-400" : "text-emerald-400"}`}>
                    {selectedSalePayload.origem === "pago" ? "Tráfego Pago" : "Orgânico"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Valor</span>
                  <span className="font-mono font-bold text-emerald-400">{brl(selectedSalePayload.valor)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">ID Transação</span>
                  <span className="font-mono truncate block">{selectedSalePayload.transaction_id || selectedSalePayload.id}</span>
                </div>
              </div>

              {/* Informações do Cliente & Produto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-border/50 bg-card space-y-1">
                  <div className="font-bold flex items-center gap-1 text-muted-foreground">
                    <User className="h-3.5 w-3.5" /> Cliente
                  </div>
                  <div><strong>Nome:</strong> {selectedSalePayload.cliente_nome || "—"}</div>
                  <div><strong>E-mail:</strong> {selectedSalePayload.cliente_email || "—"}</div>
                  <div><strong>Telefone:</strong> {selectedSalePayload.cliente_telefone || "—"}</div>
                </div>

                <div className="p-3 rounded-lg border border-border/50 bg-card space-y-1">
                  <div className="font-bold flex items-center gap-1 text-muted-foreground">
                    <ShoppingCart className="h-3.5 w-3.5" /> Produto & Pagamento
                  </div>
                  <div><strong>Produto:</strong> {selectedSalePayload.produto_nome || "—"}</div>
                  <div><strong>Método:</strong> {selectedSalePayload.payment_method || "—"}</div>
                  {selectedSalePayload.refund_reason && (
                    <div className="text-rose-400"><strong>Motivo Reembolso:</strong> {selectedSalePayload.refund_reason}</div>
                  )}
                </div>
              </div>

              {/* UTM Parameters */}
              <div className="p-3 rounded-lg border border-border/50 bg-card space-y-1 text-xs">
                <div className="font-bold flex items-center gap-1 text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" /> Parâmetros de Rastreamento (UTMs)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] pt-1">
                  <div><span className="text-muted-foreground">Source:</span> {selectedSalePayload.utm_source || "—"}</div>
                  <div><span className="text-muted-foreground">Medium:</span> {selectedSalePayload.utm_medium || "—"}</div>
                  <div><span className="text-muted-foreground">Campaign:</span> {selectedSalePayload.utm_campaign || "—"}</div>
                  <div><span className="text-muted-foreground">Content:</span> {selectedSalePayload.utm_content || "—"}</div>
                </div>
              </div>

              {/* JSON Payload Inspector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1 text-muted-foreground">
                    <Code2 className="h-3.5 w-3.5" /> Payload JSON Bruto
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedSalePayload.payload, null, 2));
                      toast.success("Payload JSON copiado!");
                    }}
                  >
                    <Copy className="h-3 w-3" /> Copiar JSON
                  </Button>
                </div>
                <pre className="p-3 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-[11px] overflow-x-auto max-h-60 border border-zinc-800">
                  {JSON.stringify(selectedSalePayload.payload || selectedSalePayload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
