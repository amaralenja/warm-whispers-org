// Supabase Edge Function: WhatsApp webhook (EvoHub → Supabase)
// Public URL: https://wvcwrozwnwdlpandwubp.supabase.co/functions/v1/whatsapp-webhook
// Configure EVOHUB_WEBHOOK_SECRET as Edge Function secret if you want signature validation.
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
  const provided = signature.trim().toLowerCase();
  const expectedWithPrefix = `sha256=${hex}`;
  const expectedRaw = hex;
  const expected = provided.startsWith("sha256=") ? expectedWithPrefix : expectedRaw;
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
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
    case "button": return m.button?.text ?? "Botão";
    case "interactive": return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "Interação";
    default: return `[${m.type ?? "mensagem"}]`;
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
const AUTO_IMPORT_WHATSAPP_NAMES = ["amaral"];

type ChannelInfo = {
  id: string;
  phone_number_id: string | null;
  operacao_id: string | null;
  display_phone_number?: string | null;
};

type NormalizedChange = {
  channelId: string | null;
  phoneNumberId: string | null;
  displayPhone: string | null;
  contacts: any[];
  messages: any[];
  statuses: any[];
};

// Cache connected channels for 60s to avoid hitting EvoHub on every webhook
let channelsCache: { at: number; list: ChannelInfo[] } | null = null;

function normalizeMetadata(metadata: any): Record<string, any> {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof metadata === "object" ? metadata : {};
}

function getMetaConnection(c: any) {
  const meta = normalizeMetadata(c?.metadata);
  return c?.meta_connection ?? meta?.meta_connection ?? null;
}

function getPhoneInfo(c: any) {
  const metaConnection = getMetaConnection(c);
  const firstPhone = Array.isArray(metaConnection?.phone_numbers) ? metaConnection.phone_numbers[0] : null;
  return {
    phoneNumberId: metaConnection?.phone_number_id ?? firstPhone?.id ?? c?.phone_number_id ?? null,
    displayPhoneNumber: metaConnection?.phone_number ?? firstPhone?.display_phone_number ?? c?.display_phone_number ?? null,
    verifiedName: metaConnection?.display_name ?? firstPhone?.verified_name ?? c?.verified_name ?? null,
    qualityRating: firstPhone?.quality_rating ?? c?.quality_rating ?? null,
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function shouldAutoImport(c: any) {
  const name = normalizeText(String(c?.name ?? ""));
  return AUTO_IMPORT_WHATSAPP_NAMES.some((allowed) => name === normalizeText(allowed));
}

function isWhatsappChannel(c: any) {
  const type = String(c?.type ?? "").toLowerCase();
  return type === "whatsapp" || type === "unified" || type.includes("whatsapp");
}

function toChannelInfo(c: any, fallbackOperacao?: string | null): ChannelInfo | null {
  if (!c?.id) return null;
  const meta = normalizeMetadata(c?.metadata);
  const info = getPhoneInfo(c);
  return {
    id: String(c.id),
    phone_number_id: info.phoneNumberId ? String(info.phoneNumberId) : null,
    operacao_id:
      (typeof c.operacao_id === "string" && c.operacao_id) ? c.operacao_id
      : (typeof meta.operacao_id === "string" && meta.operacao_id) ? meta.operacao_id
      : fallbackOperacao ?? null,
    display_phone_number: info.displayPhoneNumber ? String(info.displayPhoneNumber) : null,
  };
}

async function upsertLocalChannel(supabase: any, c: any, operacaoId?: string | null) {
  const info = getPhoneInfo(c);
  const meta = normalizeMetadata(c?.metadata);
  if (!c?.id) return;
  const { error } = await supabase.from("wa_channels").upsert({
    id: String(c.id),
    name: String(c.name ?? "WhatsApp"),
    type: String(c.type ?? "whatsapp"),
    status: String(c.status ?? "active"),
    token: c.token ? String(c.token) : null,
    metadata: { ...meta, app_source: APP_SOURCE, operacao_id: operacaoId ?? meta.operacao_id ?? null, meta_connection: getMetaConnection(c) ?? meta.meta_connection ?? null },
    operacao_id: operacaoId ?? (typeof meta.operacao_id === "string" ? meta.operacao_id : null),
    phone_number_id: info.phoneNumberId,
    display_phone_number: info.displayPhoneNumber,
    verified_name: info.verifiedName,
    quality_rating: info.qualityRating,
    app_source: APP_SOURCE,
    synced_at: new Date().toISOString(),
    updated_at: c.updated_at ?? new Date().toISOString(),
    created_at: c.created_at ?? null,
  }, { onConflict: "id" });
  if (error) console.warn("[wa-webhook] wa_channels upsert falhou", error.message);
}

async function getConnectedChannels(supabase: any): Promise<ChannelInfo[]> {
  const now = Date.now();
  if (channelsCache && now - channelsCache.at < 60_000) return channelsCache.list;

  const byId = new Map<string, ChannelInfo>();

  // Local registry is the source of truth for numbers connected/imported inside Motion.
  const { data: localRows, error: localError } = await supabase
    .from("wa_channels")
    .select("id,name,type,status,token,metadata,operacao_id,phone_number_id,display_phone_number,verified_name,quality_rating,app_source")
    .eq("app_source", APP_SOURCE);

  if (localError) {
    console.warn("[wa-webhook] falha lendo wa_channels", localError.message);
  } else {
    for (const row of localRows ?? []) {
      const info = toChannelInfo(row);
      if (info) byId.set(info.id, info);
    }
  }

  // EvoHub enrichment keeps phone_number_id fresh and allows the explicit Amaral import.
  const key = Deno.env.get("EVOHUB_API_KEY");
  if (key) {
    try {
      const res = await fetch(`${EVOHUB_BASE}/api/v1/channels`, {
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.channels ?? [];
        const candidates = list.filter((c) => {
          if (!isWhatsappChannel(c)) return false;
          const meta = normalizeMetadata(c?.metadata);
          return byId.has(String(c.id)) || meta?.app_source === APP_SOURCE || meta?.appSource === APP_SOURCE || shouldAutoImport(c);
        });

        for (const c of candidates) {
          let full = c;
          if (!getPhoneInfo(c).phoneNumberId) {
            const detail = await fetch(`${EVOHUB_BASE}/api/v1/channels/${c.id}`, {
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            }).catch(() => null);
            if (detail?.ok) full = await detail.json();
          }

          const previous = byId.get(String(full.id));
          const fallbackOperacao = previous?.operacao_id ?? (shouldAutoImport(full) ? "Caio" : null);
          const info = toChannelInfo(full, fallbackOperacao);
          if (info) {
            byId.set(info.id, { ...previous, ...info, operacao_id: info.operacao_id ?? previous?.operacao_id ?? null });
            await upsertLocalChannel(supabase, full, info.operacao_id ?? previous?.operacao_id ?? null).catch(() => null);
          }
        }
      } else {
        console.error("[wa-webhook] EvoHub channels HTTP", res.status);
      }
    } catch (e) {
      console.error("[wa-webhook] erro buscando channels", e);
    }
  } else {
    console.warn("[wa-webhook] EVOHUB_API_KEY ausente; usando apenas wa_channels local");
  }

  const list = Array.from(byId.values());
  channelsCache = { at: now, list };
  return list;
}

function normalizeTimestamp(value: any): string {
  if (value == null || value === "") return String(Math.floor(Date.now() / 1000));
  if (typeof value === "number") return String(value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value));
  const raw = String(value);
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return String(n > 10_000_000_000 ? Math.floor(n / 1000) : n);
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? String(Math.floor(parsed / 1000)) : String(Math.floor(Date.now() / 1000));
}

function stableHash(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

function inferMessageType(raw: any): string {
  if (raw?.type) return String(raw.type);
  for (const type of ["text", "image", "audio", "video", "document", "sticker", "location", "interactive", "button"]) {
    if (raw?.[type] != null) return type;
  }
  if (raw?.media_id || raw?.media?.id) return String(raw?.media_type ?? raw?.mime_type ?? "document").split("/")[0];
  return "text";
}

function getTextBody(raw: any, props: any): string | null {
  if (typeof raw?.text === "string") return raw.text;
  if (typeof raw?.text?.body === "string") return raw.text.body;
  if (typeof raw?.body === "string") return raw.body;
  if (typeof raw?.message === "string") return raw.message;
  if (typeof props?.text === "string") return props.text;
  if (typeof props?.body === "string") return props.body;
  return null;
}

function normalizeEvoHubMessage(raw: any, props: any, payload: any, fallbackSeed: string): any | null {
  const type = inferMessageType(raw);
  const from = raw?.from ?? props?.from ?? raw?.wa_id ?? props?.wa_id ?? raw?.sender?.id ?? props?.sender?.id ?? props?.contact?.wa_id;
  if (!from) return null;

  const timestamp = normalizeTimestamp(raw?.timestamp ?? props?.timestamp ?? payload?.occurred_at ?? payload?.created_at);
  const text = getTextBody(raw, props);
  const id = raw?.id ?? props?.message_id ?? props?.id ?? `evo_${stableHash(`${fallbackSeed}:${from}:${timestamp}:${type}:${text ?? ""}`)}`;

  const normalized: any = {
    ...raw,
    id: String(id),
    from: String(from),
    timestamp,
    type,
  };

  if (type === "text") {
    normalized.text = typeof raw?.text === "object" && raw.text?.body != null ? raw.text : { body: text ?? "" };
  }

  const mediaId = raw?.media_id ?? raw?.media?.id ?? raw?.[type]?.id;
  if (mediaId && ["image", "audio", "video", "document", "sticker"].includes(type) && !normalized[type]) {
    normalized[type] = {
      id: mediaId,
      mime_type: raw?.mime_type ?? raw?.media?.mime_type ?? null,
      filename: raw?.filename ?? raw?.media?.filename ?? null,
      caption: raw?.caption ?? raw?.media?.caption ?? null,
    };
  }

  return normalized;
}

function extractNormalizedChanges(payload: any, deliveryId: string | null): NormalizedChange[] {
  const changes: NormalizedChange[] = [];

  // Raw Meta passthrough: { object: "whatsapp_business_account", entry: [...] }
  const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const entryChanges: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of entryChanges) {
      if (change?.field !== "messages") continue;
      const value = change.value ?? {};
      changes.push({
        channelId: null,
        phoneNumberId: value?.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null,
        displayPhone: value?.metadata?.display_phone_number ? String(value.metadata.display_phone_number) : null,
        contacts: Array.isArray(value?.contacts) ? value.contacts : [],
        messages: Array.isArray(value?.messages) ? value.messages : [],
        statuses: Array.isArray(value?.statuses) ? value.statuses : [],
      });
    }
  }

  // EvoHub envelope: { event: "event_received", channel_id, properties: { from, message } }
  const eventName = payload?.event ?? payload?.event_type;
  const props = payload?.properties ?? {};
  if (eventName === "event_received") {
    if (Array.isArray(props?.entry)) {
      changes.push(...extractNormalizedChanges(props, deliveryId));
    }

    const channelId = payload?.channel_id ?? props?.channel_id ?? props?.channel?.id ?? null;
    const phoneNumberId = props?.phone_number_id ?? props?.metadata?.phone_number_id ?? null;
    const displayPhone = props?.display_phone_number ?? props?.metadata?.display_phone_number ?? null;
    const contacts = Array.isArray(props?.contacts)
      ? props.contacts
      : props?.from
        ? [{ wa_id: String(props.from), profile: { name: props?.name ?? props?.contact?.name ?? props?.profile?.name } }]
        : [];

    const rawMessages = Array.isArray(props?.messages)
      ? props.messages
      : Array.isArray(props?.message)
        ? props.message
        : props?.message
          ? [props.message]
          : (props?.type || props?.text || props?.body || props?.media_id)
            ? [props]
            : [];

    const messages = rawMessages
      .map((m: any, index: number) => normalizeEvoHubMessage(m, props, payload, `${deliveryId ?? "delivery"}:${channelId ?? phoneNumberId ?? "channel"}:${index}`))
      .filter(Boolean);

    const statuses = Array.isArray(props?.statuses)
      ? props.statuses
      : props?.status
        ? [props.status]
        : [];

    if (channelId || phoneNumberId || messages.length || statuses.length) {
      changes.push({
        channelId: channelId ? String(channelId) : null,
        phoneNumberId: phoneNumberId ? String(phoneNumberId) : null,
        displayPhone: displayPhone ? String(displayPhone) : null,
        contacts,
        messages,
        statuses,
      });
    }
  }

  return changes;
}

async function handleLifecycleEvent(supabase: any, payload: any) {
  const eventName = payload?.event ?? payload?.event_type;
  if (!["channel_connected", "channel_disconnected", "channel_auto_imported"].includes(eventName)) return;

  const channelId = payload?.channel_id;
  if (!channelId) return;

  const { data: existing } = await supabase
    .from("wa_channels")
    .select("id,operacao_id,metadata")
    .eq("id", String(channelId))
    .eq("app_source", APP_SOURCE)
    .maybeSingle();

  // Do not import unrelated EvoHub channels from lifecycle events.
  if (!existing) {
    console.log("[wa-webhook] lifecycle ignorado para canal fora da Motion", channelId);
    return;
  }

  const meta = normalizeMetadata(existing.metadata);
  await upsertLocalChannel(supabase, {
    id: String(channelId),
    name: payload?.channel_name ?? "WhatsApp",
    type: payload?.channel_type ?? "whatsapp",
    status: eventName === "channel_disconnected" ? "inactive" : "active",
    token: payload?.channel_token,
    metadata: { ...meta, meta_connection: payload?.meta_connection ?? meta.meta_connection ?? null },
    meta_connection: payload?.meta_connection ?? meta.meta_connection ?? null,
  }, existing.operacao_id ?? meta.operacao_id ?? null);
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
  const requireSignature = Deno.env.get("REQUIRE_EVOHUB_SIGNATURE") === "true";
  if (secret) {
    const validSignature = await verifySignature(raw, sig, secret);
    if (!validSignature) {
      console.warn("[wa-webhook] assinatura ausente/inválida; processando com filtro de canais Motion", { hasSignature: Boolean(sig) });
      if (requireSignature) return new Response("Invalid signature", { status: 401, headers: corsHeaders });
    }
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
    await handleLifecycleEvent(supabase, payload);

    // Load connected/imported numbers registered inside Motion.
    const connected = await getConnectedChannels(supabase);
    const allowedByPhoneId = new Map(connected.filter((c) => c.phone_number_id).map((c) => [c.phone_number_id!, c]));
    const allowedByChannelId = new Map(connected.map((c) => [c.id, c]));
    const deliveryId = req.headers.get("x-hub-delivery-id") ?? payload?.delivery_id ?? payload?.id ?? null;
    const normalizedChanges = extractNormalizedChanges(payload, deliveryId);

    console.log("[wa-webhook] payload recebido", {
      event: payload?.event ?? payload?.event_type ?? payload?.object ?? "unknown",
      changes: normalizedChanges.length,
      motionChannels: connected.length,
    });

    for (const change of normalizedChanges) {
      const matched =
        (change.channelId ? allowedByChannelId.get(change.channelId) : undefined) ??
        (change.phoneNumberId ? allowedByPhoneId.get(change.phoneNumberId) : undefined);

      // FILTER: only process messages for numbers connected/imported through Motion.
      if (!matched) {
        console.log("[wa-webhook] ignorando canal/número não conectado na Motion", {
          channelId: change.channelId,
          phoneNumberId: change.phoneNumberId,
        });
        continue;
      }

      const channelId = matched.id;
      const phoneNumberId = change.phoneNumberId ?? matched.phone_number_id;
      const displayPhone = change.displayPhone ?? matched.display_phone_number ?? phoneNumberId;

      const contacts: any[] = Array.isArray(change.contacts) ? change.contacts : [];
      const nameByWaId: Record<string, string> = {};
      for (const c of contacts) {
        if (c?.wa_id) nameByWaId[String(c.wa_id)] = c?.profile?.name ?? c?.name ?? String(c.wa_id);
      }

      const messages: any[] = Array.isArray(change.messages) ? change.messages : [];
      for (const m of messages) {
        if (!m?.from) continue;
        const contactName = nameByWaId[m.from] ?? m.profile?.name ?? m.from;
        const timestampMs = parseInt(normalizeTimestamp(m.timestamp), 10) * 1000;

        const { data: conv, error: convErr } = await supabase
          .from("wa_conversations")
          .upsert({
            channel_id: channelId,
            phone_number_id: phoneNumberId,
            contact_wa_id: String(m.from),
            contact_name: contactName,
            operacao_id: matched.operacao_id,
            last_message_at: new Date(timestampMs).toISOString(),
            last_message_preview: previewFor(m),
            last_message_direction: "in",
          }, { onConflict: "channel_id,contact_wa_id" })
          .select("id, unread_count")
          .single();

        if (convErr || !conv) {
          console.error("[wa-webhook] upsert conv error", convErr);
          continue;
        }

        await supabase
          .from("wa_conversations")
          .update({ unread_count: ((conv as any).unread_count ?? 0) + 1 })
          .eq("id", (conv as any).id);

        // Cria lead no CRM da operação se ainda não existir (por telefone + expert)
        if (matched.operacao_id) {
          const phone = String(m.from);
          const { data: existing } = await supabase
            .from("crm_leads")
            .select("id")
            .eq("expert", matched.operacao_id)
            .eq("telefone", phone)
            .limit(1)
            .maybeSingle();
          if (!existing) {
            await supabase.from("crm_leads").insert({
              nome: contactName || phone,
              telefone: phone,
              expert: matched.operacao_id,
              fonte: "WhatsApp",
              status: "novo",
              ultima_interacao: new Date(timestampMs).toISOString(),
              dados: {
                origem: "whatsapp_webhook",
                channel_id: channelId,
                conversation_id: (conv as any).id,
              },
            });
          } else {
            await supabase
              .from("crm_leads")
              .update({ ultima_interacao: new Date(timestampMs).toISOString() })
              .eq("id", (existing as any).id);
          }
        }

        const media = extractMedia(m);
        const interactive = m.interactive;
        const buttonId = interactive?.button_reply?.id ?? interactive?.list_reply?.id ?? m.button?.payload ?? null;
        const buttonText = interactive?.button_reply?.title ?? interactive?.list_reply?.title ?? m.button?.text ?? null;

        const { error: msgErr } = await supabase.from("wa_messages").upsert({
          conversation_id: (conv as any).id,
          channel_id: channelId,
          wa_message_id: String(m.id),
          direction: "in",
          msg_type: m.type ?? "text",
          text_body: m.text?.body ?? buttonText ?? null,
          media_id: media?.id ?? null,
          media_mime: media?.mime ?? null,
          media_filename: media?.filename ?? null,
          caption: media?.caption ?? null,
          from_wa_id: String(m.from),
          to_wa_id: displayPhone,
          reply_to: m.context?.id ?? null,
          raw: m,
          status: "delivered",
        }, { onConflict: "channel_id,wa_message_id" });

        if (msgErr) console.error("[wa-webhook] upsert msg error", msgErr);
      }

      const statuses: any[] = Array.isArray(change.statuses) ? change.statuses : [];
      for (const s of statuses) {
        const statusId = s?.id ?? s?.message_id;
        const status = s?.status ?? s?.value;
        if (!statusId || !status) continue;
        await supabase
          .from("wa_messages")
          .update({ status })
          .eq("channel_id", channelId)
          .eq("wa_message_id", statusId);
      }
    }
  } catch (e) {
    console.error("[wa-webhook] processing error", e);
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
