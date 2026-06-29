import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// EvoHub forwards Meta payloads to this URL.
// Expects HMAC-SHA256 signature in X-Hub-Signature-256 = "sha256=<hex>"
// signed with EVOHUB_WEBHOOK_SECRET.

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type IncomingMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string; voice?: boolean };
  video?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  context?: { id: string };
};

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      // Meta verification — usually hit on EvoHub itself; here for completeness.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const challenge = url.searchParams.get("hub.challenge");
        const token = url.searchParams.get("hub.verify_token");
        const expected = process.env.EVOHUB_WEBHOOK_SECRET;
        if (mode === "subscribe" && token && expected && token === expected && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const secret = process.env.EVOHUB_WEBHOOK_SECRET;
        const raw = await request.text();
        const sig = request.headers.get("x-hub-signature-256");

        // Allow if no secret configured (dev only), otherwise enforce.
        if (secret && !verifySignature(raw, sig, secret)) {
          console.warn("[wa-webhook] invalid signature");
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          // EvoHub envelope: { event, channel_id, properties }
          // OR raw Meta passthrough: { object, entry: [...] }
          const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];

          for (const entry of entries) {
            const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const change of changes) {
              if (change?.field !== "messages") continue;
              const value = change.value ?? {};
              const phoneNumberId = value?.metadata?.phone_number_id ?? null;
              const displayPhone = value?.metadata?.display_phone_number ?? null;

              // Resolve channel via phone_number_id later by linking it in DB; for now use phoneNumberId as channel_id key fallback.
              const channelId = phoneNumberId ?? "unknown";

              const contacts: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
              const contactNameByWaId: Record<string, string> = {};
              for (const c of contacts) {
                if (c?.wa_id) contactNameByWaId[c.wa_id] = c?.profile?.name ?? c.wa_id;
              }

              // Incoming messages
              const messages: IncomingMessage[] = Array.isArray(value?.messages) ? value.messages : [];
              for (const m of messages) {
                const contactName = contactNameByWaId[m.from] ?? m.from;

                // upsert conversation
                const { data: conv, error: convErr } = await supabaseAdmin
                  .from("wa_conversations" as any)
                  .upsert(
                    {
                      channel_id: channelId,
                      phone_number_id: phoneNumberId,
                      contact_wa_id: m.from,
                      contact_name: contactName,
                      last_message_at: new Date(parseInt(m.timestamp, 10) * 1000).toISOString(),
                      last_message_preview: previewFor(m),
                      last_message_direction: "in",
                    },
                    { onConflict: "channel_id,contact_wa_id" }
                  )
                  .select("id")
                  .single();
                if (convErr || !conv) {
                  console.error("[wa-webhook] upsert conv error", convErr);
                  continue;
                }

                // increment unread
                await supabaseAdmin.rpc("increment" as any, { x: 1 }).then(() => {}).catch(() => {});
                await supabaseAdmin
                  .from("wa_conversations" as any)
                  .update({ unread_count: ((conv as any).unread_count ?? 0) + 1 })
                  .eq("id", (conv as any).id)
                  .then(() => {})
                  .catch(() => {});

                const media = extractMedia(m);
                const insertPayload: any = {
                  conversation_id: (conv as any).id,
                  channel_id: channelId,
                  wa_message_id: m.id,
                  direction: "in",
                  msg_type: m.type,
                  text_body: m.text?.body ?? null,
                  media_id: media?.id ?? null,
                  media_mime: media?.mime ?? null,
                  media_filename: media?.filename ?? null,
                  caption: media?.caption ?? null,
                  from_wa_id: m.from,
                  to_wa_id: displayPhone,
                  reply_to: m.context?.id ?? null,
                  raw: m as any,
                  status: "delivered",
                };

                const { error: msgErr } = await supabaseAdmin
                  .from("wa_messages" as any)
                  .upsert(insertPayload, { onConflict: "channel_id,wa_message_id" });
                if (msgErr) console.error("[wa-webhook] insert msg error", msgErr);
              }

              // Status updates (sent/delivered/read/failed)
              const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : [];
              for (const s of statuses) {
                if (!s?.id || !s?.status) continue;
                await supabaseAdmin
                  .from("wa_messages" as any)
                  .update({ status: s.status })
                  .eq("wa_message_id", s.id);
              }
            }
          }
        } catch (e) {
          console.error("[wa-webhook] processing error", e);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

function previewFor(m: IncomingMessage): string {
  switch (m.type) {
    case "text": return m.text?.body?.slice(0, 120) ?? "";
    case "image": return "📷 Imagem" + (m.image?.caption ? ` — ${m.image.caption}` : "");
    case "audio": return m.audio?.voice ? "🎤 Áudio" : "🎵 Áudio";
    case "video": return "🎬 Vídeo" + (m.video?.caption ? ` — ${m.video.caption}` : "");
    case "document": return `📄 ${m.document?.filename ?? "Documento"}`;
    case "sticker": return "🎭 Figurinha";
    case "location": return "📍 Localização";
    default: return `[${m.type}]`;
  }
}

function extractMedia(m: IncomingMessage) {
  const obj: any =
    m.image ?? m.audio ?? m.video ?? m.document ?? m.sticker ?? null;
  if (!obj) return null;
  return {
    id: obj.id as string | undefined,
    mime: (obj.mime_type as string | undefined) ?? null,
    filename: (obj.filename as string | undefined) ?? null,
    caption: (m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? null) as string | null,
  };
}
