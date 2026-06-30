// Bridge endpoint: Supabase Edge Function (whatsapp-webhook) calls this
// after inserting an incoming message on the notification channel.
// Uses EVOHUB_WEBHOOK_SECRET as shared bearer.
import { createFileRoute } from "@tanstack/react-router";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function jwtRole(value: string): string | null {
  try {
    const [, payload] = value.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof json?.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

function collectSecretCandidates(value: unknown, out: string[] = []): string[] {
  if (!value) return out;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return out;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        collectSecretCandidates(JSON.parse(trimmed), out);
        return out;
      } catch {
        // keep raw string fallback below
      }
    }
    for (const part of trimmed.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean)) out.push(part);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSecretCandidates(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectSecretCandidates(item, out);
  }
  return out;
}

function pickSupabaseAdminKey(): string | null {
  const candidates = collectSecretCandidates([
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SECRET_KEYS,
  ]);
  return (
    candidates.find((k) => k.startsWith("sb_secret_")) ||
    candidates.find((k) => jwtRole(k) === "service_role") ||
    null
  );
}

async function createRouteSupabaseAdmin() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const key = pickSupabaseAdminKey();
  if (!SUPABASE_URL || !key) {
    throw new Error("Supabase admin env ausente no servidor publicado");
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
        if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
        if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/public/notification-ai/continue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.EVOHUB_WEBHOOK_SECRET;
        const auth = request.headers.get("authorization") || "";
        if (secret && auth !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const {
          channelId,
          contactWa,
          text,
          audioMediaId,
          imageMediaId,
          imageCaption,
          phoneNumberId,
        } = body ?? {};
        if (!channelId || !contactWa) {
          return new Response("Missing channelId/contactWa", { status: 400 });
        }
        try {
          const {
            continueNotificationSession,
            transcribeWaAudio,
            describeWaImage,
            resolveWaMediaToken,
          } = await import("@/lib/notification-ai.server");
          const supabaseAdmin = await createRouteSupabaseAdmin();
          let userText: string = String(text || "").trim();
          const mediaToken = (audioMediaId || imageMediaId) && phoneNumberId
            ? await resolveWaMediaToken(supabaseAdmin, channelId, phoneNumberId).catch((e) => {
                console.error("[notif-ai bridge] media token resolve failed", e);
                return null;
              })
            : null;
          if (!userText && audioMediaId && phoneNumberId) {
            try {
              userText = await transcribeWaAudio(audioMediaId, phoneNumberId, mediaToken || undefined);
            } catch (e) {
              console.error("[notif-ai bridge] transcribe failed", e);
            }
          }
          if (!userText && imageMediaId && phoneNumberId) {
            try {
              userText = await describeWaImage(imageMediaId, phoneNumberId, imageCaption, mediaToken || undefined);
            } catch (e) {
              console.error("[notif-ai bridge] vision failed", e);
            }
          }
          if (!userText) return Response.json({ ok: true, skipped: "no_text" });
          await continueNotificationSession({
            db: supabaseAdmin,
            channelId,
            contactWa,
            userText,
          });
          return Response.json({ ok: true });
        } catch (e: any) {
          console.error("[notif-ai bridge] error", e);
          return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
        }
      },
    },
  },
});
