// Bridge endpoint: Supabase Edge Function (whatsapp-webhook) calls this
// after inserting an incoming message on the notification channel.
// Uses EVOHUB_WEBHOOK_SECRET as shared bearer.
import { createFileRoute } from "@tanstack/react-router";

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
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const {
            continueNotificationSession,
            transcribeWaAudio,
            describeWaImage,
          } = await import("@/lib/notification-ai.server");
          let userText: string = String(text || "").trim();
          if (!userText && audioMediaId && phoneNumberId) {
            try {
              userText = await transcribeWaAudio(audioMediaId, phoneNumberId);
            } catch (e) {
              console.error("[notif-ai bridge] transcribe failed", e);
            }
          }
          if (!userText && imageMediaId && phoneNumberId) {
            try {
              userText = await describeWaImage(imageMediaId, phoneNumberId, imageCaption);
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
