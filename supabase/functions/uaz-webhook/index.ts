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

function normalizeServer(raw: unknown): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

function phoneVariants(raw: unknown): string[] {
  const value = digits(raw);
  if (!value) return [];
  const set = new Set<string>([value]);
  const local = value.startsWith("55") ? value.slice(2) : value;
  if (local.length === 10 || local.length === 11) set.add(`55${local}`);
  if (value.startsWith("55")) set.add(local);
  if (local.length === 10) {
    const withNine = `${local.slice(0, 2)}9${local.slice(2)}`;
    set.add(withNine);
    set.add(`55${withNine}`);
  }
  if (local.length === 11 && local[2] === "9") {
    const withoutNine = `${local.slice(0, 2)}${local.slice(3)}`;
    set.add(withoutNine);
    set.add(`55${withoutNine}`);
  }
  return Array.from(set).filter(Boolean);
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

function pickUazAvatar(j: any): string | null {
  const candidates = [
    j?.imgUrl,
    j?.image,
    j?.imageUrl,
    j?.picture,
    j?.profilePicUrl,
    j?.profilePictureUrl,
    j?.wa_profilePicUrl,
    j?.url,
    j?.data?.imgUrl,
    j?.data?.image,
    j?.data?.imageUrl,
    j?.data?.picture,
    j?.data?.profilePicUrl,
    j?.data?.profilePictureUrl,
    j?.data?.wa_profilePicUrl,
    j?.result?.imgUrl,
    j?.result?.image,
    j?.result?.imageUrl,
    j?.result?.picture,
    j?.result?.profilePicUrl,
    j?.result?.profilePictureUrl,
    j?.result?.wa_profilePicUrl,
    j?.contact?.imgUrl,
    j?.contact?.image,
    j?.contact?.imageUrl,
    j?.contact?.picture,
    j?.contact?.profilePicUrl,
    j?.contact?.profilePictureUrl,
    j?.contact?.wa_profilePicUrl,
  ];
  for (const cand of candidates) {
    const s = typeof cand === "string" ? cand.trim() : "";
    if (s && /^https?:\/\//i.test(s)) return s;
  }
  return null;
}

async function loadUazConfig(supabase: any): Promise<{ serverUrl: string; token: string } | null> {
  const { data: cfg } = await supabase
    .from("uaz_config")
    .select("server_url, instance_token")
    .eq("id", 1)
    .maybeSingle();
  const serverUrl = normalizeServer(cfg?.server_url);
  const token = String(cfg?.instance_token ?? "").trim();
  if (serverUrl && token) return { serverUrl, token };

  const envUrl = normalizeServer(Deno.env.get("UAZ_SERVER_URL"));
  const envToken = String(Deno.env.get("UAZ_INSTANCE_TOKEN") ?? "").trim();
  return envUrl && envToken ? { serverUrl: envUrl, token: envToken } : null;
}

async function fetchUazAvatar(supabase: any, contact: string): Promise<string | null> {
  const cfg = await loadUazConfig(supabase);
  if (!cfg) return null;
  const paths = ["/chat/details", "/chat/GetNameAndImageURL", "/chat/getNameAndImageURL"];
  const numbers = phoneVariants(contact);
  for (const number of numbers) {
    const payloads = [
      { number },
      { number, preview: true },
      { Number: number },
      { phone: number },
      { Phone: number },
      { contact: number },
      { chatid: `${number}@s.whatsapp.net` },
      { chatId: `${number}@s.whatsapp.net` },
      { jid: `${number}@s.whatsapp.net` },
    ];
    for (const path of paths) {
      for (const body of payloads) {
        try {
          const r = await fetch(`${cfg.serverUrl}${path}`, {
            method: "POST",
            headers: { token: cfg.token, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
          });
          if (!r.ok) {
            console.info("[uaz-webhook] avatar attempt failed", { path, status: r.status, bodyKeys: Object.keys(body) });
            continue;
          }
          const j: any = await r.json().catch(() => null);
          const img = pickUazAvatar(j);
          if (img) return img;
          console.info("[uaz-webhook] avatar attempt without image", { path, bodyKeys: Object.keys(body), responseKeys: j && typeof j === "object" ? Object.keys(j).slice(0, 8) : [] });
        } catch {
          // tenta a próxima combinação
        }
      }
    }
  }
  return null;
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

  // Backfill: atualiza avatars das conversas de hoje (00:00 até agora).
  if (payload?.action === "backfill_today") {
    const since = payload?.since
      ? new Date(payload.since).toISOString()
      : new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const { data: convs, error } = await supabase
      .from("wa_conversations")
      .select("id, contact_wa_id, contact_avatar_url, updated_at")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const force = Boolean(payload?.force);
    let updated = 0, missed = 0, skipped = 0;
    for (const c of convs ?? []) {
      if (!force && c.contact_avatar_url) { skipped++; continue; }
      const contact = digits(String(c.contact_wa_id ?? "").split("@")[0]);
      if (!contact) { missed++; continue; }
      try {
        const avatar = await fetchUazAvatar(supabase, contact);
        if (avatar) {
          const variants = phoneVariants(contact);
          await supabase
            .from("wa_conversations")
            .update({ contact_avatar_url: avatar, updated_at: new Date().toISOString() })
            .in("contact_wa_id", variants);
          updated++;
        } else {
          missed++;
        }
      } catch (e) {
        console.error("[uaz-webhook] backfill error", contact, e);
        missed++;
      }
    }
    return new Response(JSON.stringify({ ok: true, total: convs?.length ?? 0, updated, missed, skipped, since }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }


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
    const contact = pickContactId(payload);
      console.info("[uaz-webhook] avatar contact", { hasContact: Boolean(contact), contact });
    if (contact) {
      let avatar = pickAvatar(payload);

      // Fallback: se o payload não trouxe foto, busca via API UAZ
      if (!avatar) {
        try {
          avatar = await fetchUazAvatar(supabase, contact);
        } catch (e) {
          console.error("[uaz-webhook] avatar fetch error", e);
        }
      }

      if (avatar) {
        const variants = phoneVariants(contact);
        await supabase
          .from("wa_conversations")
          .update({ contact_avatar_url: avatar, updated_at: new Date().toISOString() })
          .in("contact_wa_id", variants);
        console.info("[uaz-webhook] avatar saved", { contact, variants: variants.length });
      } else {
        console.warn("[uaz-webhook] avatar not found", { contact });
      }
    }
  } catch (e) {
    console.error("[uaz-webhook] avatar update error", e);
  }


  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
