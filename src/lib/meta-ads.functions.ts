import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MetaAdsConfig = {
  pixelId: string;
  accessToken: string;
  testEventCode: string;
  hasToken: boolean;
};

export const getMetaAdsConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MetaAdsConfig> => {
    const { data, error } = await context.supabase
      .from("meta_ads_config")
      .select("pixel_id, access_token, test_event_code")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      pixelId: data?.pixel_id ?? "",
      accessToken: "",
      testEventCode: data?.test_event_code ?? "",
      hasToken: !!data?.access_token,
    };
  });

const saveSchema = z.object({
  pixelId: z.string().trim().max(100),
  accessToken: z.string().trim().max(2000).optional(),
  testEventCode: z.string().trim().max(100).optional(),
});

export const saveMetaAdsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("meta_ads_config")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const update: { pixel_id: string; test_event_code: string; access_token?: string } = {
        pixel_id: data.pixelId,
        test_event_code: data.testEventCode ?? "",
      };
      if (data.accessToken && data.accessToken.length > 0) {
        update.access_token = data.accessToken;
      }
      const { error } = await context.supabase
        .from("meta_ads_config")
        .update(update)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("meta_ads_config")
        .insert({
          user_id: context.userId,
          pixel_id: data.pixelId,
          test_event_code: data.testEventCode ?? "",
          access_token: data.accessToken ?? "",
        });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const sendSchema = z.object({
  eventName: z.string().min(1).max(50),
  value: z.number().optional(),
  currency: z.string().max(10).optional(),
  eventSourceUrl: z.string().max(500).optional(),
});

export const sendMetaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: cfg, error } = await context.supabase
      .from("meta_ads_config")
      .select("pixel_id, access_token, test_event_code")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cfg?.pixel_id || !cfg?.access_token) {
      throw new Error("Configure Pixel ID e Access Token primeiro.");
    }

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: data.eventName,
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          event_source_url: data.eventSourceUrl ?? "https://multium.app",
          user_data: {},
          custom_data:
            data.value !== undefined
              ? { value: data.value, currency: data.currency ?? "BRL" }
              : {},
        },
      ],
    };
    if (cfg.test_event_code) payload.test_event_code = cfg.test_event_code;

    const url = `https://graph.facebook.com/v19.0/${cfg.pixel_id}/events?access_token=${encodeURIComponent(cfg.access_token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    }
    return {
      ok: true,
      eventsReceived: json?.events_received ?? 1,
      fbtraceId: json?.fbtrace_id ?? null,
    };
  });
