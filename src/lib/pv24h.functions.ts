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
    // valida token consultando /me
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

const datePresetSchema = z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "maximum"]).default("last_7d");

export type Pv24hCampaign = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
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
      fields: `id,name,status,effective_status,objective,daily_budget,lifetime_budget,insights.date_preset(${preset}){spend,impressions,clicks,ctr,cpc}`,
      limit: "200",
    });
    return (json.data ?? []).map((c: any) => {
      const ins = Array.isArray(c.insights?.data) ? c.insights.data[0] : null;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        effectiveStatus: c.effective_status,
        objective: c.objective ?? null,
        dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
        lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
        spend: Number(ins?.spend ?? 0),
        impressions: Number(ins?.impressions ?? 0),
        clicks: Number(ins?.clicks ?? 0),
        ctr: Number(ins?.ctr ?? 0),
        cpc: Number(ins?.cpc ?? 0),
      };
    });
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
