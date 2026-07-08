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

// Detecta edições de mensagem — Meta/EvoHub podem entregar como
// type "message_edit" / "message_edited" / flag edited=true / campo edited_message.
// Retorna o corpo novo e (quando disponível) o id da mensagem original.
function extractEditedMessage(m: any): { body: string; originalId?: string } | null {
  const t = String(m?.type ?? "").toLowerCase();
  const flagged =
    t === "message_edit" ||
    t === "message_edited" ||
    t === "edited" ||
    m?.edited === true ||
    m?.is_edit === true ||
    m?.edited_message != null ||
    m?.message_edit != null;
  if (!flagged) return null;
  const body =
    m?.edited_message?.text?.body ??
    m?.message_edit?.text?.body ??
    m?.edited?.text?.body ??
    m?.edited?.body ??
    m?.text?.body ??
    (typeof m?.text === "string" ? m.text : null) ??
    m?.body ??
    "";
  const originalId =
    m?.context?.id ??
    m?.edited_message?.id ??
    m?.message_edit?.id ??
    m?.original_message_id ??
    undefined;
  return { body: String(body ?? ""), originalId: originalId ? String(originalId) : undefined };
}

// A Cloud API oficial entrega edição de mensagem como "unsupported" quando a conta
// ainda não tem suporte ao conteúdo editado. Nesse caso não existe mídia real pra
// baixar nem texto novo confiável; registrar isso como documento polui a conversa.
function isUnsupportedEditMessage(m: any): boolean {
  const t = String(m?.type ?? "").toLowerCase();
  const unsupportedType = String(m?.unsupported?.type ?? "").toLowerCase();
  if (t === "unsupported" && unsupportedType === "edit") return true;
  const errors = Array.isArray(m?.errors) ? m.errors : [];
  return t === "unsupported" && errors.some((err: any) => {
    const code = String(err?.code ?? "");
    const details = String(err?.error_data?.details ?? err?.message ?? err?.title ?? "").toLowerCase();
    return code === "131051" && details.includes("message type");
  });
}

// Baixa a mídia VIA PROXY do EvoHub (/meta/*). Bater direto em graph.facebook.com
// com o channel token retorna 401 — o Hub que troca pelo token oficial Meta.
async function downloadMetaMedia(token: string, mediaId: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    // 1) resolve media_id pelo proxy — o Hub reescreve a URL para /meta/_media?token=...
    const metaRes = await fetch(`https://api.evohub.ai/meta/v23.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      console.warn("[wa-webhook] evohub media metadata HTTP", metaRes.status, await metaRes.text().catch(() => ""));
      return null;
    }
    const meta = await metaRes.json();
    const url = meta?.url as string | undefined;
    const mime = (meta?.mime_type as string | undefined) ?? "application/octet-stream";
    if (!url) return null;
    // 2) baixa os bytes da URL reescrita (precisa do channel token também)
    const fileRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) {
      console.warn("[wa-webhook] evohub media download HTTP", fileRes.status);
      return null;
    }
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    return { bytes: buf, mime };
  } catch (e) {
    console.warn("[wa-webhook] downloadMetaMedia erro", (e as any)?.message ?? e);
    return null;
  }
}

async function probeMetaToken(token: string, phoneNumberId?: string | null): Promise<boolean> {
  if (!token || !phoneNumberId) return false;
  try {
    const res = await fetch(`${EVOHUB_BASE}/meta/v23.0/${phoneNumberId}?fields=id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function extToMime(mime: string) {
  const m = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav",
    "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
    "application/pdf": "pdf",
  };
  return map[m] ?? (m.split("/")[1] || "bin");
}

const APP_SOURCE = "lovable-crm";
const EVOHUB_BASE = "https://api.evohub.ai";
const AUTO_IMPORT_WHATSAPP_NAMES = ["amaral"];

type ChannelInfo = {
  id: string;
  phone_number_id: string | null;
  operacao_id: string | null;
  display_phone_number?: string | null;
  token?: string | null;
  usable_token?: string | null;
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
let evoRawChannelsCache: { at: number; list: any[] } | null = null;

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
    token: c.token ? String(c.token) : null,
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

async function getEvoRawChannels(): Promise<any[]> {
  const now = Date.now();
  if (evoRawChannelsCache && now - evoRawChannelsCache.at < 60_000) return evoRawChannelsCache.list;

  const key = Deno.env.get("EVOHUB_API_KEY");
  if (!key) return [];
  try {
    const res = await fetch(`${EVOHUB_BASE}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.channels ?? [];
    const full = await Promise.all(list.map(async (c) => {
      try {
        const detail = await fetch(`${EVOHUB_BASE}/api/v1/channels/${c.id}`, {
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        });
        return detail.ok ? await detail.json() : c;
      } catch {
        return c;
      }
    }));
    evoRawChannelsCache = { at: now, list: full };
    return full;
  } catch (e) {
    console.warn("[wa-webhook] erro buscando tokens EvoHub", (e as any)?.message ?? e);
    return [];
  }
}

async function resolveUsableToken(channel: ChannelInfo): Promise<string | null> {
  if (channel.usable_token) return channel.usable_token;
  if (channel.token && await probeMetaToken(channel.token, channel.phone_number_id)) {
    channel.usable_token = channel.token;
    return channel.token;
  }

  const all = await getEvoRawChannels();
  for (const c of all) {
    const token = c?.token ? String(c.token) : "";
    if (!token || token === channel.token) continue;
    if (await probeMetaToken(token, channel.phone_number_id)) {
      console.warn("[wa-webhook] usando token Meta alternativo para mídia", {
        channelId: channel.id,
        phoneNumberId: channel.phone_number_id,
        tokenChannelId: c.id,
      });
      channel.usable_token = token;
      return token;
    }
  }
  return channel.token ?? null;
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

function normalizeBrWhatsappNumber(raw: string): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8) return `55${ddd}9${rest}`;
  }
  return digits;
}

function brPhoneVariants(raw: string): string[] {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return [];
  let local = digits.startsWith("55") ? digits.slice(2) : digits;
  local = local.replace(/^0+/, "");
  if (local.length < 10 || local.length > 11) return [digits];
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  const sem9 = rest.length === 9 && rest.startsWith("9") ? rest.slice(1) : rest.length === 8 ? rest : null;
  const com9 = rest.length === 8 ? "9" + rest : rest.length === 9 ? rest : null;
  const out = new Set<string>([digits]);
  if (sem9) {
    out.add(`55${ddd}${sem9}`);
    out.add(`${ddd}${sem9}`);
  }
  if (com9) {
    out.add(`55${ddd}${com9}`);
    out.add(`${ddd}${com9}`);
  }
  return Array.from(out);
}

async function isAiAllowedContact(supabase: any, contactWa: string): Promise<boolean> {
  const variants = brPhoneVariants(contactWa);
  if (!variants.length) return false;
  const [{ data: vend }, { data: team }] = await Promise.all([
    supabase.from("vendedores").select("telefone").not("telefone", "is", null),
    supabase.from("team_members").select("telefone").not("telefone", "is", null),
  ]);
  const all = new Set<string>();
  for (const row of (vend ?? []) as any[]) brPhoneVariants(row.telefone).forEach((v) => all.add(v));
  for (const row of (team ?? []) as any[]) brPhoneVariants(row.telefone).forEach((v) => all.add(v));
  return variants.some((v) => all.has(v));
}

function money(v: any): string {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function monthRange() {
  const parts = todayIsoDate().split("-");
  return { start: `${parts[0]}-${parts[1]}-01`, today: todayIsoDate() };
}

function vendasDateExpr() {
  return `coalesce(to_date(nullif("Data",''), 'YYYY-MM-DD'), to_date(nullif("Data",''), 'DD/MM/YYYY'))`;
}

function b64url(buf: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof buf === "string") bytes = new TextEncoder().encode(buf);
  else if (buf instanceof ArrayBuffer) bytes = new Uint8Array(buf);
  else bytes = buf;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function pemToAb(pem: string): ArrayBuffer {
  const clean = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
let gcalTokenCache: { token: string; exp: number } | null = null;
async function getGcalToken(): Promise<string | null> {
  const raw = Deno.env.get("GOOGLE_CALENDAR_SERVICE_ACCOUNT");
  if (!raw) return null;
  const now = Math.floor(Date.now() / 1000);
  if (gcalTokenCache && gcalTokenCache.exp - 60 > now) return gcalTokenCache.token;
  try {
    const sa = JSON.parse(raw) as { client_email: string; private_key: string; token_uri?: string };
    const aud = sa.token_uri || "https://oauth2.googleapis.com/token";
    const header = { alg: "RS256", typ: "JWT" };
    const payload = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar", aud, iat: now, exp: now + 3600 };
    const enc = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const key = await crypto.subtle.importKey("pkcs8", pemToAb(sa.private_key.replace(/\\n/g, "\n")), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(enc));
    const jwt = `${enc}.${b64url(sig)}`;
    const res = await fetch(aud, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
    if (!res.ok) return null;
    const json = await res.json();
    gcalTokenCache = { token: json.access_token, exp: now + (json.expires_in || 3600) };
    return gcalTokenCache.token;
  } catch (e) {
    console.warn("[gcal] token error", (e as any)?.message);
    return null;
  }
}
async function fetchGcalEventsRange(fromIso: string, toIso: string): Promise<any[]> {
  const calId = Deno.env.get("GOOGLE_CALENDAR_ID");
  const token = await getGcalToken();
  if (!calId || !token) return [];
  const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "100", timeMin: fromIso, timeMax: toIso });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.warn("[gcal] list error", res.status); return []; }
  const json = await res.json();
  return (json.items || []) as any[];
}

async function patchGcalEvent(eventId: string, body: Record<string, unknown>) {
  const calId = Deno.env.get("GOOGLE_CALENDAR_ID");
  const token = await getGcalToken();
  if (!calId || !token || !eventId) return false;
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.warn("[gcal] patch error", res.status, await res.text().catch(() => ""));
  return res.ok;
}

async function getGcalEvent(eventId: string) {
  const calId = Deno.env.get("GOOGLE_CALENDAR_ID");
  const token = await getGcalToken();
  if (!calId || !token || !eventId) return null;
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn("[gcal] get event error", res.status, await res.text().catch(() => ""));
    return null;
  }
  return await res.json().catch(() => null);
}

async function markCalendarAttendance(eventId: string, action: { status: string; emoji: string; label: string }) {
  const event = await getGcalEvent(eventId);
  if (!event) return false;
  const cleanSummary = String(event.summary ?? "Call")
    .replace(/^(✅|❌|🔄)\s*/u, "")
    .trim();
  const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const previousDescription = String(event.description ?? "");
  const note = `${action.emoji} ${action.label} registrado via WhatsApp em ${stamp}`;
  return await patchGcalEvent(eventId, {
    summary: `${action.emoji} ${cleanSummary}`,
    description: previousDescription.includes(note) ? previousDescription : `${previousDescription}\n\n${note}`.trim(),
    extendedProperties: {
      private: {
        ...(event.extendedProperties?.private ?? {}),
        multium_attendance_status: action.status,
        multium_attendance_updated_at: new Date().toISOString(),
      },
    },
  });
}

async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fireShowUpEdge(supabase: any, rem: any) {
  const { data: cfg } = await supabase
    .from("meta_ads_config")
    .select("pixel_id, access_token, test_event_code, user_id")
    .not("pixel_id", "is", null)
    .not("access_token", "is", null)
    .limit(1)
    .maybeSingle();
  if (!cfg?.pixel_id || !cfg?.access_token) return { ok: false, reason: "no_meta_config" };

  const email = String(rem?.lead_email ?? "").trim().toLowerCase();
  const phone = String(rem?.contact_wa ?? "").replace(/\D/g, "");
  const [first, ...rest] = String(rem?.lead_nome ?? "").trim().split(/\s+/).filter(Boolean);
  const last = rest.join(" ");
  const externalId = String(rem?.lead_externalid || email || phone || "").trim();
  const eventId = crypto.randomUUID();
  const userData: Record<string, unknown> = {
    ...(email ? { em: [await sha256Hex(email)] } : {}),
    ...(phone ? { ph: [await sha256Hex(phone)] } : {}),
    ...(first ? { fn: [await sha256Hex(first.toLowerCase())] } : {}),
    ...(last ? { ln: [await sha256Hex(last.toLowerCase())] } : {}),
    ...(externalId ? { external_id: [await sha256Hex(externalId)] } : {}),
    ...(rem?.lead_fbp ? { fbp: rem.lead_fbp } : {}),
    ...(rem?.lead_fbc ? { fbc: rem.lead_fbc } : {}),
  };
  const payload: any = {
    data: [{
      event_name: "ShowUp",
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "phone_call",
      user_data: userData,
      custom_data: { content_name: "ShowUp - call confirmed via WhatsApp button", status: "showed_up" },
    }],
  };
  if (cfg.test_event_code) payload.test_event_code = cfg.test_event_code;
  const res = await fetch(`https://graph.facebook.com/v19.0/${cfg.pixel_id}/events?access_token=${encodeURIComponent(cfg.access_token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  const ok = res.ok && !json?.error;
  await supabase.from("meta_ads_event_logs").insert({
    user_id: cfg.user_id,
    event_name: "ShowUp",
    event_id: eventId,
    status: ok ? "success" : "error",
    events_received: json?.events_received ?? null,
    fbtrace_id: json?.fbtrace_id ?? null,
    error_message: ok ? null : (json?.error?.message ?? `HTTP ${res.status}`),
    email_hash: email ? await sha256Hex(email) : null,
    phone_hash: phone ? await sha256Hex(phone) : null,
    external_id_hash: externalId ? await sha256Hex(externalId) : null,
  });
  return { ok, eventId };
}

async function getAiSnapshot(supabase: any, contactWa: string, userText: string): Promise<string> {
  const today = todayIsoDate();
  const { start } = monthRange();
  const normalized = normalizeText(userText);
  const wantsFull = /relatorio|resumo|dashboard|geral|tudo|hoje|amanha|semana|venda|lead|task|tarefa|financeiro|quiz|call|agenda|reuniao|ads|anuncio|facebook/.test(normalized);
  if (!wantsFull) return "";

  // Google Calendar: hoje + amanhã (BRT)
  const todayStartUtc = new Date(`${today}T03:00:00.000Z`).toISOString();
  const tomorrowEndUtc = new Date(new Date(`${today}T03:00:00.000Z`).getTime() + 2 * 86400_000).toISOString();
  const gcalEvents = await fetchGcalEventsRange(todayStartUtc, tomorrowEndUtc).catch(() => []);
  const fmtBr = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const isToday = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) === today;
  const callsHoje = gcalEvents.filter((e) => { const s = e.start?.dateTime || e.start?.date; return s && isToday(s); });
  const callsAmanha = gcalEvents.filter((e) => { const s = e.start?.dateTime || e.start?.date; return s && !isToday(s); });
  const callsHojeStr = callsHoje.length
    ? callsHoje.slice(0, 15).map((e) => `${fmtBr(e.start.dateTime || e.start.date)} — ${e.summary || "(sem título)"}`).join("; ")
    : "nenhuma agendada";
  const callsAmanhaStr = callsAmanha.length
    ? callsAmanha.slice(0, 10).map((e) => `${fmtBr(e.start.dateTime || e.start.date)} — ${e.summary || "(sem título)"}`).join("; ")
    : "nenhuma agendada";


  const [salesToday, leadsToday, tasks, financeMonth, quizToday, callsToday, callsMonth, capiToday] = await Promise.all([
    supabase.from("vendas").select('"Ticket",nome_expert,"Nome","Data"'),
    supabase.from("crm_leads").select("id,expert,status,responsavel_nome,created_at").gte("created_at", `${today}T00:00:00-03:00`),
    supabase.from("tasks").select("titulo,prazo,prioridade,concluida,assignee_ids").eq("concluida", false).order("prazo", { ascending: true }).limit(20),
    supabase.from("financeiro").select("tipo,valor,status,data_ref,data_vencimento").gte("data_ref", start).lte("data_ref", today),
    supabase.from("ht_leads").select("id,status,valor,created_at").gte("created_at", `${today}T00:00:00-03:00`),
    supabase.from("wa_call_reminders").select("status,kind,hora,lead_nome,created_at").gte("created_at", `${today}T00:00:00-03:00`),
    supabase.from("wa_call_reminders").select("status,kind,created_at").gte("created_at", `${start}T00:00:00-03:00`),
    supabase.from("meta_ads_event_logs").select("event_name,status,value,created_at").gte("created_at", `${today}T00:00:00-03:00`),
  ]);

  const salesRows = ((salesToday.data ?? []) as any[]).filter((r) => String(r.Data ?? "").includes(today) || String(r.Data ?? "").includes(today.split("-").reverse().join("/")));
  const salesTotal = salesRows.reduce((acc, r) => acc + Number(String(r.Ticket ?? "0").replace(/[^\d,.-]/g, "").replace(".", "").replace(",", ".") || 0), 0);
  const bySeller = new Map<string, { count: number; value: number }>();
  for (const r of salesRows) {
    const name = r.nome_expert || "Sem vendedor";
    const val = Number(String(r.Ticket ?? "0").replace(/[^\d,.-]/g, "").replace(".", "").replace(",", ".") || 0);
    const cur = bySeller.get(name) ?? { count: 0, value: 0 };
    cur.count += 1; cur.value += val; bySeller.set(name, cur);
  }
  const topSeller = Array.from(bySeller.entries()).sort((a, b) => b[1].value - a[1].value)[0];

  const leadRows = (leadsToday.data ?? []) as any[];
  const quizRows = (quizToday.data ?? []) as any[];
  const financeRows = (financeMonth.data ?? []) as any[];
  const entradas = financeRows.filter((r) => normalizeText(r.tipo) === "entrada").reduce((a, r) => a + Number(r.valor || 0), 0);
  const saidas = financeRows.filter((r) => normalizeText(r.tipo) === "saida" || normalizeText(r.tipo) === "despesa").reduce((a, r) => a + Number(r.valor || 0), 0);
  const callRowsToday = (callsToday.data ?? []) as any[];
  const callRowsMonth = (callsMonth.data ?? []) as any[];
  const callCount = (rows: any[], status: string) => rows.filter((r) => {
    const s = normalizeText(r.status);
    if (status === "show_up") return s === "showup" || s === "show_up";
    if (status === "no_show") return s === "noshow" || s === "no_show";
    if (status === "rescheduled") return s === "remarcada" || s === "rescheduled";
    return s === normalizeText(status);
  }).length;
  const tasksRows = (tasks.data ?? []) as any[];
  const adsRows = (capiToday.data ?? []) as any[];

  return [
    `CONTEXTO REAL DO SISTEMA (${today}, BRT):`,
    `Vendas hoje: ${salesRows.length} venda(s), total ${money(salesTotal)}. Top vendedor: ${topSeller ? `${topSeller[0]} (${topSeller[1].count} venda(s), ${money(topSeller[1].value)})` : "sem vendas registradas"}.`,
    `Leads CRM hoje: ${leadRows.length}. Por status: ${JSON.stringify(leadRows.reduce((a: any, r) => (a[r.status || "sem_status"] = (a[r.status || "sem_status"] || 0) + 1, a), {}))}.`,
    `Quiz/HighTicket hoje: ${quizRows.length} lead(s); qualificados 5k-10k+: ${quizRows.filter((r) => Number(r.valor || 0) >= 5000).length}.`,
    `Tasks pendentes carregadas: ${tasksRows.length}. Próximas: ${tasksRows.slice(0, 5).map((t) => `${t.titulo} (${t.prazo || "sem prazo"})`).join("; ") || "nenhuma"}.`,
    `Financeiro mês: entradas ${money(entradas)}, saídas ${money(saidas)}, saldo ${money(entradas - saidas)}.`,
    `Calls AGENDADAS hoje no Google Calendar (${callsHoje.length}): ${callsHojeStr}.`,
    `Calls AGENDADAS amanhã no Google Calendar (${callsAmanha.length}): ${callsAmanhaStr}.`,
    `Comparecimento registrado hoje (wa_call_reminders): ${callRowsToday.length}; show up ${callCount(callRowsToday, "show_up")}; no-show ${callCount(callRowsToday, "no_show")}; remarcadas ${callCount(callRowsToday, "rescheduled")}.`,
    `Comparecimento registrado mês: ${callRowsMonth.length}; show up ${callCount(callRowsMonth, "show_up")}; no-show ${callCount(callRowsMonth, "no_show")}; remarcadas ${callCount(callRowsMonth, "rescheduled")}.`,
    `Eventos Meta/CAPI hoje: ${adsRows.length}. Atenção: gasto de Ads depende da conexão Meta Ads estar configurada no módulo.`,

  ].join("\n");
}

async function transcribeAudioWithOpenAI(bytes: Uint8Array, mime: string): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return "";
  const ext = extToMime(mime || "audio/ogg");
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("language", "pt");
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  form.append("file", new Blob([copy.buffer], { type: mime || "audio/ogg" }), `audio.${ext}`);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI transcription HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return String(json.text || "").trim();
}

async function describeImageWithOpenAI(bytes: Uint8Array, mime: string, caption?: string | null): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return caption || "imagem recebida";
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const dataUrl = `data:${mime || "image/jpeg"};base64,${btoa(binary)}`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [{ role: "user", content: [
        { type: "text", text: `Descreva em português, objetivamente, a imagem recebida no WhatsApp. Legenda: ${caption || "sem legenda"}` },
        { type: "image_url", image_url: { url: dataUrl } },
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI vision HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content || caption || "imagem recebida").trim();
}

const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Cria uma tarefa no quadro de tarefas (Kanban) da Multum. Use quando o usuário pedir pra anotar/criar/adicionar uma tarefa, lembrete ou to-do.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título curto da tarefa" },
          descricao: { type: "string", description: "Detalhes opcionais" },
          prioridade: { type: "string", enum: ["baixa", "media", "alta", "urgente"], description: "Prioridade, default media" },
          prazo: { type: "string", description: "Prazo ISO 8601 (ex: 2026-07-01T15:00:00-03:00) — opcional" },
          assignee_nome: { type: "string", description: "Nome do responsável (opcional). Ex: 'Amaral'" },
        },
        required: ["titulo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Exclui/apaga/remove uma tarefa existente do quadro de tarefas da Multum. Use quando o usuário pedir para excluir, apagar, deletar ou remover uma tarefa. Se ele falar 'essa tarefa' ou 'a última', use o histórico da conversa para preencher o título; se não tiver título mas estiver claro que é a última tarefa criada, marque delete_latest=true.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título ou trecho do título da tarefa a excluir" },
          assignee_nome: { type: "string", description: "Nome do responsável, se o usuário citar. Ex: Amaral" },
          delete_latest: { type: "boolean", description: "Use true apenas quando o pedido for claramente para apagar a última tarefa citada/criada na conversa e não houver título explícito" },
        },
      },
    },
  },
];

async function loadRecentAiMessages(supabase: any, contactWa: string): Promise<any[]> {
  const { data } = await supabase
    .from("wa_ai_sessions")
    .select("messages")
    .eq("contact_wa", contactWa)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rows = Array.isArray(data?.messages) ? data.messages : [];
  return rows
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
    .slice(-10)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 1200) }));
}

function taskMatchScore(task: any, rawTitle: string) {
  const a = normalizeText(String(task?.titulo ?? ""));
  const b = normalizeText(rawTitle);
  if (!b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  const terms = b.split(/\s+/).filter((x) => x.length > 2);
  return terms.reduce((score, term) => score + (a.includes(term) ? 8 : 0), 0);
}

async function inferRecentTaskTitleFromHistory(supabase: any, contactWa: string): Promise<string> {
  const history = await loadRecentAiMessages(supabase, contactWa).catch(() => []);
  const text = history
    .map((m) => String(m.content ?? ""))
    .reverse()
    .join("\n");
  const patterns = [
    /tarefa\s+["“']([^"”']{3,160})["”']/i,
    /(?:criei|anotei|salvei|adicionei).*?["“']([^"”']{3,160})["”']/i,
    /(?:t[íi]tulo|tarefa)\s*:\s*([^\n.]{3,160})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

async function executeAiTool(supabase: any, name: string, args: any, contactWa: string): Promise<string> {
  try {
    if (name === "create_task") {
      const { data: col } = await supabase.from("task_columns").select("id,board_id,ordem").order("ordem", { ascending: true }).limit(1).maybeSingle();
      if (!col) return JSON.stringify({ ok: false, error: "Nenhum board/coluna padrão encontrado" });
      let assignee_ids: string[] = [];
      if (args.assignee_nome) {
        const { data: tm } = await supabase.from("team_members").select("id,nome").ilike("nome", `%${args.assignee_nome}%`).limit(1).maybeSingle();
        if (tm?.id) assignee_ids = [tm.id];
      }
      const row = {
        board_id: col.board_id,
        column_id: col.id,
        titulo: String(args.titulo).slice(0, 200),
        descricao: args.descricao ?? null,
        prioridade: args.prioridade ?? "media",
        prazo: args.prazo ?? null,
        assignee_ids,
      };
      const { data, error } = await supabase.from("tasks").insert(row).select("id,titulo").maybeSingle();
      if (error) return JSON.stringify({ ok: false, error: error.message });
      // Dispara template task_created via hook público da app (com supabaseAdmin lá dentro).
      let notified: any = null;
      if (data?.id) {
        try {
          const appUrl = Deno.env.get("NOTIFICATION_AI_APP_URL") || "https://project--4860a253-8e14-4836-a639-c7fb96d53545-dev.lovable.app";
          const r = await fetch(`${appUrl}/api/public/hooks/notify-task-created`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: data.id }),
          });
          notified = await r.json().catch(() => ({ ok: r.ok }));
        } catch (e) {
          notified = { ok: false, error: (e as any)?.message ?? String(e) };
        }
      }
      return JSON.stringify({ ok: true, id: data?.id, titulo: data?.titulo, assignee: args.assignee_nome ?? null, prazo: args.prazo ?? null, notified });
    }
    if (name === "delete_task") {
      let titulo = String(args?.titulo ?? "").trim();
      const deleteLatest = args?.delete_latest === true;
      const assigneeNome = String(args?.assignee_nome ?? "").trim();
      if (!titulo && deleteLatest) titulo = await inferRecentTaskTitleFromHistory(supabase, contactWa);
      if (!titulo) {
        return JSON.stringify({ ok: false, error: "Preciso do título da tarefa pra excluir com segurança." });
      }

      let assigneeIds: string[] = [];
      if (assigneeNome) {
        const { data: members } = await supabase
          .from("team_members")
          .select("id,nome")
          .ilike("nome", `%${assigneeNome}%`)
          .limit(5);
        assigneeIds = ((members ?? []) as any[]).map((m) => String(m.id));
      }

      let query = supabase
        .from("tasks")
        .select("id,titulo,prazo,created_at,assignee_ids,concluida")
        .order("created_at", { ascending: false })
        .limit(30);
      if (titulo) query = query.ilike("titulo", `%${titulo}%`);
      const { data: directRows, error: directError } = await query;
      if (directError) return JSON.stringify({ ok: false, error: directError.message });

      let rows = ((directRows ?? []) as any[]).filter((t) =>
        !assigneeIds.length || assigneeIds.some((id) => Array.isArray(t.assignee_ids) && t.assignee_ids.includes(id)),
      );

      if (titulo && !rows.length) {
        const { data: broadRows, error: broadError } = await supabase
          .from("tasks")
          .select("id,titulo,prazo,created_at,assignee_ids,concluida")
          .order("created_at", { ascending: false })
          .limit(80);
        if (broadError) return JSON.stringify({ ok: false, error: broadError.message });
        rows = ((broadRows ?? []) as any[])
          .filter((t) => taskMatchScore(t, titulo) >= 16)
          .filter((t) => !assigneeIds.length || assigneeIds.some((id) => Array.isArray(t.assignee_ids) && t.assignee_ids.includes(id)))
          .sort((a, b) => taskMatchScore(b, titulo) - taskMatchScore(a, titulo));
      }

      if (!rows.length) return JSON.stringify({ ok: false, error: "Não encontrei essa tarefa no sistema." });
      const target = rows[0];

      await supabase.from("wa_task_notifications").delete().eq("task_id", target.id);
      const { error: delError } = await supabase.from("tasks").delete().eq("id", target.id);
      if (delError) return JSON.stringify({ ok: false, error: delError.message });
      return JSON.stringify({ ok: true, deleted_id: target.id, titulo: target.titulo });
    }
    return JSON.stringify({ ok: false, error: `tool desconhecida: ${name}` });
  } catch (e) {
    return JSON.stringify({ ok: false, error: (e as any)?.message ?? String(e) });
  }
}

async function composeAiReply(supabase: any, contactWa: string, userText: string): Promise<string> {
  const clean = userText.trim();
  const norm = normalizeText(clean);
  if (/^(opa|oi|ol[áa]|bom dia|boa tarde|boa noite|e ai|e aí|\.)\W*$/.test(norm)) {
    return "Opa, tudo bem? Como posso te ajudar hoje? Pode pedir relatório, vendas, leads, tarefas, calls, financeiro, quiz ou Ads. Posso também criar e excluir tarefas pra você.";
  }
  const snapshot = await getAiSnapshot(supabase, contactWa, clean);
  const history = await loadRecentAiMessages(supabase, contactWa).catch(() => []);
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    const appReply = await composeAiReplyViaApp(clean, snapshot).catch((e) => {
      console.warn("[notif-ai edge] app OpenAI fallback falhou", (e as any)?.message ?? e);
      return "";
    });
    if (appReply) return appReply;
    if (snapshot) return `Fechou, chefe. Segue o que achei:\n\n${snapshot}`;
    return "Fechou, chefe. Recebi sua mensagem, mas a chave da OpenAI não está disponível no webhook agora.";
  }
  try {
    const messages: any[] = [
      { role: "system", content: "Você é a IA da Multum no WhatsApp do número de notificações. Responda em PT-BR natural, curto e informal profissional. Nunca invente número: use só contexto real. Quando o usuário pedir pra criar/anotar/adicionar uma tarefa, USE A TOOL create_task — não apenas diga que vai anotar. Quando pedir pra excluir/apagar/deletar/remover tarefa, USE A TOOL delete_task. Se ele falar 'essa tarefa' ou 'a última tarefa', use o histórico recente para identificar o título; se estiver claro que é a última tarefa criada e não houver título, use delete_latest=true. Confirme depois de executar." },
      ...(snapshot ? [{ role: "system", content: snapshot }] : []),
      ...history,
      { role: "user", content: clean },
    ];
    for (let i = 0; i < 3; i++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.35, tools: AI_TOOLS, messages }),
      });
      if (!res.ok) throw new Error(`OpenAI chat HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json();
      const msg = json.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls;
      if (toolCalls && toolCalls.length) {
        messages.push(msg);
        for (const tc of toolCalls) {
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
          const result = await executeAiTool(supabase, tc.function?.name, args, contactWa);
          messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
        continue;
      }
      return String(msg?.content || "Fechou, chefe. Como posso te ajudar?").trim();
    }
    return "Fechou, chefe. Executei o que pediu.";
  } catch (e) {
    const appReply = await composeAiReplyViaApp(clean, snapshot).catch(() => "");
    if (appReply) return appReply;
    throw e;
  }
}

async function composeAiReplyViaApp(userText: string, snapshot: string): Promise<string> {
  const appUrl = Deno.env.get("NOTIFICATION_AI_APP_URL") || "https://project--4860a253-8e14-4836-a639-c7fb96d53545-dev.lovable.app";
  const bridgeSecret = Deno.env.get("EVOHUB_WEBHOOK_SECRET") || "";
  const res = await fetch(`${appUrl}/api/public/notification-ai/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bridgeSecret}` },
    body: JSON.stringify({ userText, snapshot }),
  });
  if (!res.ok) throw new Error(`app reply HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return String(json?.reply || "").trim();
}

async function postWaText(token: string, phoneNumberId: string, to: string, text: string) {
  const payload = { messaging_product: "whatsapp", to: normalizeBrWhatsappNumber(to), type: "text", text: { body: text, preview_url: false } };
  let res = await fetch(`${EVOHUB_BASE}/meta/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let bodyText = await res.text();
  let json: any = null;
  try { json = bodyText ? JSON.parse(bodyText) : null; } catch { json = bodyText; }
  if (!res.ok) throw new Error(`Meta send HTTP ${res.status}: ${bodyText}`);
  return { waMsgId: json?.messages?.[0]?.id ?? null, payload };
}

async function persistAiSession(supabase: any, channelId: string, contactWa: string, userText: string, assistantText: string) {
  const { data: existing } = await supabase
    .from("wa_ai_sessions")
    .select("id,messages")
    .eq("channel_id", channelId)
    .eq("contact_wa", contactWa)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const messages = Array.isArray(existing?.messages) ? existing.messages : [];
  messages.push({ role: "user", content: userText, at: new Date().toISOString() });
  messages.push({ role: "assistant", content: assistantText, at: new Date().toISOString() });
  if (existing?.id) {
    await supabase.from("wa_ai_sessions").update({ messages, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("wa_ai_sessions").insert({ channel_id: channelId, contact_wa: contactWa, status: "active", messages, context: {} });
  }
}

async function runNotificationAiEdge(opts: {
  supabase: any;
  matched: ChannelInfo;
  channelId: string;
  phoneNumberId: string | null;
  conversationId: string;
  from: string;
  message: any;
  buttonText?: string | null;
  media?: any;
}) {
  const { supabase, matched, channelId, phoneNumberId, conversationId, from, message: m, buttonText, media } = opts;
  if (!phoneNumberId) throw new Error("notification channel sem phone_number_id");
  const allowed = await isAiAllowedContact(supabase, from);
  if (!allowed) {
    console.log("[notif-ai edge] contato fora da allowlist", { from });
    return;
  }
  let userText = String(m.text?.body ?? buttonText ?? media?.caption ?? "").trim();
  const token = await resolveUsableToken(matched);
  if (!token) throw new Error("notification channel sem token utilizável");

  if (!userText && media?.id && (m.type === "audio" || m.type === "image")) {
    const downloaded = await downloadMetaMedia(token, media.id);
    if (downloaded && m.type === "audio") userText = await transcribeAudioWithOpenAI(downloaded.bytes, downloaded.mime);
    if (downloaded && m.type === "image") userText = await describeImageWithOpenAI(downloaded.bytes, downloaded.mime, media.caption);
  }
  if (!userText) userText = `[${m.type || "mensagem"} recebida]`;

  const reply = await composeAiReply(supabase, from, userText);
  const { waMsgId, payload } = await postWaText(token, phoneNumberId, from, reply);
  await persistAiSession(supabase, channelId, from, userText, reply);
  await supabase.from("wa_messages").insert({
    conversation_id: conversationId,
    channel_id: channelId,
    wa_message_id: waMsgId,
    direction: "out",
    msg_type: "text",
    text_body: reply,
    from_wa_id: phoneNumberId,
    to_wa_id: normalizeBrWhatsappNumber(from),
    raw: payload,
    status: "sent",
  });
  await supabase.from("wa_conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: reply.slice(0, 120),
    last_message_direction: "out",
  }).eq("id", conversationId);
  console.log("[notif-ai edge] respondeu", { channelId, from, waMsgId });
}

function runInBackground(work: Promise<unknown>) {
  const job = work.catch((e) => {
    console.error("[wa-webhook] background processing error", e);
  });
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil(job);
  }
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

  const deliveryId = req.headers.get("x-hub-delivery-id") ?? payload?.delivery_id ?? payload?.id ?? null;
  runInBackground((async () => {
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

        // Reações: não são mensagens próprias — atualizam a msg alvo em raw.reactions.theirs
        // (senão apareceriam como "documento" na conversa)
        if ((m as any).type === "reaction") {
          try {
            const targetWamid = (m as any).reaction?.message_id as string | undefined;
            const emoji = ((m as any).reaction?.emoji ?? "") as string;
            if (targetWamid) {
              const { data: target } = await supabase
                .from("wa_messages")
                .select("id,raw")
                .eq("channel_id", channelId)
                .eq("wa_message_id", targetWamid)
                .maybeSingle();
              if (target) {
                const prevRaw = ((target as any).raw ?? {}) as Record<string, any>;
                const prevReactions = (prevRaw.reactions ?? {}) as Record<string, any>;
                await supabase
                  .from("wa_messages")
                  .update({
                    raw: {
                      ...prevRaw,
                      reactions: { ...prevReactions, theirs: emoji || null },
                    },
                  })
                  .eq("id", (target as any).id);
              }
            }
          } catch (e) {
            console.error("[wa-webhook] reaction handling error", e);
          }
          continue;
        }

        if (isUnsupportedEditMessage(m)) {
          console.log("[wa-webhook] edição unsupported ignorada", { id: m?.id, from: m?.from });
          continue;
        }
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
          .select("id, unread_count, assigned_vendor_id")
          .single();

        if (convErr || !conv) {
          console.error("[wa-webhook] upsert conv error", convErr);
          continue;
        }

        const conversationPatch: Record<string, unknown> = {
          unread_count: ((conv as any).unread_count ?? 0) + 1,
        };

        if (!(conv as any).assigned_vendor_id) {
          const { data: vendorId, error: assignErr } = await supabase.rpc("assign_vendor_for_channel", {
            _channel_id: channelId,
          });
          if (assignErr) {
            console.error("[wa-webhook] assign_vendor_for_channel error", assignErr);
          } else if (vendorId) {
            conversationPatch.assigned_vendor_id = vendorId;
          }
        }

        await supabase
          .from("wa_conversations")
          .update(conversationPatch)
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

        // Se for edição de mensagem, tenta atualizar a original; senão insere como texto marcado.
        const edited = extractEditedMessage(m);
        if (edited) {
          if (edited.originalId) {
            const { data: orig } = await supabase
              .from("wa_messages")
              .select("id")
              .eq("channel_id", channelId)
              .eq("wa_message_id", edited.originalId)
              .maybeSingle();
            if (orig) {
              await supabase
                .from("wa_messages")
                .update({ text_body: `✏️ (editada) ${edited.body}` })
                .eq("id", (orig as any).id);
              continue;
            }
          }
          // Fallback: registra como texto novo referenciando a original
          m.type = "text";
          m.text = { body: `✏️ (editada) ${edited.body}` };
          if (edited.originalId && !m.context) m.context = { id: edited.originalId };
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

        // Botões dos templates de comparecimento de call.
        // O payload vem como callack:<wa_call_reminders.id>:showup|noshow|remarcada.
        // Aqui marcamos o log, atualizamos o Google Calendar e disparamos ShowUp no Meta CAPI.
        if (buttonId && String(buttonId).startsWith("callack:")) {
          try {
            const [, rawReminderId, rawAction] = String(buttonId).split(":");
            const actionKey = normalizeText(rawAction);
            const action =
              actionKey === "showup" || actionKey === "show_up"
                ? { status: "show_up", emoji: "✅", label: "Show up" }
                : actionKey === "noshow" || actionKey === "no_show"
                  ? { status: "no_show", emoji: "❌", label: "No show" }
                  : actionKey === "remarcada" || actionKey === "rescheduled"
                    ? { status: "rescheduled", emoji: "🔄", label: "Call remarcada" }
                    : null;

            if (rawReminderId && action) {
              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawReminderId);
              const reminderQuery = isUuid
                ? supabase.from("wa_call_reminders").select("*").eq("id", rawReminderId).limit(1).maybeSingle()
                : supabase.from("wa_call_reminders").select("*").eq("event_id", rawReminderId).limit(1).maybeSingle();
              const { data: rem, error: remErr } = await reminderQuery;
              if (remErr) console.warn("[callack] lookup error", remErr.message);
              if (rem) {
                await supabase
                  .from("wa_call_reminders")
                  .update({ status: action.status, replied_at: new Date().toISOString(), error_message: null })
                  .eq("id", rem.id);

                if (rem.event_id) await markCalendarAttendance(rem.event_id, action);
                if (action.status === "show_up") await fireShowUpEdge(supabase, rem);
              }
            }
          } catch (e) {
            console.warn("[callack] erro", (e as any)?.message ?? e);
          }
        }

        // IA do número de notificações: roda aqui dentro da Edge Function, com service role real.
        // Mantém o bridge TanStack só como fallback legado; o app publicado não tem service role.
        try {
          const { data: chRow } = await supabase
            .from("wa_channels")
            .select("kind")
            .eq("id", channelId)
            .maybeSingle();
          if ((chRow as any)?.kind === "notification") {
            await runNotificationAiEdge({
              supabase,
              matched,
              channelId,
              phoneNumberId,
              conversationId: (conv as any).id,
              from: String(m.from),
              message: m,
              buttonText,
              media,
            });
          }
        } catch (e) {
          console.warn("[notif-ai edge] erro", (e as any)?.message ?? e);
        }

        // Baixa a mídia direto do Meta Graph e armazena no bucket wa-media para
        // que o chat renderize via media_url (sem precisar baixar via browser).
        if (media?.id && matched.token) {
          try {
            const mediaToken = await resolveUsableToken(matched);
            const downloaded = mediaToken ? await downloadMetaMedia(mediaToken, media.id) : null;
            if (downloaded) {
              const ext = (media.filename?.split(".").pop()) || extToMime(downloaded.mime);
              const safeName = (media.filename ?? `${media.id}.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
              const path = `${channelId}/${(conv as any).id}/${media.id}-${safeName}`;
              const up = await supabase.storage.from("wa-media").upload(path, downloaded.bytes, {
                contentType: downloaded.mime,
                upsert: true,
              });
              if (!up.error) {
                const signed = await supabase.storage.from("wa-media").createSignedUrl(path, 60 * 60 * 24 * 7);
                if (signed.data?.signedUrl) {
                  await supabase
                    .from("wa_messages")
                    .update({
                      media_url: signed.data.signedUrl,
                      media_mime: downloaded.mime,
                    })
                    .eq("channel_id", channelId)
                    .eq("wa_message_id", String(m.id));
                }
              } else {
                console.warn("[wa-webhook] upload mídia falhou", up.error.message);
              }
            }
          } catch (e) {
            console.warn("[wa-webhook] erro processando mídia", (e as any)?.message ?? e);
          }
        }
      }

      const statuses: any[] = Array.isArray(change.statuses) ? change.statuses : [];
      for (const s of statuses) {
        const statusId = s?.id ?? s?.message_id;
        const status = s?.status ?? s?.value;
        if (!statusId || !status) continue;
        let errorMessage: string | null = null;
        if (status === "failed") {
          const err = Array.isArray(s?.errors) ? s.errors[0] : null;
          const parts = [err?.code, err?.title, err?.message, err?.error_data?.details]
            .filter((p) => p !== null && p !== undefined && String(p).trim() !== "")
            .map((p) => String(p));
          errorMessage = parts.length ? parts.join(" · ") : "Falha desconhecida do Meta";
          console.error("[wa-webhook] message failed", { statusId, channelId, errorMessage, raw: s });
        }
        const updateMsg: any = { status };
        if (errorMessage) updateMsg.error_message = errorMessage;
        const { data: updatedMsgs } = await supabase
          .from("wa_messages")
          .update(updateMsg)
          .eq("channel_id", channelId)
          .eq("wa_message_id", statusId)
          .select("id,conversation_id,created_at,direction");
        await supabase
          .from("wa_call_reminders")
          .update(updateMsg)
          .eq("channel_id", channelId)
          .eq("wa_message_id", statusId);
        await supabase
          .from("wa_task_notifications")
          .update(updateMsg)
          .eq("channel_id", channelId)
          .eq("wa_message_id", statusId);
        // Refletir status na conversa para exibir os checks no preview da lista
        const updatedMsg = Array.isArray(updatedMsgs) ? updatedMsgs[0] : null;
        if (updatedMsg?.conversation_id && updatedMsg?.direction === "out") {
          const { data: latestOut } = await supabase
            .from("wa_messages")
            .select("id,created_at")
            .eq("conversation_id", updatedMsg.conversation_id)
            .eq("direction", "out")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!latestOut || latestOut.id === updatedMsg.id) {
            await supabase
              .from("wa_conversations")
              .update({ last_message_status: status })
              .eq("id", updatedMsg.conversation_id);
          }
        }
      }
    }
  } catch (e) {
    console.error("[wa-webhook] processing error", e);
  }
  })());

  return new Response("ok", { status: 200, headers: corsHeaders });
});
