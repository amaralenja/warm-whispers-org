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

                // Round-robin: atribui vendedor automaticamente se ainda não tem
                try {
                  const convId = (conv as any).id;
                  const { data: convRow } = await supabaseAdmin
                    .from("wa_conversations" as any)
                    .select("assigned_vendor_id, unread_count")
                    .eq("id", convId)
                    .maybeSingle();
                  const patch: Record<string, any> = {
                    unread_count: ((convRow as any)?.unread_count ?? 0) + 1,
                  };
                  if (!(convRow as any)?.assigned_vendor_id) {
                    const { data: vendorId } = await supabaseAdmin.rpc(
                      "assign_vendor_for_channel" as any,
                      { _channel_id: channelId },
                    );
                    if (vendorId) patch.assigned_vendor_id = vendorId;
                  }
                  await supabaseAdmin
                    .from("wa_conversations" as any)
                    .update(patch)
                    .eq("id", convId);
                } catch (e) {
                  console.error("[wa-webhook] assign/unread error", e);
                }


                const media = extractMedia(m);
                // Detect button reply (interactive)
                const interactive = (m as any).interactive;
                const buttonId =
                  interactive?.button_reply?.id ??
                  interactive?.list_reply?.id ??
                  (m as any).button?.payload ??
                  null;
                const buttonText =
                  interactive?.button_reply?.title ??
                  interactive?.list_reply?.title ??
                  (m as any).button?.text ??
                  null;

                const insertPayload: any = {
                  conversation_id: (conv as any).id,
                  channel_id: channelId,
                  wa_message_id: m.id,
                  direction: "in",
                  msg_type: m.type,
                  text_body: m.text?.body ?? buttonText ?? null,
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

                // Handle call-reminder button replies (callack:<reminderId>:<action>)
                if (buttonId && typeof buttonId === "string" && buttonId.startsWith("callack:")) {
                  try {
                    const parts = buttonId.split(":");
                    const reminderId = parts[1];
                    const action = (parts[2] ?? "").toLowerCase();
                    if (reminderId && (action === "showup" || action === "noshow")) {
                      const { data: rem } = await supabaseAdmin
                        .from("wa_call_reminders" as any)
                        .select("*")
                        .eq("id", reminderId)
                        .maybeSingle();
                      if (rem) {
                        await supabaseAdmin
                          .from("wa_call_reminders" as any)
                          .update({ status: action, replied_at: new Date().toISOString() })
                          .eq("id", reminderId);
                        if (action === "showup") {
                          try {
                            const { fireShowUpFromSnapshot } = await import("@/lib/meta-ads.server");
                            await fireShowUpFromSnapshot({
                              email: (rem as any).lead_email,
                              phone: (rem as any).contact_wa,
                              nome: (rem as any).lead_nome,
                              externalId: (rem as any).lead_externalid,
                              fbp: (rem as any).lead_fbp,
                              fbc: (rem as any).lead_fbc,
                            });
                          } catch (e) {
                            console.error("[wa-webhook] showup meta fire failed", e);
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.error("[wa-webhook] callack handle error", e);
                  }
                }

                // Dispatch to flow engine (fire and continue; await so errors are logged)
                try {
                  const { count: priorCount } = await supabaseAdmin
                    .from("wa_messages" as any)
                    .select("id", { count: "exact", head: true })
                    .eq("conversation_id", (conv as any).id)
                    .eq("direction", "in");
                  const isFirstMessage = (priorCount ?? 0) <= 1;

                  const { dispatchIncomingForFlows } = await import("@/lib/flow-engine.server");
                  await dispatchIncomingForFlows({
                    conversationId: (conv as any).id,
                    channelId,
                    contactWaId: m.from,
                    text: m.text?.body ?? buttonText ?? null,
                    buttonId,
                    messageType: m.type ?? null,
                    isFirstMessage,
                    db: supabaseAdmin,
                  });
                } catch (e) {
                  console.error("[wa-webhook] flow dispatch error", e);
                }
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
