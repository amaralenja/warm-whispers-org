// Webhook público da instância UAZ — URL do Supabase.
// Configure no painel UAZ: https://<project-ref>.supabase.co/functions/v1/uaz-webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, token, apikey, x-client-info",
};

function digits(s: unknown): string {
  return String(s ?? "").replace(/\D+/g, "");
}

function pickAvatar(p: any): string | null {
  const cand =
    p?.chat?.imagePreview ??
    p?.chat?.image ??
    p?.chat?.wa_profilePicUrl ??
    p?.chat?.profilePicUrl ??
    p?.sender?.imagePreview ??
    p?.sender?.image ??
    p?.sender?.profilePicUrl ??
    p?.message?.senderPicture ??
    p?.profilePicUrl ??
    null;
  const s = typeof cand === "string" ? cand.trim() : "";
  return s && /^https?:\/\//i.test(s) ? s : null;
}

function pickContactId(p: any): string {
  const cand =
    p?.chat?.wa_chatid ??
    p?.chat?.id ??
    p?.message?.sender ??
    p?.sender?.wa_chatid ??
    p?.sender?.id ??
    p?.message?.chatid ??
    "";
  return digits(String(cand).split("@")[0]);
}

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    await supabase.from("uaz_webhook_events").insert({
      event_type: payload?.event ?? payload?.type ?? "unknown",
      payload,
    });
  } catch (e) {
    console.error("[uaz-webhook] persist error", e);
  }

  // Atualiza foto de perfil do contato nas conversas ao vivo (só daqui pra frente).
  try {
    const avatar = pickAvatar(payload);
    const contact = pickContactId(payload);
    if (avatar && contact) {
      const variants = Array.from(new Set([
        contact,
        contact.replace(/^55/, ""),
        `55${contact.replace(/^55/, "")}`,
      ])).filter(Boolean);
      await supabase
        .from("wa_conversations")
        .update({ contact_avatar_url: avatar, updated_at: new Date().toISOString() })
        .in("contact_wa_id", variants);
    }
  } catch (e) {
    console.error("[uaz-webhook] avatar update error", e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
