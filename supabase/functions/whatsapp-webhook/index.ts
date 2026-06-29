// Supabase Edge Function: WhatsApp webhook (EvoHub → Supabase)
// Public URL: https://wvcwrozwnwdlpandwubp.supabase.co/functions/v1/whatsapp-webhook
// Configure EVOHUB_WEBHOOK_SECRET as Edge Function secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Hub-Signature-256, x-hub-signature-256",
};

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = `sha256=${hex}`;
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function previewFor(m: any): string {
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

function extractMedia(m: any) {
  const obj = m.image ?? m.audio ?? m.video ?? m.document ?? m.sticker ?? null;
  if (!obj) return null;
  return {
    id: obj.id as string | undefined,
    mime: (obj.mime_type as string | undefined) ?? null,
    filename: (obj.filename as string | undefined) ?? null,
    caption: (m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? null) as string | null,
  };
}

const APP_SOURCE = "lovable-crm";
const EVOHUB_BASE = "https://api.evohub.ai";

type ChannelInfo = { id: string; phone_number_id: string; operacao_id: string | null };

// Cache connected channels for 60s to avoid hitting EvoHub on every webhook
let channelsCache: { at: number; list: ChannelInfo[] } | null = null;

async function getConnectedChannels(): Promise<ChannelInfo[]> {
  const now = Date.now();
  if (channelsCache && now - channelsCache.at < 60_000) return channelsCache.list;
  const key = Deno.env.get("EVOHUB_API_KEY");
  if (!key) {
    console.warn("[wa-webhook] EVOHUB_API_KEY ausente; nenhum número será aceito");
    return [];
  }
  try {
    const res = await fetch(`${EVOHUB_BASE}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      console.error("[wa-webhook] EvoHub channels HTTP", res.status);
      return channelsCache?.list ?? [];
    }
    const data = await res.json();
    const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.channels ?? [];
    const mapped: ChannelInfo[] = list
      .filter((c) =>
        (c?.type === "whatsapp" || c?.type === "unified") &&
        c?.metadata?.app_source === APP_SOURCE &&
        c?.metadata?.meta_connection?.phone_number_id,
      )
      .map((c) => ({
        id: String(c.id),
        phone_number_id: String(c.metadata.meta_connection.phone_number_id),
        operacao_id: typeof c.metadata.operacao_id === "string" ? c.metadata.operacao_id : null,
      }));
    channelsCache = { at: now, list: mapped };
    return mapped;
  } catch (e) {
    console.error("[wa-webhook] erro buscando channels", e);
    return channelsCache?.list ?? [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const secret = Deno.env.get("EVOHUB_WEBHOOK_SECRET");

  // Meta-style verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const token = url.searchParams.get("hub.verify_token");
    if (mode === "subscribe" && token && secret && token === secret && challenge) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (secret && !(await verifySignature(raw, sig, secret))) {
    console.warn("[wa-webhook] invalid signature");
    return new Response("Invalid signature", { status: 401, headers: corsHeaders });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch {
    return new Response("Bad JSON", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field !== "messages") continue;
        const value = change.value ?? {};
        const phoneNumberId = value?.metadata?.phone_number_id ?? null;
        const displayPhone = value?.metadata?.display_phone_number ?? null;
        const channelId = phoneNumberId ?? "unknown";

        const contacts: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
        const nameByWaId: Record<string, string> = {};
        for (const c of contacts) {
          if (c?.wa_id) nameByWaId[c.wa_id] = c?.profile?.name ?? c.wa_id;
        }

        const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
        for (const m of messages) {
          const contactName = nameByWaId[m.from] ?? m.from;

          const { data: conv, error: convErr } = await supabase
            .from("wa_conversations")
            .upsert({
              channel_id: channelId,
              phone_number_id: phoneNumberId,
              contact_wa_id: m.from,
              contact_name: contactName,
              last_message_at: new Date(parseInt(m.timestamp, 10) * 1000).toISOString(),
              last_message_preview: previewFor(m),
              last_message_direction: "in",
            }, { onConflict: "channel_id,contact_wa_id" })
            .select("id, unread_count")
            .single();

          if (convErr || !conv) {
            console.error("upsert conv error", convErr);
            continue;
          }

          await supabase
            .from("wa_conversations")
            .update({ unread_count: ((conv as any).unread_count ?? 0) + 1 })
            .eq("id", (conv as any).id);

          const media = extractMedia(m);
          const interactive = m.interactive;
          const buttonId = interactive?.button_reply?.id ?? interactive?.list_reply?.id ?? m.button?.payload ?? null;
          const buttonText = interactive?.button_reply?.title ?? interactive?.list_reply?.title ?? m.button?.text ?? null;

          await supabase.from("wa_messages").upsert({
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
            raw: m,
            status: "delivered",
          }, { onConflict: "channel_id,wa_message_id" });
        }

        const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const s of statuses) {
          if (!s?.id || !s?.status) continue;
          await supabase.from("wa_messages").update({ status: s.status }).eq("wa_message_id", s.id);
        }
      }
    }
  } catch (e) {
    console.error("[wa-webhook] processing error", e);
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
