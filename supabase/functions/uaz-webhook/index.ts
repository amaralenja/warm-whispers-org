// Webhook público da instância UAZ — URL do Supabase.
// Configure no painel UAZ: https://<project-ref>.supabase.co/functions/v1/uaz-webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, token, apikey, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, endpoint: "uaz-webhook" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const raw = await req.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { raw }; }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase.from("uaz_webhook_events").insert({
      event_type: payload?.event ?? payload?.type ?? "unknown",
      payload,
    });
  } catch (e) {
    console.error("[uaz-webhook] persist error", e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
