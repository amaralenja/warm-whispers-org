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
  eventName: z.enum(["Purchase", "ShowUp"]),
  value: z.number().positive().optional(),
  currency: z.literal("BRL").optional(),
  eventSourceUrl: z.string().url().max(500).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  externalId: z.string().trim().max(120).optional(),
  fbp: z.string().trim().max(120).optional(),
  fbc: z.string().trim().max(160).optional(),
});

export type MetaEventLog = {
  id: string;
  eventName: "Purchase" | "ShowUp";
  eventId: string;
  status: "success" | "error" | "pending";
  value: number | null;
  currency: string;
  hasEmail: boolean;
  hasPhone: boolean;
  hasFirstName: boolean;
  hasLastName: boolean;
  matchQualityScore: number;
  eventsReceived: number | null;
  fbtraceId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

const listLogsSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});

// Meta Advanced Matching specs: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
function normalizeEmail(value?: string): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  // Basic RFC-ish check; Meta rejects malformed emails
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

function normalizePhone(value?: string): string | null {
  if (!value) return null;
  // E.164 sem o "+" (só dígitos), com country code. Default BR = 55.
  let digits = value.replace(/\D/g, "");
  if (!digits) return null;
  // Remove zeros à esquerda (ex: 011 99999...)
  digits = digits.replace(/^0+/, "");
  // Se já vier com 55 + 10/11 dígitos, mantém
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  // Número BR local (10 = fixo DDD+8, 11 = celular DDD+9)
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  // Outros países: assume que já veio com country code
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

function normalizeName(value?: string): string | null {
  if (!value) return null;
  // Meta: lowercase, sem acentos, sem pontuação, sem espaços
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos
    .replace(/[^a-z]/g, ""); // só letras a-z
  return normalized || null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashOrNull(value: string | null): Promise<string | null> {
  return value ? sha256Hex(value) : null;
}

function getClientIp(getHeader: (name: string) => string | undefined): string | null {
  const forwarded = getHeader("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || getHeader("cf-connecting-ip") || getHeader("x-real-ip") || null;
}

function qualityScore(input: {
  emailHash: string | null;
  phoneHash: string | null;
  firstNameHash: string | null;
  lastNameHash: string | null;
  externalIdHash: string | null;
  fbp?: string;
  fbc?: string;
  clientIp: string | null;
  userAgent: string | null;
}) {
  let score = 10; // event_id + timestamp
  if (input.emailHash) score += 28;
  if (input.phoneHash) score += 28;
  if (input.firstNameHash) score += 6;
  if (input.lastNameHash) score += 6;
  if (input.externalIdHash) score += 8;
  if (input.fbp) score += 8;
  if (input.fbc) score += 8;
  if (input.clientIp && input.userAgent) score += 12;
  return Math.min(100, score);
}

export const listMetaEventLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listLogsSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<MetaEventLog[]> => {
    const { data: rows, error } = await context.supabase
      .from("meta_ads_event_logs")
      .select("id,event_name,event_id,status,value,currency,email_hash,phone_hash,first_name_hash,last_name_hash,match_quality_score,events_received,fbtrace_id,error_message,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 20);

    if (error) throw new Error(error.message);

    return (rows ?? []).map((row: any) => ({
      id: row.id,
      eventName: row.event_name,
      eventId: row.event_id,
      status: row.status,
      value: row.value == null ? null : Number(row.value),
      currency: row.currency ?? "BRL",
      hasEmail: Boolean(row.email_hash),
      hasPhone: Boolean(row.phone_hash),
      hasFirstName: Boolean(row.first_name_hash),
      hasLastName: Boolean(row.last_name_hash),
      matchQualityScore: Number(row.match_quality_score ?? 0),
      eventsReceived: row.events_received == null ? null : Number(row.events_received),
      fbtraceId: row.fbtrace_id ?? null,
      errorMessage: row.error_message ?? null,
      createdAt: row.created_at,
    }));
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

    if (data.eventName === "Purchase" && !data.value) {
      throw new Error("Informe o valor da venda em BRL.");
    }

    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const email = normalizeEmail(data.email || undefined);
    const phone = normalizePhone(data.phone);
    const firstName = normalizeName(data.firstName);
    const lastName = normalizeName(data.lastName);
    const externalId = data.externalId?.trim() || email || phone || null;
    const clientIp = getClientIp(getRequestHeader);
    const userAgent = getRequestHeader("user-agent") || null;

    const [emailHash, phoneHash, firstNameHash, lastNameHash, externalIdHash, clientIpHash] = await Promise.all([
      hashOrNull(email),
      hashOrNull(phone),
      hashOrNull(firstName),
      hashOrNull(lastName),
      hashOrNull(externalId),
      hashOrNull(clientIp),
    ]);

    const eventId = globalThis.crypto.randomUUID();
    const matchQualityScore = qualityScore({
      emailHash,
      phoneHash,
      firstNameHash,
      lastNameHash,
      externalIdHash,
      fbp: data.fbp,
      fbc: data.fbc,
      clientIp,
      userAgent,
    });

    const userData: Record<string, unknown> = {
      ...(emailHash ? { em: [emailHash] } : {}),
      ...(phoneHash ? { ph: [phoneHash] } : {}),
      ...(firstNameHash ? { fn: [firstNameHash] } : {}),
      ...(lastNameHash ? { ln: [lastNameHash] } : {}),
      ...(externalIdHash ? { external_id: [externalIdHash] } : {}),
      ...(clientIp ? { client_ip_address: clientIp } : {}),
      ...(userAgent ? { client_user_agent: userAgent } : {}),
      ...(data.fbp ? { fbp: data.fbp } : {}),
      ...(data.fbc ? { fbc: data.fbc } : {}),
    };

    const { data: log, error: logError } = await context.supabase
      .from("meta_ads_event_logs")
      .insert({
        user_id: context.userId,
        event_name: data.eventName,
        event_id: eventId,
        status: "pending",
        value: data.eventName === "Purchase" ? data.value : null,
        currency: "BRL",
        email_hash: emailHash,
        phone_hash: phoneHash,
        first_name_hash: firstNameHash,
        last_name_hash: lastNameHash,
        external_id_hash: externalIdHash,
        client_ip_hash: clientIpHash,
        user_agent: userAgent,
        event_source_url: data.eventSourceUrl ?? null,
        match_quality_score: matchQualityScore,
      })
      .select("id")
      .single();

    if (logError) throw new Error(logError.message);

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: data.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "phone_call",
          ...(data.eventSourceUrl ? { event_source_url: data.eventSourceUrl } : {}),
          user_data: userData,
          custom_data:
            data.eventName === "Purchase"
              ? { value: data.value, currency: "BRL" }
              : { content_name: "ShowUp - comparecimento em call", status: "showed_up" },
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
      const message = json?.error?.message ?? `HTTP ${res.status}`;
      await context.supabase
        .from("meta_ads_event_logs")
        .update({
          status: "error",
          events_received: json?.events_received ?? null,
          fbtrace_id: json?.fbtrace_id ?? null,
          error_message: message,
        })
        .eq("id", log.id)
        .eq("user_id", context.userId);
      throw new Error(message);
    }

    await context.supabase
      .from("meta_ads_event_logs")
      .update({
        status: "success",
        events_received: json?.events_received ?? 1,
        fbtrace_id: json?.fbtrace_id ?? null,
        error_message: null,
      })
      .eq("id", log.id)
      .eq("user_id", context.userId);

    return {
      ok: true,
      eventId,
      matchQualityScore,
      eventsReceived: json?.events_received ?? 1,
      fbtraceId: json?.fbtrace_id ?? null,
    };
  });
