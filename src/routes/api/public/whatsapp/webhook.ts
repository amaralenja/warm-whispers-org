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

        console.log("[wa-webhook] hit", {
          bytes: raw.length,
          hasSig: Boolean(sig),
          hasSecret: Boolean(secret),
        });

        // Allow if no secret configured (dev only), otherwise enforce.
        if (secret && !verifySignature(raw, sig, secret)) {
          console.warn("[wa-webhook] invalid signature", { hasSig: Boolean(sig), sigPrefix: sig?.slice(0, 12) ?? null });
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

              const { data: matchedChannel } = phoneNumberId
                ? await supabaseAdmin
                    .from("wa_channels" as any)
                    .select("id,operacao_id")
                    .eq("phone_number_id", phoneNumberId)
                    .maybeSingle()
                : { data: null } as any;

              const channelId = String((matchedChannel as any)?.id ?? phoneNumberId ?? "unknown");
              const operacaoId = (matchedChannel as any)?.operacao_id ?? null;

              const contacts: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
              const contactNameByWaId: Record<string, string> = {};
              for (const c of contacts) {
                if (c?.wa_id) contactNameByWaId[c.wa_id] = c?.profile?.name ?? c.wa_id;
              }

              // Incoming messages
              const messages: IncomingMessage[] = Array.isArray(value?.messages) ? value.messages : [];
              for (const m of messages) {
                const contactName = contactNameByWaId[m.from] ?? m.from;

                // Reactions: não são mensagens próprias — atualizam a msg alvo com raw.reactions.theirs
                // e NÃO devem virar linha nova em wa_messages (senão aparecem como "documento").
                if ((m as any).type === "reaction") {
                  try {
                    const targetWamid = (m as any).reaction?.message_id as string | undefined;
                    const emoji = ((m as any).reaction?.emoji ?? "") as string;
                    if (targetWamid) {
                      const { data: target } = await supabaseAdmin
                        .from("wa_messages" as any)
                        .select("id,raw,conversation_id")
                        .eq("channel_id", channelId)
                        .eq("wa_message_id", targetWamid)
                        .maybeSingle();
                      if (target) {
                        const prevRaw = ((target as any).raw ?? {}) as Record<string, any>;
                        const prevReactions = (prevRaw.reactions ?? {}) as Record<string, any>;
                        await supabaseAdmin
                          .from("wa_messages" as any)
                          .update({
                            raw: {
                              ...prevRaw,
                              reactions: { ...prevReactions, theirs: emoji || null },
                            },
                          })
                          .eq("id", (target as any).id);
                        const convId = (target as any).conversation_id;
                        if (convId) {
                          const previewText = emoji ? `Reagiu com: ${emoji}` : "Removeu reação";
                          await supabaseAdmin
                            .from("wa_conversations" as any)
                            .update({
                              last_message_at: new Date().toISOString(),
                              last_message_preview: previewText,
                              last_message_direction: "in",
                            })
                            .eq("id", convId);
                        }
                      }
                    }
                  } catch (e) {
                    console.error("[wa-webhook] reaction handling error", e);
                  }
                  continue;
                }


                // Ensure conversation exists — but do NOT overwrite
                // last_message_* unconditionally. A retried/late inbound
                // webhook from Meta must not clobber a newer outbound
                // (e.g. a flow-sent message) already persisted.
                const inboundIso = new Date(parseInt(m.timestamp, 10) * 1000).toISOString();
                const inboundPreview = previewFor(m);

                const { data: existing } = await supabaseAdmin
                  .from("wa_conversations" as any)
                  .select("id,last_message_at")
                  .eq("channel_id", channelId)
                  .eq("contact_wa_id", m.from)
                  .maybeSingle();

                let conv: { id: string } | null = existing
                  ? { id: (existing as any).id }
                  : null;

                if (!conv) {
                  const { data: inserted, error: insErr } = await supabaseAdmin
                    .from("wa_conversations" as any)
                    .insert({
                      channel_id: channelId,
                      phone_number_id: phoneNumberId,
                      contact_wa_id: m.from,
                      contact_name: contactName,
                      operacao_id: operacaoId,
                      last_message_at: inboundIso,
                      last_message_preview: inboundPreview,
                      last_message_direction: "in",
                    })
                    .select("id")
                    .single();
                  if (insErr || !inserted) {
                    console.error("[wa-webhook] insert conv error", insErr);
                    continue;
                  }
                  conv = { id: (inserted as any).id };
                } else {
                  // Only bump last_message_* when this inbound is newer than
                  // what's currently stored. Prevents Meta retries and
                  // out-of-order webhooks from overwriting a flow's newer
                  // outbound message.
                  const currentTs = (existing as any).last_message_at as string | null;
                  if (!currentTs || currentTs < inboundIso) {
                    await supabaseAdmin
                      .from("wa_conversations" as any)
                      .update({
                        last_message_at: inboundIso,
                        last_message_preview: inboundPreview,
                        last_message_direction: "in",
                        contact_name: contactName,
                      })
                      .eq("id", conv.id);
                  }
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
                    if (reminderId && (action === "showup" || action === "noshow" || action === "remarcada")) {
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

                        // Mark the Google Calendar event with the outcome
                        const eventId = (rem as any).event_id as string | null;
                        if (eventId) {
                          try {
                            const { gcal } = await import("@/lib/google-calendar.functions");
                            const ev: any = await gcal(`/events/${encodeURIComponent(eventId)}`);
                            const baseSummary = String(ev?.summary || "").replace(/^([✅❌🔄])\s+/, "");
                            const prefix = action === "showup" ? "✅" : action === "noshow" ? "❌" : "🔄";
                            await gcal(`/events/${encodeURIComponent(eventId)}`, {
                              method: "PATCH",
                              body: JSON.stringify({
                                summary: `${prefix} ${baseSummary}`,
                                extendedProperties: {
                                  private: {
                                    attendance_status: action,
                                    attendance_at: new Date().toISOString(),
                                  },
                                },
                              }),
                            });
                          } catch (e) {
                            console.error("[wa-webhook] calendar mark failed", e);
                          }
                        }

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
                        // Kick off AI assistant session for the notification number
                        try {
                          const { startNotificationSession } = await import("@/lib/notification-ai.server");
                          await startNotificationSession({
                            db: supabaseAdmin,
                            channelId,
                            contactWa: m.from,
                            contactName: contactNameByWaId[m.from] ?? null,
                            reminderId,
                            calendarEventId: (rem as any).event_id ?? null,
                            buttonId: action as any,
                            hora: (rem as any).hora ?? null,
                          });
                        } catch (e) {
                          console.error("[wa-webhook] start AI session failed", e);
                        }
                      }
                    }
                  } catch (e) {
                    console.error("[wa-webhook] callack handle error", e);
                  }
                }

                // Notification channel: route to AI agent (text + transcribed audio)
                let handledByAI = false;
                try {
                  const { data: ch } = await supabaseAdmin
                    .from("wa_channels" as any)
                    .select("kind")
                    .eq("id", channelId)
                    .maybeSingle();
                  const isNotif = (ch as any)?.kind === "notification";
                  if (isNotif && !buttonId) {
                    let userText = m.text?.body?.trim() || "";
                    if (!userText && m.type === "audio" && m.audio?.id && phoneNumberId) {
                      try {
                        const { transcribeWaAudio } = await import("@/lib/notification-ai.server");
                        userText = await transcribeWaAudio(m.audio.id, phoneNumberId);
                      } catch (e) {
                        console.error("[wa-webhook] transcribe failed", e);
                      }
                    }
                    if (!userText && m.type === "image" && m.image?.id && phoneNumberId) {
                      try {
                        const { describeWaImage } = await import("@/lib/notification-ai.server");
                        userText = await describeWaImage(m.image.id, phoneNumberId, m.image.caption);
                      } catch (e) {
                        console.error("[wa-webhook] vision failed", e);
                      }
                    }
                    if (userText) {
                      const { continueNotificationSession } = await import("@/lib/notification-ai.server");
                      await continueNotificationSession({
                        db: supabaseAdmin,
                        channelId,
                        contactWa: m.from,
                        userText,
                      });
                      handledByAI = true;
                    }
                  }
                } catch (e) {
                  console.error("[wa-webhook] notif AI route error", e);
                }

                // Dispatch to flow engine (skip for AI-handled notifications)
                if (!handledByAI) try {
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
                await supabaseAdmin
                  .from("wa_call_reminders" as any)
                  .update({ status: s.status })
                  .eq("wa_message_id", s.id);
                await supabaseAdmin
                  .from("wa_task_notifications" as any)
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
