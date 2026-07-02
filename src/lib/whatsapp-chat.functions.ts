import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVOHUB_BASE = "https://api.evohub.ai";
const API_TIMEOUT_MS = 15_000;

function getEvoKey() {
  const k = process.env.EVOHUB_API_KEY;
  if (!k) throw new Error("EVOHUB_API_KEY não configurada");
  return k;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("EvoHub demorou demais para responder");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function evoApi(path: string, init?: RequestInit) {
  const res = await fetchWithTimeout(`${EVOHUB_BASE}${path}`, {
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

function buildMetaHeaders(channelToken: string, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  const hasBody = init?.body != null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${channelToken}`,
    ...(init?.headers as Record<string, string> | undefined || {}),
  };
  if (hasBody && method !== "GET" && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function metaProxy(channelToken: string, path: string, init?: RequestInit) {
  const res = await fetchWithTimeout(`${EVOHUB_BASE}/meta${path}`, {
    ...init,
    headers: buildMetaHeaders(channelToken, init),
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
  const res = await fetchWithTimeout(`${EVOHUB_BASE}/meta${path}`, {
    ...init,
    headers: buildMetaHeaders(channelToken, init),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function findChannel(channelId: string, supabase?: any) {
  if (supabase) {
    const { data: localRow } = await supabase
      .from("wa_channels" as any)
      .select("id,token,phone_number_id,metadata,status,name")
      .eq("id", channelId)
      .maybeSingle();
    const local = localRow as any;
    const localToken = local?.token ? String(local.token) : "";
    const localPhoneNumberId = local?.phone_number_id
      ? String(local.phone_number_id)
      : local?.metadata?.meta_connection?.phone_number_id
        ? String(local.metadata.meta_connection.phone_number_id)
        : undefined;
    if (localToken && localPhoneNumberId) {
      return { id: channelId, token: localToken, phoneNumberId: localPhoneNumberId, raw: local };
    }
  }

  // Fallback EvoHub: carrega o canal remoto quando a tabela local ainda não tem token/phone_number_id.
  const data = await evoApi("/api/v1/channels");
  const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.channels ?? [];
  const fromList = list.find((c) => c.id === channelId);
  if (!fromList) throw new Error("Canal não encontrado");
  const ch = await evoApi(`/api/v1/channels/${channelId}`).catch(() => fromList);
  if (!ch) throw new Error("Canal não encontrado");
  const metaConnection = ch?.meta_connection ?? ch?.metadata?.meta_connection ?? null;
  const phoneNumberId = metaConnection?.phone_number_id ?? metaConnection?.phone_numbers?.[0]?.id ?? ch?.phone_number_id;
  return { id: channelId, token: ch.token as string, phoneNumberId: phoneNumberId as string | undefined, raw: ch };
}

async function persistWorkingToken(supabase: any, phoneNumberId: string, token: string, channelId?: string) {
  if (!supabase || !phoneNumberId || !token) return;
  try {
    await supabase.from("wa_channels" as any).update({ token, synced_at: new Date().toISOString() })
      .eq("phone_number_id", phoneNumberId);
    if (channelId) {
      await supabase.from("wa_channels" as any).update({ token, synced_at: new Date().toISOString() })
        .eq("id", channelId);
    }
  } catch (e) {
    console.warn("[whatsapp-chat] persistWorkingToken failed", e);
  }
}

async function findUsableMetaToken(phoneNumberId: string, preferredToken?: string) {
  if (preferredToken) {
    const probe = await rawMetaProxy(preferredToken, `/${phoneNumberId}?fields=id`).catch(() => null);
    if (probe?.ok) return preferredToken;
  }

  const data = await evoApi("/api/v1/channels");
  const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.channels ?? [];
  for (const row of list) {
    const detail = await evoApi(`/api/v1/channels/${row.id}`).catch(() => row);
    const token = detail?.token ? String(detail.token) : "";
    if (!token || token === preferredToken) continue;
    const probe = await rawMetaProxy(token, `/${phoneNumberId}?fields=id`).catch(() => null);
    if (probe?.ok) return token;
  }

  return preferredToken ?? "";
}

async function metaProxyForChannel(
  ch: { id?: string; token: string; phoneNumberId?: string },
  path: string,
  init?: RequestInit,
  supabase?: any,
) {
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
      message.includes("INTERNAL") ||
      message.includes("401") ||
      message.includes("400") ||
      message.includes("500");
    if (!canRetry) throw err;

    const token = await findUsableMetaToken(ch.phoneNumberId, ch.token);
    if (!token || token === ch.token) throw err;
    // Persiste o token vencedor pra não procurar de novo nas próximas chamadas.
    await persistWorkingToken(supabase, ch.phoneNumberId, token, ch.id);
    return { body: await metaProxy(token, path, init), token };
  }
}

// --- DB reads ---

async function dbFor(context: any) {
  if (context?.vendor && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
  }
  return context.supabase as any;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function vendorRpcArgs(context: any) {
  const id = Number(context?.vendor?.id);
  const codigo = String(context?.vendor?.codigo ?? "").trim();
  return Number.isFinite(id) && id > 0 && codigo ? { _vendor_id: id, _codigo: codigo } : null;
}

function vendorChannelIdsSync(context: any): string[] {
  const ids = context?.vendor?.wa_channel_ids;
  return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
}

async function vendorChannelIds(context: any, db?: any): Promise<string[]> {
  const explicit = vendorChannelIdsSync(context);
  if (explicit.length > 0) return explicit;
  const expert = context?.vendor?.expert ? String(context.vendor.expert) : "";
  if (!expert || !db) return [];
  // Fallback: qualquer canal da operação do vendedor.
  const { data } = await db
    .from("wa_channels" as any)
    .select("id,operacao_id,kind")
    .neq("operacao_id", "__notificador__")
    .neq("kind", "notification");
  return ((data ?? []) as any[])
    .filter((r) => normalizeText((r as any).operacao_id) === normalizeText(expert))
    .map((r) => String(r.id))
    .filter(Boolean);
}

async function assertVendorChannel(context: any, channelId: string, db?: any) {
  if (!context?.vendor) return;
  const allowed = await vendorChannelIds(context, db);
  if (!channelId || !allowed.includes(String(channelId))) {
    throw new Error("Inautorizado: vendedor sem acesso a este número de WhatsApp");
  }
}

async function autoAssignUnassignedConversations(db: any, channelIds?: string[]) {
  const allowedChannels = Array.isArray(channelIds) ? channelIds.map(String).filter(Boolean) : [];
  let q = db
    .from("wa_conversations" as any)
    .select("id,channel_id")
    .is("assigned_vendor_id", null)
    .neq("operacao_id", "__notificador__")
    .limit(200);

  if (allowedChannels.length > 0) q = q.in("channel_id", allowedChannels);

  const { data: rows, error } = await q;
  if (error || !Array.isArray(rows) || rows.length === 0) return;

  const channelCache = new Map<string, number | null>();
  for (const row of rows as any[]) {
    const channelId = String(row.channel_id ?? "");
    if (!channelId) continue;

    if (!channelCache.has(channelId)) {
      const { data: vendorId } = await db.rpc("assign_vendor_for_channel" as any, { _channel_id: channelId });
      channelCache.set(channelId, vendorId ? Number(vendorId) : null);
    }

    const vendorId = channelCache.get(channelId);
    if (!vendorId) continue;

    await db
      .from("wa_conversations" as any)
      .update({ assigned_vendor_id: vendorId })
      .eq("id", row.id)
      .is("assigned_vendor_id", null);
  }
}

async function getConversationByIdOrContact(
  db: any,
  conversationId: string,
  fallback?: { channelId?: string | null; contactWaId?: string | null },
) {
  const columns = "id,channel_id,assigned_vendor_id,contact_wa_id";
  const { data: conv, error } = await db
    .from("wa_conversations" as any)
    .select(columns)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (conv) return conv as any;

  const channelId = String(fallback?.channelId ?? "").trim();
  const rawContact = String(fallback?.contactWaId ?? "").trim();
  if (!channelId || !rawContact) return null;

  const contactIds = whatsappNumberVariants(rawContact);
  if (contactIds.length === 0) return null;

  const { data: fallbackConv, error: fallbackError } = await db
    .from("wa_conversations" as any)
    .select(columns)
    .eq("channel_id", channelId)
    .in("contact_wa_id", contactIds)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallbackError) throw new Error(fallbackError.message);
  return fallbackConv as any;
}

async function assertConversationAccess(
  context: any,
  db: any,
  conversationId: string,
  fallback?: { channelId?: string | null; contactWaId?: string | null },
) {
  if (!conversationId) throw new Error("conversationId obrigatório");
  const conv = await getConversationByIdOrContact(db, conversationId, fallback);
  if (!conv) {
    // Última tentativa: se veio channelId+contact, cria a conversa on-the-fly
    // (isso destrava vendedor quando o webhook criou noutro canal e a UI perdeu o ID).
    const channelId = String(fallback?.channelId ?? "").trim();
    const rawContact = String(fallback?.contactWaId ?? "").trim();
    if (channelId && rawContact) {
      const normalized = normalizeBrWhatsappNumber(rawContact) || rawContact.replace(/\D/g, "");
      const vendorId = (context as any)?.vendor ? Number((context as any).vendor.id) : null;
      const { data: created, error: createError } = await db
        .from("wa_conversations" as any)
        .insert({
          channel_id: channelId,
          contact_wa_id: normalized,
          assigned_vendor_id: vendorId,
          last_message_at: new Date().toISOString(),
        })
        .select("id,channel_id,assigned_vendor_id,contact_wa_id")
        .single();
      if (createError) {
        console.error("[whatsapp-chat] fallback create conversation failed", createError);
        throw new Error(`Conversa não encontrada (id=${conversationId.slice(0, 8)}… canal=${channelId.slice(0, 8)}… contato=${normalized})`);
      }
      return created as any;
    }
    throw new Error(`Conversa não encontrada (id=${conversationId.slice(0, 8)}…)`);
  }
  if (context?.vendor) {
    await assertVendorChannel(context, String((conv as any).channel_id), db);
    const assignedVendorId = (conv as any).assigned_vendor_id == null ? null : Number((conv as any).assigned_vendor_id);
    if (assignedVendorId == null) {
      const vendorId = Number(context.vendor.id);
      await db
        .from("wa_conversations" as any)
        .update({ assigned_vendor_id: vendorId })
        .eq("id", (conv as any).id)
        .is("assigned_vendor_id", null);
      return { ...(conv as any), assigned_vendor_id: vendorId };
    }
    if (assignedVendorId !== Number(context.vendor.id)) {
      throw new Error("Inautorizado: este lead está com outro vendedor");
    }
  }
  return conv as any;
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { operacaoId?: string; vendorId?: number | null } | undefined) => ({
    operacaoId: d?.operacaoId ?? null,
    vendorId: d?.vendorId ?? null,
  }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    const rpcArgs = (context as any)?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data: rows, error } = await db.rpc("vendor_list_wa_conversations" as any, { ...rpcArgs, _operacao_id: data.operacaoId ?? null });
      if (error) throw new Error(error.message);
      return rows ?? [];
    }
    // Excluir canais de notificação (não devem aparecer no chat ao vivo)
    const { data: notifChans } = await db
      .from("wa_channels" as any)
      .select("id")
      .eq("kind", "notification");
    const notifIds = ((notifChans ?? []) as any[]).map((c) => c.id);

    const isVendor = Boolean((context as any).vendor);
    const allowed = isVendor ? (await vendorChannelIds(context, db)).filter((id: string) => !notifIds.includes(id)) : [];

    await autoAssignUnassignedConversations(db, allowed.length ? allowed : undefined).catch((e) => {
      console.warn("[whatsapp-chat] auto-assign skipped", e);
    });

    let q = db
      .from("wa_conversations" as any)
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200)
      .neq("operacao_id", "__notificador__");
    if (notifIds.length) q = q.not("channel_id", "in", `(${notifIds.map((i) => `"${i}"`).join(",")})`);
    if (data.operacaoId) q = q.eq("operacao_id", data.operacaoId);
    if (isVendor) {
      if (allowed.length === 0) return [];
      q = q.in("channel_id", allowed).or(`assigned_vendor_id.eq.${(context as any).vendor.id},assigned_vendor_id.is.null`);
    } else if (data.vendorId != null) q = q.eq("assigned_vendor_id", data.vendorId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) => ({ conversationId: String(d?.conversationId ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) return [];
    const db = await dbFor(context);
    const rpcArgs = (context as any)?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data: rows, error } = await db.rpc("vendor_list_wa_messages" as any, { ...rpcArgs, _conversation_id: data.conversationId });
      if (error) throw new Error(error.message);
      return rows ?? [];
    }
    await assertConversationAccess(context, db, data.conversationId);
    const { data: rows, error } = await db
      .from("wa_messages" as any)
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(500);

    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) => ({ conversationId: String(d?.conversationId ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    const rpcArgs = (context as any)?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data: ok, error } = await db.rpc("vendor_mark_conversation_read" as any, { ...rpcArgs, _conversation_id: data.conversationId });
      if (error) throw new Error(error.message);
      return { ok: Boolean(ok) };
    }
    await assertConversationAccess(context, db, data.conversationId);
    await db
      .from("wa_conversations" as any)
      .update({ unread_count: 0 })
      .eq("id", data.conversationId);
    return { ok: true };
  });

export const transferConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; vendorId: number | null }) => ({
    conversationId: String(d?.conversationId ?? ""),
    vendorId: d?.vendorId == null ? null : Number(d.vendorId),
  }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) throw new Error("conversationId obrigatório");
    const db = await dbFor(context);
    const conv = await assertConversationAccess(context, db, data.conversationId);
    if ((context as any).vendor && data.vendorId != null) {
      const { data: target, error: targetError } = await db
        .from("vendedores" as any)
        .select("id,wa_channel_ids,ativo")
        .eq("id", data.vendorId)
        .maybeSingle();
      if (targetError) throw new Error(targetError.message);
      const targetChannels = Array.isArray((target as any)?.wa_channel_ids) ? (target as any).wa_channel_ids.map(String) : [];
      if (!target || !targetChannels.includes(String(conv.channel_id))) {
        throw new Error("Inautorizado: vendedor destino não atende este número");
      }
    }
    const { error } = await db
      .from("wa_conversations" as any)
      .update({ assigned_vendor_id: data.vendorId })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVendorsForChannel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string }) => ({ channelId: String(d?.channelId ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if ((context as any).vendor) await assertVendorChannel(context, data.channelId, db);
    let q = db
      .from("vendedores" as any)
      .select("id,nome,foto_url,wa_channel_ids,ativo")
      .eq("ativo", true)
      .order("nome");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const all = ((rows ?? []) as unknown) as Array<{ id: number; nome: string; foto_url: string | null; wa_channel_ids: string[] | null }>;
    if (!data.channelId) return all;
    return all.filter((v) => Array.isArray(v.wa_channel_ids) && v.wa_channel_ids.includes(data.channelId));
  });

export const listWhatsappChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await dbFor(context);
    const rpcArgs = (context as any)?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data, error } = await db.rpc("vendor_list_wa_channels" as any, rpcArgs);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    let q = db
      .from("wa_channels" as any)
      .select("id,name,display_phone_number,verified_name,operacao_id")
      .order("name", { ascending: true });
    if ((context as any).vendor) {
      const allowed = await vendorChannelIds(context, db);
      if (allowed.length === 0) return [];
      q = q.in("id", allowed);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const uploadWhatsappMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string; conversationId: string; filename: string; contentType?: string; base64: string }) => ({
    channelId: String(d?.channelId ?? ""),
    conversationId: String(d?.conversationId ?? ""),
    filename: String(d?.filename ?? "arquivo.bin"),
    contentType: d?.contentType ? String(d.contentType) : "application/octet-stream",
    base64: String(d?.base64 ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    await assertVendorChannel(context, data.channelId, db);
    const conv = await assertConversationAccess(context, db, data.conversationId);
    if (String(conv.channel_id) !== String(data.channelId)) throw new Error("Canal não pertence a esta conversa");
    if (!data.base64) throw new Error("Arquivo vazio");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "arquivo.bin";
    const ext = safeName.split(".").pop() || "bin";
    const path = `${data.channelId}/${data.conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(data.base64, "base64");
    const { error } = await supabaseAdmin.storage.from("wa-media").upload(path, buffer, {
      contentType: data.contentType,
      upsert: false,
    });
    if (error) throw new Error("Upload falhou: " + error.message);
    const signed = await supabaseAdmin.storage.from("wa-media").createSignedUrl(path, 60 * 60 * 24);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Erro ao gerar URL");
    return { path, signedUrl: signed.data.signedUrl };
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

// Brazilian numbers: WhatsApp Cloud API expects mobile as 55 + DDD + 9 + 8 digits.
// Many contacts arrive without the "9" (legacy 10-digit format). Insert it when missing.
function normalizeBrWhatsappNumber(raw: string): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  // 55 + DDD(2) + number(8 or 9)
  if (digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    // WhatsApp BR mobile: add the extra 9 even when the old 8-digit number starts with 9.
    if (rest.length === 8) {
      return `55${ddd}9${rest}`;
    }
  }
  return digits;
}

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
    const db = await dbFor(context);
    await assertVendorChannel(context, data.channelId, db);
    const conv = await assertConversationAccess(context, db, data.conversationId, {
      channelId: data.channelId,
      contactWaId: data.to,
    });
    const conversationId = String(conv.id);
    if (String(conv.channel_id) !== String(data.channelId)) {
      throw new Error("Canal não pertence a esta conversa");
    }
    const ch = await findChannel(data.channelId, db);
    if (!ch.phoneNumberId) throw new Error("Canal sem phone_number_id (não conectado ainda)");

    const toNormalized = normalizeBrWhatsappNumber(data.to);

    const body: any = {
      messaging_product: "whatsapp",
      to: toNormalized,
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

    const { data: inserted, error } = await db.from("wa_messages" as any).insert({
      conversation_id: conversationId,
      channel_id: data.channelId,
      wa_message_id: null,
      direction: "out",
      msg_type: data.type,
      text_body: data.type === "text" ? data.text : null,
      media_url: data.type !== "text" ? data.mediaUrl : null,
      media_filename: data.filename || null,
      caption: data.caption || null,
      from_wa_id: ch.phoneNumberId,
      to_wa_id: toNormalized,
      status: "pending",
      sent_by: (context as any).vendor ? null : context.userId,
      raw: { pending: true, request: body, sent_by_vendor_id: (context as any).vendor?.id ?? null },
    }).select("id").single();
    if (error) throw new Error(`Falha ao salvar mensagem: ${error.message}`);

    await db
      .from("wa_conversations" as any)
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: previewForOut(data),
        last_message_direction: "out",
      })
      .eq("id", conversationId);

    try {
      const { body: resp } = await metaProxyForChannel(ch, `/${ch.phoneNumberId}/messages`, {
        method: "POST",
        body: JSON.stringify(body),
      }, db);

      const waMsgId = resp?.messages?.[0]?.id ?? null;
      await db
        .from("wa_messages" as any)
        .update({ wa_message_id: waMsgId, status: "sent", raw: { request: body, response: resp } })
        .eq("id", (inserted as any).id);

      return { ok: true, waMsgId, messageId: (inserted as any).id };
    } catch (e: any) {
      const errorMessage = e?.message ? String(e.message) : "Falha ao enviar no WhatsApp";
      await db
        .from("wa_messages" as any)
        .update({ status: "failed", raw: { request: body, error: errorMessage } })
        .eq("id", (inserted as any).id);
      throw new Error(errorMessage);
    }
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
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    await assertVendorChannel(context, data.channelId, db);
    const ch = await findChannel(data.channelId, db);
    const qs = ch.phoneNumberId ? `?phone_number_id=${ch.phoneNumberId}` : "";
    const { body: resp } = await metaProxyForChannel(ch, `/${data.mediaId}${qs}`, { method: "GET" });
    return { url: resp?.url as string | undefined, mime: resp?.mime_type as string | undefined };
  });

// Download a media URL (proxied through EvoHub) and stream the bytes back as base64 so the browser can render it.
export const downloadIncomingMediaBase64 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string; mediaId: string }) => ({
    channelId: String(d?.channelId ?? ""),
    mediaId: String(d?.mediaId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    await assertVendorChannel(context, data.channelId, db);
    const ch = await findChannel(data.channelId, db);
    const qs = ch.phoneNumberId ? `?phone_number_id=${ch.phoneNumberId}` : "";
    const { body: meta, token } = await metaProxyForChannel(ch, `/${data.mediaId}${qs}`, { method: "GET" });
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
