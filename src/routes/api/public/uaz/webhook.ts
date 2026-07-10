import { createFileRoute } from "@tanstack/react-router";

// Webhook público da instância UAZ.
// Configure essa URL no painel da UAZ (Webhook URL) — sem auth, sem CORS.
// Aceita POST com JSON e retorna 200 rápido pra não travar a fila da UAZ.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, token",
};

export const Route = createFileRoute("/api/public/uaz/webhook")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: corsHeaders }),

      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, endpoint: "uaz-webhook", method: "POST" }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } },
        ),

      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: any = null;
        try {
          payload = raw ? JSON.parse(raw) : null;
        } catch {
          payload = { raw };
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("uaz_webhook_events" as any)
            .insert({
              event_type: payload?.event ?? payload?.type ?? "unknown",
              payload,
            });
        } catch (e) {
          console.error("[uaz webhook] persist error", e);
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      },
    },
  },
});
