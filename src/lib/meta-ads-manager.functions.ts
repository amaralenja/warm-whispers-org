import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "https://graph.facebook.com/v21.0";

function env() {
  const token = process.env.META_ADS_SYSTEM_USER_TOKEN;
  const accountRaw = process.env.META_ADS_ACCOUNT_ID;
  if (!token) throw new Error("META_ADS_SYSTEM_USER_TOKEN não configurado");
  if (!accountRaw) throw new Error("META_ADS_ACCOUNT_ID não configurado");
  const accountId = accountRaw.startsWith("act_") ? accountRaw : `act_${accountRaw}`;
  return { token, accountId };
}

async function graphGet(path: string, params: Record<string, string>) {
  const { token } = env();
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json: any = await res.json();
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json;
}

async function graphPost(path: string, body: Record<string, unknown>) {
  const { token } = env();
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
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json;
}

const INSIGHT_FIELDS =
  "spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,reach,frequency";

const datePresetSchema = z
  .enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "maximum"])
  .default("last_7d");

export type AdInsights = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  frequency: number;
  results: number;
  costPerResult: number;
  resultType: string | null;
};

function parseInsights(raw: any): AdInsights {
  const data = Array.isArray(raw?.data) ? raw.data[0] : raw?.data ?? raw;
  if (!data) {
    return {
      spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0,
      reach: 0, frequency: 0, results: 0, costPerResult: 0, resultType: null,
    };
  }
  const actions: Array<{ action_type: string; value: string }> = data.actions ?? [];
  const priority = [
    "offsite_conversion.fb_pixel_purchase",
    "purchase",
    "offsite_conversion.fb_pixel_lead",
    "lead",
    "onsite_conversion.lead_grouped",
    "landing_page_view",
    "link_click",
  ];
  let results = 0;
  let resultType: string | null = null;
  for (const p of priority) {
    const found = actions.find((a) => a.action_type === p);
    if (found) {
      results = Number(found.value || 0);
      resultType = p;
      break;
    }
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
    results,
    costPerResult: results > 0 ? spend / results : 0,
    resultType,
  };
}

export type Campaign = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  insights: AdInsights;
};

export const listCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ datePreset: datePresetSchema.optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<Campaign[]> => {
    const { accountId } = env();
    const preset = data?.datePreset ?? "last_7d";
    const json = await graphGet(`${accountId}/campaigns`, {
      fields: `id,name,status,effective_status,objective,daily_budget,lifetime_budget,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`,
      limit: "100",
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

export type AdSet = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaignId: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  insights: AdInsights;
};

export const listAdSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campaignId: z.string(), datePreset: datePresetSchema.optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<AdSet[]> => {
    const preset = data.datePreset ?? "last_7d";
    const json = await graphGet(`${data.campaignId}/adsets`, {
      fields: `id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`,
      limit: "100",
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

export type Ad = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  adsetId: string;
  thumbnail: string | null;
  insights: AdInsights;
};

export const listAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ adsetId: z.string(), datePreset: datePresetSchema.optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<Ad[]> => {
    const preset = data.datePreset ?? "last_7d";
    const json = await graphGet(`${data.adsetId}/ads`, {
      fields: `id,name,status,effective_status,adset_id,creative{thumbnail_url},insights.date_preset(${preset}){${INSIGHT_FIELDS}}`,
      limit: "100",
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

export const updateEntityStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string(),
      status: z.enum(["ACTIVE", "PAUSED"]),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    await graphPost(data.id, { status: data.status });
    return { ok: true };
  });

export const updateAdSetBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string(),
      dailyBudget: z.number().positive().optional(),
      lifetimeBudget: z.number().positive().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const body: Record<string, unknown> = {};
    if (data.dailyBudget) body.daily_budget = Math.round(data.dailyBudget * 100);
    if (data.lifetimeBudget) body.lifetime_budget = Math.round(data.lifetimeBudget * 100);
    if (!Object.keys(body).length) throw new Error("Informe um orçamento");
    await graphPost(data.id, body);
    return { ok: true };
  });

export const updateCampaignBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string(),
      dailyBudget: z.number().positive().optional(),
      lifetimeBudget: z.number().positive().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const body: Record<string, unknown> = {};
    if (data.dailyBudget) body.daily_budget = Math.round(data.dailyBudget * 100);
    if (data.lifetimeBudget) body.lifetime_budget = Math.round(data.lifetimeBudget * 100);
    if (!Object.keys(body).length) throw new Error("Informe um orçamento");
    await graphPost(data.id, body);
    return { ok: true };
  });
