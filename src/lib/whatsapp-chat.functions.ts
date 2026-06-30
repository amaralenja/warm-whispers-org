import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVOHUB_BASE = "https://api.evohub.ai";

function getEvoKey() {
  const k = process.env.EVOHUB_API_KEY;
  if (!k) throw new Error("EVOHUB_API_KEY não configurada");
  return k;
}

async function evoApi(path: string, init?: RequestInit) {
  const res = await fetch(`${EVOHUB_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getEvoKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `EvoHub HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body;
}

async function metaProxy(channelToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${EVOHUB_BASE}/meta${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${channelToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && (body?.error?.message || body?.message)) || `Meta HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body;
}

async function rawMetaProxy(channelToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${EVOHUB_BASE}/meta${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${channelToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function findChannel(channelId: string) {
  // Loads all channels and finds by id (small N, fine for now)
  const data = await evoApi("/api/v1/channels");
  const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.channels ?? [];
  const fromList = list.find((c) => c.id === channelId);
  if (!fromList) throw new Error("Canal não encontrado");
  const ch = await evoApi(`/api/v1/channels/${channelId}`).catch(() => fromList);
  if (!ch) throw new Error("Canal não encontrado");
  const metaConnection = ch?.meta_connection ?? ch?.metadata?.meta_connection ?? null;
  const phoneNumberId = metaConnection?.phone_number_id ?? metaConnection?.phone_numbers?.[0]?.id;
  return { token: ch.token as string, phoneNumberId: phoneNumberId as string | undefined, raw: ch };
}

async function findUsableMetaToken(phoneNumberId: string, preferredToken?: string) {
  if (preferredToken) {
    const probe = await rawMetaProxy(preferredToken, `/v23.0/${phoneNumberId}?fields=id`).catch(() => null);
    if (probe?.ok) return preferredToken;
  }

  const data = await evoApi("/api/v1/channels");
  const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.channels ?? [];
  for (const row of list) {
    const detail = await evoApi(`/api/v1/channels/${row.id}`).catch(() => row);
    const token = detail?.token ? String(detail.token) : "";
    if (!token || token === preferredToken) continue;
    const probe = await rawMetaProxy(token, `/v23.0/${phoneNumberId}?fields=id`).catch(() => null);
    if (probe?.ok) return token;
  }

  return preferredToken ?? "";
}

async function metaProxyForChannel(ch: { token: string; phoneNumberId?: string }, path: string, init?: RequestInit) {
  try {
    return { body: await metaProxy(ch.token, path, init), token: ch.token };
  } catch (err: any) {
    if (!ch.phoneNumberId) throw err;
    const message = err?.message ? String(err.message) : "";
    const canRetry =
      message.includes("Meta token not available") ||
      message.includes("Unsupported get request") ||
      message.includes("missing permissions") ||
      message.includes("OAuth") ||
      message.includes("401") ||
      message.includes("400") ||
      message.includes("500");
    if (!canRetry) throw err;

    const token = await findUsableMetaToken(ch.phoneNumberId, ch.token);
    if (!token || token === ch.token) throw err;
    return { body: await metaProxy(token, path, init), token };
  }
}

// --- DB reads ---

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { operacaoId?: string } | undefined) => ({
    operacaoId: d?.operacaoId ?? null,
  }))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("wa_conversations" as any)
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data.operacaoId) q = q.eq("operacao_id", data.operacaoId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) => ({ conversationId: String(d?.conversationId ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) return [];
    const { data: rows, error } = await context.supabase
      .from("wa_messages" as any)
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) => ({ conversationId: String(d?.conversationId ?? "") }))
  .handler(async ({ context, data }) => {
    await context.supabase
      .from("wa_conversations" as any)
      .update({ unread_count: 0 })
      .eq("id", data.conversationId);
    return { ok: true };
  });

// --- Send ---

type SendInput = {
  channelId: string;
  conversationId: string;
  to: string;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker";
  text?: string;
  mediaUrl?: string;
  filename?: string;
  caption?: string;
};

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SendInput) => ({
    channelId: String(d?.channelId ?? ""),
    conversationId: String(d?.conversationId ?? ""),
    to: String(d?.to ?? ""),
    type: (d?.type ?? "text") as SendInput["type"],
    text: d?.text ?? "",
    mediaUrl: d?.mediaUrl ?? "",
    filename: d?.filename ?? "",
    caption: d?.caption ?? "",
  }))
  .handler(async ({ context, data }) => {
    const ch = await findChannel(data.channelId);
    if (!ch.phoneNumberId) throw new Error("Canal sem phone_number_id (não conectado ainda)");

    const body: any = {
      messaging_product: "whatsapp",
      to: data.to,
      type: data.type,
    };
    if (data.type === "text") {
      if (!data.text) throw new Error("Texto vazio");
      body.text = { body: data.text };
    } else if (data.type === "audio") {
      if (!data.mediaUrl) throw new Error("URL da mídia ausente");
      // Convert to OGG/Opus mono so WhatsApp renders as a voice note with waveform.
      let voiceUrl = data.mediaUrl;
      try {
        const { convertAudioToWhatsappVoice } = await import("@/lib/transloadit.server");
        voiceUrl = await convertAudioToWhatsappVoice(data.mediaUrl);
      } catch (e) {
        console.error("Transloadit voice conversion failed, sending original audio:", e);
      }
      body.audio = { link: voiceUrl, voice: true };
    } else if (data.type === "image" || data.type === "video" || data.type === "sticker") {
      if (!data.mediaUrl) throw new Error("URL da mídia ausente");
      body[data.type] = { link: data.mediaUrl, ...(data.caption && data.type !== "sticker" ? { caption: data.caption } : {}) };
    } else if (data.type === "document") {
      if (!data.mediaUrl) throw new Error("URL da mídia ausente");
      body.document = { link: data.mediaUrl, filename: data.filename || "arquivo", ...(data.caption ? { caption: data.caption } : {}) };
    }

    const { body: resp } = await metaProxyForChannel(ch, `/v23.0/${ch.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const waMsgId = resp?.messages?.[0]?.id ?? null;

    const { error } = await context.supabase.from("wa_messages" as any).insert({
      conversation_id: data.conversationId,
      channel_id: data.channelId,
      wa_message_id: waMsgId,
      direction: "out",
      msg_type: data.type,
      text_body: data.type === "text" ? data.text : null,
      media_url: data.type !== "text" ? data.mediaUrl : null,
      media_filename: data.filename || null,
      caption: data.caption || null,
      from_wa_id: ch.phoneNumberId,
      to_wa_id: data.to,
      status: "sent",
      sent_by: context.userId,
    });
    if (error) console.error("insert outgoing msg", error);

    await context.supabase
      .from("wa_conversations" as any)
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: previewForOut(data),
        last_message_direction: "out",
      })
      .eq("id", data.conversationId);

    return { ok: true, waMsgId };
  });

function previewForOut(d: SendInput): string {
  switch (d.type) {
    case "text": return d.text?.slice(0, 120) ?? "";
    case "image": return "📷 Imagem" + (d.caption ? ` — ${d.caption}` : "");
    case "audio": return "🎤 Áudio";
    case "video": return "🎬 Vídeo" + (d.caption ? ` — ${d.caption}` : "");
    case "document": return `📄 ${d.filename || "Documento"}`;
    case "sticker": return "🎭 Figurinha";
    default: return "";
  }
}

// Resolve a media_id returned in webhook → returns a download URL we can fetch via EvoHub.
export const resolveIncomingMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string; mediaId: string }) => ({
    channelId: String(d?.channelId ?? ""),
    mediaId: String(d?.mediaId ?? ""),
  }))
  .handler(async ({ data }) => {
    const ch = await findChannel(data.channelId);
    const { body: resp } = await metaProxyForChannel(ch, `/v23.0/${data.mediaId}`);
    return { url: resp?.url as string | undefined, mime: resp?.mime_type as string | undefined };
  });

// Download a media URL (proxied through EvoHub) and stream the bytes back as base64 so the browser can render it.
export const downloadIncomingMediaBase64 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string; mediaId: string }) => ({
    channelId: String(d?.channelId ?? ""),
    mediaId: String(d?.mediaId ?? ""),
  }))
  .handler(async ({ data }) => {
    const ch = await findChannel(data.channelId);
    const { body: meta, token } = await metaProxyForChannel(ch, `/v23.0/${data.mediaId}`);
    const url = meta?.url as string | undefined;
    const mime = (meta?.mime_type as string | undefined) ?? "application/octet-stream";
    if (!url) throw new Error("URL de mídia não encontrada");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Download mídia falhou (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), mime };
  });

// --- Webhook registration ---

export const registerWhatsappWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { webhookUrl: string }) => ({ webhookUrl: String(d?.webhookUrl ?? "") }))
  .handler(async ({ data }) => {
    if (!data.webhookUrl) throw new Error("webhookUrl obrigatório");
    const secret = process.env.EVOHUB_WEBHOOK_SECRET;
    if (!secret) throw new Error("EVOHUB_WEBHOOK_SECRET não configurado");

    // Check if a webhook with this URL already exists
    const existing = await evoApi("/api/v1/webhooks").catch(() => null);
    const list: any[] = Array.isArray(existing) ? existing : existing?.data ?? existing?.webhooks ?? [];
    const found = list.find((w) => w?.url === data.webhookUrl);
    if (found) {
      return { ok: true, webhookId: found.id, message: "Webhook já registrado" };
    }

    const created = await evoApi("/api/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({
        name: "Multium Chat",
        url: data.webhookUrl,
        events: [],
        secret,
        channel_types: ["whatsapp"],
        all_channels: true,
      }),
    });
    return { ok: true, webhookId: created?.id ?? null, message: "Webhook registrado" };
  });

// Associate a conversation with an operação (workspace)
export const setConversationOperacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; operacaoId: string | null }) => ({
    conversationId: String(d?.conversationId ?? ""),
    operacaoId: d?.operacaoId ?? null,
  }))
  .handler(async ({ context, data }) => {
    await context.supabase
      .from("wa_conversations" as any)
      .update({ operacao_id: data.operacaoId })
      .eq("id", data.conversationId);
    return { ok: true };
  });
