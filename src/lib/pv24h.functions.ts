import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json: any = await res.json();
  if (!res.ok || json?.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

async function graphPost(path: string, token: string, body: Record<string, unknown>) {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", token);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v == null) continue;
    form.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const json: any = await res.json();
  if (!res.ok || json?.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

async function loadConfig(context: any) {
  const { data, error } = await context.supabase
    .from("pv24h_config" as any)
    .select("access_token, ad_account_id, ad_account_name")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  return data as { access_token: string; ad_account_id: string | null; ad_account_name: string | null } | null;
}

const INSIGHT_FIELDS =
  "spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,reach,frequency";

const datePresetSchema = z
  .enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "maximum"])
  .default("last_7d");

export type Pv24hInsights = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  frequency: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
};

const PURCHASE_KEYS = ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"];

function parseInsights(raw: any): Pv24hInsights {
  const data = Array.isArray(raw?.data) ? raw.data[0] : raw?.data ?? raw;
  if (!data) {
    return {
      spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0,
      reach: 0, frequency: 0, purchases: 0, revenue: 0, roas: 0, cpa: 0,
    };
  }
  const actions: Array<{ action_type: string; value: string }> = data.actions ?? [];
  const values: Array<{ action_type: string; value: string }> = data.action_values ?? [];
  let purchases = 0;
  for (const k of PURCHASE_KEYS) {
    const f = actions.find((a) => a.action_type === k);
    if (f) { purchases = Number(f.value || 0); break; }
  }
  let revenue = 0;
  for (const k of PURCHASE_KEYS) {
    const f = values.find((a) => a.action_type === k);
    if (f) { revenue = Number(f.value || 0); break; }
  }
  const spend = Number(data.spend || 0);
  return {
    spend,
    impressions: Number(data.impressions || 0),
    clicks: Number(data.clicks || 0),
    ctr: Number(data.ctr || 0),
    cpc: Number(data.cpc || 0),
    cpm: Number(data.cpm || 0),
    reach: Number(data.reach || 0),
    frequency: Number(data.frequency || 0),
    purchases,
    revenue,
    roas: spend > 0 ? revenue / spend : 0,
    cpa: purchases > 0 ? spend / purchases : 0,
  };
}

export const getPv24hConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = await loadConfig(context);
    if (!cfg) return { hasToken: false, adAccountId: null, adAccountName: null, tokenPreview: null };
    return {
      hasToken: !!cfg.access_token,
      adAccountId: cfg.ad_account_id,
      adAccountName: cfg.ad_account_name,
      tokenPreview: cfg.access_token ? `${cfg.access_token.slice(0, 8)}…${cfg.access_token.slice(-4)}` : null,
    };
  });

export const savePv24hToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await graphGet("me", data.accessToken, { fields: "id,name" });
    const { error } = await context.supabase
      .from("pv24h_config" as any)
      .upsert({ user_id: context.userId, access_token: data.accessToken, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });

export const listPv24hAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = await loadConfig(context);
    if (!cfg?.access_token) throw new Error("Token não configurado");
    const json = await graphGet("me/adaccounts", cfg.access_token, {
      fields: "id,account_id,name,currency,account_status",
      limit: "200",
    });
    return (json.data ?? []).map((a: any) => ({
      id: a.id as string,
      accountId: a.account_id as string,
      name: a.name as string,
      currency: a.currency as string,
      status: Number(a.account_status ?? 0),
    }));
  });

export const selectPv24hAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ adAccountId: z.string(), adAccountName: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pv24h_config" as any)
      .update({ ad_account_id: data.adAccountId, ad_account_name: data.adAccountName, updated_at: new Date().toISOString() })
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export type Pv24hCampaign = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  insights: Pv24hInsights;
};

export const listPv24hCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ datePreset: datePresetSchema.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<Pv24hCampaign[]> => {
    const cfg = await loadConfig(context);
    if (!cfg?.access_token) throw new Error("Token não configurado");
    if (!cfg.ad_account_id) throw new Error("Escolha uma conta de anúncios primeiro");
    const preset = data?.datePreset ?? "last_7d";
    const acc = cfg.ad_account_id.startsWith("act_") ? cfg.ad_account_id : `act_${cfg.ad_account_id}`;
    const json = await graphGet(`${acc}/campaigns`, cfg.access_token, {
      fields: `id,name,status,effective_status,objective,daily_budget,lifetime_budget,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`,
      limit: "200",
    });
    return (json.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      effectiveStatus: c.effective_status,
      objective: c.objective ?? null,
      dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      insights: parseInsights(c.insights),
    }));
  });

export type Pv24hAdSet = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaignId: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  insights: Pv24hInsights;
};

export const listPv24hAdSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string(), datePreset: datePresetSchema.optional() }).parse(d))
  .handler(async ({ data, context }): Promise<Pv24hAdSet[]> => {
    const cfg = await loadConfig(context);
    if (!cfg?.access_token) throw new Error("Token não configurado");
    const preset = data.datePreset ?? "last_7d";
    const json = await graphGet(`${data.campaignId}/adsets`, cfg.access_token, {
      fields: `id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`,
      limit: "200",
    });
    return (json.data ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      effectiveStatus: a.effective_status,
      campaignId: a.campaign_id,
      dailyBudget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
      lifetimeBudget: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : null,
      insights: parseInsights(a.insights),
    }));
  });

export type Pv24hAd = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  adsetId: string;
  thumbnail: string | null;
  insights: Pv24hInsights;
};

export const listPv24hAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ adsetId: z.string(), datePreset: datePresetSchema.optional() }).parse(d))
  .handler(async ({ data, context }): Promise<Pv24hAd[]> => {
    const cfg = await loadConfig(context);
    if (!cfg?.access_token) throw new Error("Token não configurado");
    const preset = data.datePreset ?? "last_7d";
    const json = await graphGet(`${data.adsetId}/ads`, cfg.access_token, {
      fields: `id,name,status,effective_status,adset_id,creative{thumbnail_url},insights.date_preset(${preset}){${INSIGHT_FIELDS}}`,
      limit: "200",
    });
    return (json.data ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      effectiveStatus: a.effective_status,
      adsetId: a.adset_id,
      thumbnail: a.creative?.thumbnail_url ?? null,
      insights: parseInsights(a.insights),
    }));
  });

export type Pv24hAccountSummary = {
  spend: number;
  revenue: number;
  purchases: number;
  impressions: number;
  clicks: number;
  roas: number;
  profit: number;
  roi: number;
};

export const getPv24hAccountSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ datePreset: datePresetSchema.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<Pv24hAccountSummary> => {
    const cfg = await loadConfig(context);
    if (!cfg?.access_token) throw new Error("Token não configurado");
    if (!cfg.ad_account_id) throw new Error("Escolha uma conta de anúncios primeiro");
    const preset = data?.datePreset ?? "last_7d";
    const acc = cfg.ad_account_id.startsWith("act_") ? cfg.ad_account_id : `act_${cfg.ad_account_id}`;
    const json = await graphGet(`${acc}/insights`, cfg.access_token, {
      fields: INSIGHT_FIELDS,
      date_preset: preset,
      level: "account",
    });
    const ins = parseInsights(json);
    const profit = ins.revenue - ins.spend;
    return {
      spend: ins.spend,
      revenue: ins.revenue,
      purchases: ins.purchases,
      impressions: ins.impressions,
      clicks: ins.clicks,
      roas: ins.roas,
      profit,
      roi: ins.spend > 0 ? (profit / ins.spend) * 100 : 0,
    };
  });

export const togglePv24hStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string(), status: z.enum(["ACTIVE", "PAUSED"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const cfg = await loadConfig(context);
    if (!cfg?.access_token) throw new Error("Token não configurado");
    await graphPost(data.id, cfg.access_token, { status: data.status });
    return { ok: true };
  });

export type Pv24hSale = {
  id: string;
  transaction_id: string | null;
  cliente_nome: string | null;
  cliente_email: string | null;
  cliente_telefone: string | null;
  valor: number;
  status: string;
  origem: "pago" | "organico";
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  event: string;
  produto_nome: string | null;
  payment_method: string | null;
  refund_reason: string | null;
  payload: any;
  created_at: string;
};

export const listPv24hSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Pv24hSale[]> => {
    const salesList: Pv24hSale[] = [];
    const seenIds = new Set<string>();

    // Helper to extract fields from raw payload
    const parsePayload = (s: any) => {
      const p = s.payload || {};
      const d = (p.data && typeof p.data === "object" ? p.data : p) as Record<string, any>;
      const rawEvent = (p.event || p.event_type || s.status || d.status || "approved").toString().toLowerCase();

      // Identificadores e Cliente
      const transaction_id = s.transaction_id || d.id || s.id;
      const cliente_nome = s.cliente_nome || d.customer?.name || d.customer?.full_name || d.name || "Cliente Cakto";
      const cliente_email = s.cliente_email || d.customer?.email || d.email || null;
      const cliente_telefone = s.cliente_telefone || d.customer?.phone || d.phone || null;

      // Valor
      const valor = Number(s.valor || d.amount || d.baseAmount || d.price || 0);

      // Status
      let status = s.status || rawEvent;
      if (rawEvent.includes("refund")) status = "refunded";
      else if (rawEvent.includes("chargeback")) status = "chargeback";
      else if (rawEvent.includes("approved") || rawEvent.includes("paid")) status = "approved";
      else if (rawEvent.includes("pix")) status = "pix_generated";
      else if (rawEvent.includes("abandon")) status = "cart_abandonment";
      else if (rawEvent.includes("renew")) status = "subscription_renewed";
      else if (rawEvent.includes("cancel")) status = "subscription_canceled";
      else if (rawEvent.includes("refus")) status = "refused";

      // UTMs
      const tracking = (d.tracking_parameters || d.tracking_params || d.utm || p.tracking_parameters || {}) as Record<string, any>;
      const utm_source = s.utm_source || d.utm_source || tracking.utm_source || d.src || d.sck || null;
      const utm_medium = s.utm_medium || d.utm_medium || tracking.utm_medium || null;
      const utm_campaign = s.utm_campaign || d.utm_campaign || tracking.utm_campaign || null;
      const utm_content = s.utm_content || d.utm_content || tracking.utm_content || null;
      const utm_term = s.utm_term || d.utm_term || tracking.utm_term || null;

      const isValidUtm = (v: string | null) => !!v && v.toLowerCase() !== "null" && v.toLowerCase() !== "undefined" && String(v).trim().length > 0;
      const hasUtm = isValidUtm(utm_source) || isValidUtm(utm_medium) || isValidUtm(utm_campaign) || isValidUtm(utm_content) || isValidUtm(utm_term);
      const origem: "pago" | "organico" = (s.origem === "pago" || hasUtm) ? "pago" : "organico";

      const produto_nome = d.product?.name || d.offer?.name || null;
      const payment_method = d.paymentMethodName || d.paymentMethod || null;
      const refund_reason = d.refund_reason || d.reason || null;

      const isTest =
        String(cliente_email || "").toLowerCase().includes("john.doe") ||
        String(cliente_nome || "").toLowerCase().includes("john doe") ||
        String(cliente_email || "").toLowerCase().includes("teste@teste") ||
        String(produto_nome || "").toLowerCase().includes("produto teste");

      if (isTest) return null;

      return {
        id: s.id,
        transaction_id,
        cliente_nome,
        cliente_email,
        cliente_telefone,
        valor,
        status,
        origem,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        event: rawEvent,
        produto_nome,
        payment_method,
        refund_reason,
        payload: p,
        created_at: s.created_at || s.received_at || new Date().toISOString(),
      };
    };

    // 1. Puxa da tabela principal `pv24h_vendas`
    try {
      const { data: pvSales, error } = await (context.supabase.from("pv24h_vendas" as any) as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (!error && Array.isArray(pvSales)) {
        for (const s of pvSales as any[]) {
          const item = parsePayload(s);
          if (item) {
            salesList.push(item);
            seenIds.add(item.id);
            if (item.transaction_id) seenIds.add(item.transaction_id);
          }
        }
      }
    } catch (err) {
      console.warn("[listPv24hSales] aviso pv24h_vendas:", err);
    }

    // 2. Puxa do fallback `ht_quiz_submissions`
    try {
      const { data: qzSales } = await (context.supabase.from("ht_quiz_submissions" as any) as any)
        .select("*")
        .order("received_at", { ascending: false })
        .limit(2000);

      if (Array.isArray(qzSales)) {
        for (const q of qzSales as any[]) {
          const r = (q.respostas ?? {}) as Record<string, any>;
          if (r.tipo === "pv24h_venda" || r.origem === "pv24h" || r.cakto_payload) {
            const key = r.transaction_id || `qz_${q.id}`;
            if (!seenIds.has(key) && !seenIds.has(`qz_${q.id}`)) {
              const item = parsePayload({
                id: `qz_${q.id}`,
                transaction_id: r.transaction_id ?? q.id,
                cliente_nome: q.nome,
                cliente_email: q.email,
                cliente_telefone: q.whatsapp,
                valor: r.valor,
                status: r.status,
                origem: r.origem,
                utm_source: q.utm_source,
                utm_medium: q.utm_medium,
                utm_campaign: q.utm_campaign,
                payload: r.cakto_payload || r,
                created_at: q.received_at,
              });
              if (item) salesList.push(item);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[listPv24hSales] aviso ht_quiz_submissions fallback:", err);
    }

    salesList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return salesList;
  });

export const clearTestPv24hSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      // Deleta das tabelas do Supabase via context (bypassing RLS ou com service role)
      await (context.supabase.from("pv24h_vendas" as any) as any)
        .delete()
        .or("cliente_email.ilike.%john.doe%,cliente_email.ilike.%teste@teste%,cliente_nome.ilike.%john doe%");

      await (context.supabase.from("ht_quiz_submissions" as any) as any)
        .delete()
        .or("email.ilike.%john.doe%,email.ilike.%teste@teste%,nome.ilike.%john doe%");

      return { ok: true };
    } catch (err: any) {
      console.error("[clearTestPv24hSales] Erro ao limpar vendas de teste:", err);
      return { ok: false, error: err?.message };
    }
  });

