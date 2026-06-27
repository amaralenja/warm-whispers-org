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

export type AdPreview = {
  id: string;
  name: string;
  creativeName: string | null;
  previewHtml: string | null;
  previewError: string | null;
  mediaType: "video" | "image" | "preview" | "empty";
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  permalinkUrl: string | null;
};

function findStringByKey(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKey(item, keys);
      if (found) return found;
    }
    return null;
  }

  const obj = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = obj[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  for (const candidate of Object.values(obj)) {
    const found = findStringByKey(candidate, keys);
    if (found) return found;
  }
  return null;
}

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

export type AccountAd = Ad & { campaignName: string | null; adsetName: string | null };

export const listAccountAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ datePreset: datePresetSchema.optional(), activeOnly: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<AccountAd[]> => {
    const { accountId } = env();
    const preset = data?.datePreset ?? "last_7d";
    const filtering = data?.activeOnly
      ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]))}`
      : "";
    const out: AccountAd[] = [];
    let url: string | null =
      `${accountId}/ads?fields=id,name,status,effective_status,adset_id,adset{name},campaign{name},creative{thumbnail_url},insights.date_preset(${preset}){${INSIGHT_FIELDS}}&limit=200${filtering}`;
    let safety = 0;
    while (url && safety++ < 10) {
      const json: any = await graphGet(url, {});
      for (const a of (json.data ?? [])) {
        out.push({
          id: a.id,
          name: a.name,
          status: a.status,
          effectiveStatus: a.effective_status,
          adsetId: a.adset_id,
          thumbnail: a.creative?.thumbnail_url ?? null,
          insights: parseInsights(a.insights),
          campaignName: a.campaign?.name ?? null,
          adsetName: a.adset?.name ?? null,
        });
      }
      const next: string | undefined = json.paging?.next;
      if (!next) break;
      // strip host to reuse graphGet with relative path
      const u = new URL(next);
      url = `${u.pathname.replace(/^\/v\d+(\.\d+)?\//, "")}${u.search}`;
    }
    return out;
  });

export const getAdPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ adId: z.string() }).parse(d))
  .handler(async ({ data }): Promise<AdPreview> => {
    const ad = await graphGet(data.adId, {
      fields: "id,name,creative{id,name,thumbnail_url,image_url,video_id,effective_object_story_id,object_story_spec,asset_feed_spec}",
    });

    const creative = ad.creative ?? {};
    const videoId =
      creative.video_id ??
      findStringByKey(creative.object_story_spec, ["video_id"]) ??
      findStringByKey(creative.asset_feed_spec, ["video_id"]);
    const imageUrl =
      creative.image_url ??
      findStringByKey(creative.object_story_spec, ["image_url", "picture"]) ??
      findStringByKey(creative.asset_feed_spec, ["image_url", "picture"]) ??
      creative.thumbnail_url ??
      null;

    let videoUrl: string | null = null;
    let thumbnailUrl: string | null = creative.thumbnail_url ?? imageUrl ?? null;
    let permalinkUrl: string | null = null;
    if (videoId) {
      try {
        const video = await graphGet(videoId, { fields: "source,picture,permalink_url" });
        videoUrl = video.source ?? null;
        thumbnailUrl = video.picture ?? thumbnailUrl;
        permalinkUrl = video.permalink_url ?? null;
      } catch {
        // Some video sources are not exposed to the token; the Meta preview iframe still works as fallback.
      }
    }

    let previewHtml: string | null = null;
    let previewError: string | null = null;
    try {
      const preview = await graphGet(`${data.adId}/previews`, { ad_format: "DESKTOP_FEED_STANDARD" });
      previewHtml = preview.data?.[0]?.body ?? null;
    } catch (error: any) {
      previewError = error?.message ?? "Não foi possível carregar o preview da Meta";
    }

    return {
      id: ad.id,
      name: ad.name,
      creativeName: creative.name ?? null,
      previewHtml,
      previewError,
      mediaType: videoUrl ? "video" : imageUrl ? "image" : previewHtml ? "preview" : "empty",
      imageUrl,
      videoUrl,
      thumbnailUrl,
      permalinkUrl,
    };
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
