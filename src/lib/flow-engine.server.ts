// Server-only flow engine. Safe to import from server routes/functions.
// Never import this from client modules.

const EVOHUB_BASE = "https://api.evohub.ai";
const API_TIMEOUT_MS = 60_000;

type Ctx = {
  runId: string;
  flowId: string;
  channelId: string;
  contactWaId: string;
  conversationId: string | null;
  db: any;
  variables: Record<string, any>;
  lastInput?: { text?: string | null; buttonId?: string | null; messageType?: string | null };
  vendor?: VendorRunContext | null;
};

type Node = { id: string; type: string; data: any };
type Edge = { id: string; source: string; target: string; sourceHandle?: string | null };
type VendorRunContext = { id: number; codigo: string };

import { getAudioFileInfo } from "./whatsapp-chat.functions";

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function vendorRpcArgs(vendor?: VendorRunContext | null) {
  const id = Number(vendor?.id);
  const codigo = String(vendor?.codigo ?? "").trim();
  return Number.isFinite(id) && id > 0 && codigo ? { _vendor_id: id, _codigo: codigo } : null;
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

function normalizeBrWhatsappNumber(raw: string): string {
  const rawStr = String(raw ?? "").trim();
  let digits = rawStr.replace(/\D/g, "");
  const hasPlus = rawStr.startsWith("+");
  const dddOk = digits.length >= 2 && digits[0] !== "0" && digits[1] !== "0";
  const looksBr11 = digits.length === 11 && dddOk && digits[2] === "9";
  const looksBr10 = digits.length === 10 && dddOk;
  if (!hasPlus && !digits.startsWith("55") && (looksBr10 || looksBr11)) {
    digits = `55${digits}`;
  }
  if (digits.startsWith("55") && digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8 && ddd[0] !== "0" && ddd[1] !== "0") return `55${ddd}9${rest}`;
  }
  return digits;
}

function whatsappNumberVariants(raw: string): string[] {
  const variants = new Set<string>();
  for (const value of [raw, String(raw ?? "").replace(/\D/g, ""), normalizeBrWhatsappNumber(raw)]) {
    const clean = String(value ?? "").replace(/\D/g, "").trim();
    if (clean) variants.add(clean);
  }
  for (const value of Array.from(variants)) {
    if (value.startsWith("55") && value.length === 13 && value[4] === "9") variants.add(`${value.slice(0, 4)}${value.slice(5)}`);
    if (value.startsWith("55") && value.length === 12) variants.add(`${value.slice(0, 4)}9${value.slice(4)}`);
  }
  return Array.from(variants).filter(Boolean);
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sameWorkspace(a: unknown, b: unknown) {
  return normalizeText(a) === normalizeText(b);
}

function jsonArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function shouldNormalizeWhatsappImage(url: string): boolean {
  const clean = String(url ?? "").split("?")[0].toLowerCase();
  if (!clean) return false;
  // Only normalize formats known to fail on WhatsApp — NOT JPG, PNG, WEBP (all supported)
  return clean.endsWith(".heic") || clean.endsWith(".heif") || clean.endsWith(".svg") || clean.endsWith(".gif");
}

function shouldNormalizeWhatsappVideo(url: string): boolean {
  const clean = String(url ?? "").split("?")[0].toLowerCase();
  // Only normalize formats explicitly rejected by Meta (MOV, M4V, etc.) — NOT MP4 or unknown
  return clean.endsWith(".mov") || clean.endsWith(".quicktime") || clean.endsWith(".hevc") || clean.endsWith(".m4v");
}

function hasTransloaditCreds(): boolean {
  const key = process.env.TRANSLOADIT_AUTH_KEY?.trim() || process.env.TRANSLOADIT_KEY?.trim() ||
    process.env.VITE_TRANSLOADIT_AUTH_KEY?.trim() || process.env.VITE_TRANSLOADIT_KEY?.trim();
  const secret = process.env.TRANSLOADIT_AUTH_SECRET?.trim() || process.env.TRANSLOADIT_SECRET?.trim() ||
    process.env.VITE_TRANSLOADIT_AUTH_SECRET?.trim() || process.env.VITE_TRANSLOADIT_SECRET?.trim();
  return Boolean(key && secret);
}

async function resolveStageFromTags(db: any, tags: string[], operation?: unknown) {
  const tagNames = [...new Set(jsonArray<string>(tags).map((t) => String(t ?? "").trim()).filter(Boolean))];
  if (tagNames.length === 0) return null;
  const { data: tagRows } = await db
    .from("crm_tags" as any)
    .select("nome,stage_id,operacao")
    .in("nome", tagNames);
  const rows = ((tagRows ?? []) as any[]).filter((r) => r?.stage_id);
  if (rows.length === 0) return null;
  const op = String(operation ?? "").trim();
  const match = op
    ? rows.find((r) => sameWorkspace(r?.operacao, op) || sameWorkspace(r?.operacao, "all")) ?? rows[0]
    : rows[0];
  return match?.stage_id ? String(match.stage_id) : null;
}

function interpolate(tpl: string, ctx: Ctx): string {
  if (!tpl) return tpl;
  return tpl
    .replace(/\{\{\s*contato\.telefone\s*\}\}/g, ctx.contactWaId)
    .replace(/\{\{\s*var\.([\w-]+)\s*\}\}/g, (_, k) => String(ctx.variables?.[k] ?? ""))
    .replace(/\{\{\s*input\.texto\s*\}\}/g, ctx.lastInput?.text ?? "");
}

async function fetchChannelToken(channelId: string, db: any): Promise<{ token: string; phoneNumberId: string }> {
  // 1) Prefer SECURITY DEFINER RPC — funciona mesmo sem service role (bypassa RLS).
  let local: any = null;
  try {
    const { data: rpcRows } = await db.rpc("load_wa_channel_credentials" as any, { _channel_id: String(channelId) });
    local = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  } catch {}

  if (!local) {
    const { data: localRow } = await db
      .from("wa_channels" as any)
      .select("id,token,phone_number_id,metadata")
      .eq("id", channelId)
      .maybeSingle();
    local = localRow as any;
  }

  const localToken = local?.token ? String(local.token) : "";
  const localPhoneNumberId = local?.phone_number_id
    ? String(local.phone_number_id)
    : local?.metadata?.meta_connection?.phone_number_id
      ? String(local.metadata.meta_connection.phone_number_id)
      : "";
  if (localToken && localPhoneNumberId) {
    return { token: localToken, phoneNumberId: localPhoneNumberId };
  }

  const res = await fetchWithTimeout(`${EVOHUB_BASE}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${process.env.EVOHUB_API_KEY}` },
  });
  if (!res.ok) throw new Error(`EvoHub HTTP ${res.status}`);
  const body = await res.json();
  const list: any[] = Array.isArray(body) ? body : body?.data ?? body?.channels ?? [];
  const ch = list.find((c) => c.id === channelId);
  if (!ch) throw new Error(`Canal ${channelId} não encontrado no EvoHub`);
  const phoneNumberId = ch?.metadata?.meta_connection?.phone_number_id ?? ch?.meta_connection?.phone_number_id ?? ch?.phone_number_id;
  if (!phoneNumberId) throw new Error("Canal sem phone_number_id");
  return { token: ch.token, phoneNumberId };
}

async function postMetaMessage(token: string, phoneNumberId: string, payload: any) {
  const res = await fetchWithTimeout(`${EVOHUB_BASE}/meta/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

async function persistWorkingToken(db: any, phoneNumberId: string, token: string, channelId?: string) {
  if (!db || !phoneNumberId || !token) return;
  try {
    // Persist on every local channel that shares this phone_number_id so future
    // sends use the verified token straight away (no probing).
    await db.from("wa_channels" as any).update({ token, synced_at: new Date().toISOString() })
      .eq("phone_number_id", phoneNumberId);
    if (channelId) {
      await db.from("wa_channels" as any).update({ token, synced_at: new Date().toISOString() })
        .eq("id", channelId);
    }
  } catch (e) {
    console.warn("[flow-engine] persistWorkingToken failed", e);
  }
}

async function findUsableMetaToken(phoneNumberId: string, preferredToken: string): Promise<string> {
  const res = await fetchWithTimeout(`${EVOHUB_BASE}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${process.env.EVOHUB_API_KEY}` },
  }).catch(() => null);
  if (!res || !res.ok) return preferredToken;
  const body = await res.json().catch(() => null);
  const list: any[] = Array.isArray(body) ? body : body?.data ?? body?.channels ?? [];
  for (const row of list) {
    const token = row?.token ? String(row.token) : "";
    if (!token || token === preferredToken) continue;
    const probe = await fetchWithTimeout(`${EVOHUB_BASE}/meta/${phoneNumberId}?fields=id`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (probe?.ok) return token;
  }
  return preferredToken;
}

export async function sendWA(channelId: string, to: string, body: any, db: any) {
  const { token, phoneNumberId } = await fetchChannelToken(channelId, db);
  const toNormalized = normalizeBrWhatsappNumber(to);
  const payload = { messaging_product: "whatsapp", to: toNormalized, ...body };

  // Retry transitório: mídia (vídeo especialmente) volta 5xx/timeout com frequência
  // quando o Meta demora pra baixar a URL. Tenta até 3 vezes com backoff antes de trocar token.
  let attempt = { ok: false, status: 0, json: null as any };
  let lastErr: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      attempt = await postMetaMessage(token, phoneNumberId, payload);
    } catch (e) {
      lastErr = e;
      attempt = { ok: false, status: 0, json: { error: { message: String((e as any)?.message ?? e) } } };
    }
    if (attempt.ok) break;
    const transient = attempt.status === 0 || attempt.status >= 500;
    if (!transient) break;
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }

  let workingToken = token;
  if (!attempt.ok) {
    const msg = attempt.json?.error?.message ?? attempt.json?.message ?? (lastErr ? String((lastErr as any)?.message ?? lastErr) : `HTTP ${attempt.status}`);
    const msgStr = typeof msg === "string" ? msg : JSON.stringify(msg);
    const canRetry = /INTERNAL|Meta token|Unsupported|OAuth|missing permissions|\b(400|401|500)\b/i.test(msgStr);
    if (canRetry) {
      const altToken = await findUsableMetaToken(phoneNumberId, token);
      if (altToken && altToken !== token) {
        attempt = await postMetaMessage(altToken, phoneNumberId, payload);
        if (attempt.ok) {
          workingToken = altToken;
          // Cacheia pra sempre: próximas mensagens já partem desse token.
          await persistWorkingToken(db, phoneNumberId, altToken, channelId);
        }
      }
    }
    if (!attempt.ok) throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  void workingToken;
  return { waMsgId: attempt.json?.messages?.[0]?.id ?? null, phoneNumberId, toNormalized };
}

async function uploadMediaToMeta(token: string, phoneNumberId: string, mediaUrl: string, mimeType: string, filename = "file"): Promise<string> {
  const fetchRes = await fetchWithTimeout(mediaUrl, {}, 35_000);
  if (!fetchRes.ok) throw new Error(`Falha ao baixar mídia para upload direto no Meta (HTTP ${fetchRes.status})`);
  const arrayBuffer = await fetchRes.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: mimeType });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", blob, filename);
  form.append("type", mimeType);

  const res = await fetchWithTimeout(`${EVOHUB_BASE}/meta/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }, 45_000);

  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }

  if (!res.ok || !json?.id) {
    const errText = json?.error?.message || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`Upload de mídia no Meta falhou: ${errText}`);
  }

  return String(json.id);
}

function normalize16BitPngIfNeeded(buffer: Buffer): { buffer: Buffer; converted: boolean } {
  try {
    const fastPng = require("fast-png");
    if (!fastPng.hasPngSignature(buffer)) return { buffer, converted: false };
    const decoded = fastPng.decode(buffer);
    if (decoded.depth === 16) {
      console.log("[flow-engine] PNG com profundidade 16-bit detectado. Convertendo para 8-bit compatível com a Meta API...");
      const data16 = decoded.data;
      const data8 = new Uint8Array(data16.length);
      for (let i = 0; i < data16.length; i++) {
        data8[i] = data16[i] >> 8;
      }
      const encoded8 = fastPng.encode({
        width: decoded.width,
        height: decoded.height,
        depth: 8,
        channels: decoded.channels,
        data: data8,
      });
      return { buffer: Buffer.from(encoded8), converted: true };
    }
  } catch (e: any) {
    console.warn("[flow-engine] normalize16BitPngIfNeeded warning:", e?.message || e);
  }
  return { buffer, converted: false };
}

async function mirrorMediaToSupabaseStorage(db: any, sourceUrl: string, mediaType: string): Promise<string> {
  try {
    if (!sourceUrl || typeof sourceUrl !== "string") return sourceUrl;

    // Se já for uma URL do wa-media sem token (formato /object/public/wa-media/), converte para signed URL de 1 ano!
    // Como o bucket `wa-media` é privado, URLs /public/ geram HTTP 400 'Bucket not found' na Meta API.
    if (sourceUrl.includes("/storage/v1/object/public/wa-media/")) {
      const relativePath = sourceUrl.split("/storage/v1/object/public/wa-media/")[1];
      if (relativePath) {
        const { data: signedData } = await db.storage.from("wa-media").createSignedUrl(relativePath, 31536000);
        if (signedData?.signedUrl) sourceUrl = signedData.signedUrl;
      }
    }

    const cleanPath = sourceUrl.split("?")[0].toLowerCase();
    const isPng = cleanPath.endsWith(".png");

    // Se já for URL assinada e NÃO for um PNG que precisa de verificação de 16-bit, retorna direto
    if (!isPng && (sourceUrl.includes("/storage/v1/object/sign/wa-media/") || sourceUrl.includes("token="))) {
      return sourceUrl;
    }

    const res = await fetchWithTimeout(sourceUrl, {}, 25_000);
    if (!res.ok) return sourceUrl;
    const arrayBuffer = await res.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // Verificação de 16-bit PNG: se for PNG de 16-bit (incompatível com Meta), converte para 8-bit
    let pngConverted = false;
    if (mediaType === "image" || isPng) {
      const norm = normalize16BitPngIfNeeded(buffer);
      if (norm.converted) {
        buffer = norm.buffer;
        pngConverted = true;
      }
    }

    // Se a URL já estava assinada e não precisou de conversão de 16-bit, retorna a URL original
    if (!pngConverted && (sourceUrl.includes("/storage/v1/object/sign/wa-media/") || sourceUrl.includes("token="))) {
      return sourceUrl;
    }

    // Preserva a extensão real e o Content-Type do arquivo original
    const fetchedContentType = (res.headers.get("content-type") || "").toLowerCase();
    let ext = "";

    const urlMatch = sourceUrl.split("?")[0].match(/\.([a-zA-Z0-9]{3,4})$/);
    if (urlMatch && !["bin", "tmp"].includes(urlMatch[1].toLowerCase())) {
      ext = urlMatch[1].toLowerCase();
    } else if (fetchedContentType.includes("png")) ext = "png";
    else if (fetchedContentType.includes("jpeg") || fetchedContentType.includes("jpg")) ext = "jpg";
    else if (fetchedContentType.includes("webp")) ext = "webp";
    else if (fetchedContentType.includes("mp4")) ext = "mp4";
    else if (fetchedContentType.includes("ogg") || fetchedContentType.includes("opus")) ext = "ogg";
    else if (fetchedContentType.includes("mpeg") || fetchedContentType.includes("mp3")) ext = "mp3";
    else if (fetchedContentType.includes("wav")) ext = "wav";
    else if (fetchedContentType.includes("m4a") || fetchedContentType.includes("aac")) ext = "m4a";
    else ext = mediaType === "image" ? "jpg" : mediaType === "video" ? "mp4" : mediaType === "audio" ? "mp3" : "bin";

    let contentType = fetchedContentType || (
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "png" ? "image/png" :
      ext === "webp" ? "image/webp" :
      ext === "mp4" ? "video/mp4" :
      ext === "ogg" || ext === "opus" ? "audio/ogg" :
      ext === "mp3" ? "audio/mpeg" :
      ext === "wav" ? "audio/wav" :
      ext === "m4a" ? "audio/mp4" :
      "application/octet-stream"
    );

    const path = `flow-media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadErr } = await db.storage.from("wa-media").upload(path, buffer, {
      contentType,
      upsert: true,
    });

    if (uploadErr) {
      console.warn("[flow-engine] Upload no bucket wa-media falhou:", uploadErr.message);
      return sourceUrl;
    }

    // Gera Signed URL válida por 1 ano (31.536.000s) para que o Meta consiga baixar a mídia do bucket privado
    const { data: signedData } = await db.storage.from("wa-media").createSignedUrl(path, 31536000);
    if (signedData?.signedUrl) return signedData.signedUrl;

    const { data: publicData } = db.storage.from("wa-media").getPublicUrl(path);
    return publicData?.publicUrl || sourceUrl;
  } catch (e: any) {
    console.warn("[flow-engine] mirrorMediaToSupabaseStorage exceção:", e?.message || e);
    return sourceUrl;
  }
}

// Monotonic counter so consecutive flow inserts always have strictly increasing created_at,
// even when the engine fires fast back-to-back messages.
let __flowMsgSeq = 0;
let __flowMsgLastMs = 0;
function nextFlowCreatedAt(): string {
  const now = Date.now();
  if (now <= __flowMsgLastMs) {
    __flowMsgSeq += 1;
  } else {
    __flowMsgLastMs = now;
    __flowMsgSeq = 0;
  }
  // Add seq ms to ensure strict ordering across rapid inserts.
  return new Date(__flowMsgLastMs + __flowMsgSeq).toISOString();
}

function popInitialQuotedMessageId(ctx: Ctx): string | null {
  if (ctx.variables?.__firstQuotedSent) return null;
  const initId = ctx.variables?.trigger?.initial_quoted_msg_id;
  if (!initId) return null;
  ctx.variables.__firstQuotedSent = true;
  return String(initId);
}

async function persistOutMessage(ctx: Ctx, type: string, body: any, waMsgId: string | null, phoneNumberId: string, toWaId?: string, quotedMsgId?: string | null) {
  if (!ctx.conversationId) return;
  const textBody = body?.text?.body ?? body?.interactive?.body?.text ?? null;
  const mediaUrl = body?.image?.link ?? body?.video?.link ?? body?.audio?.link ?? body?.document?.link ?? null;
  const mediaFilename = body?.document?.filename ?? null;
  const caption = body?.image?.caption ?? body?.video?.caption ?? body?.document?.caption ?? null;
  const toNormalized = toWaId ?? normalizeBrWhatsappNumber(ctx.contactWaId);
  const preview = type === "text" ? String(textBody ?? "").slice(0, 120) : `[${type}]`;

  const finalQuotedId = quotedMsgId || body?.context?.message_id || null;
  const rawData = finalQuotedId ? { ...body, context: { message_id: finalQuotedId } } : body;

  const rpcArgs = vendorRpcArgs(ctx.vendor);
  if (rpcArgs) {
    const { error } = await ctx.db.rpc("vendor_insert_wa_message" as any, {
      ...rpcArgs,
      _conversation_id: ctx.conversationId,
      _channel_id: ctx.channelId,
      _wa_message_id: waMsgId,
      _direction: "out",
      _msg_type: type,
      _text_body: textBody,
      _media_url: mediaUrl,
      _media_filename: mediaFilename,
      _caption: caption,
      _from_wa_id: phoneNumberId,
      _to_wa_id: toNormalized,
      _status: "sent",
      _raw: rawData,
    });
    if (error) throw new Error(error.message);
    await ctx.db.rpc("vendor_touch_wa_conversation" as any, {
      ...rpcArgs,
      _conversation_id: ctx.conversationId,
      _preview: preview,
      _direction: "out",
    });
    return;
  }

  const createdAt = nextFlowCreatedAt();
  await ctx.db.from("wa_messages" as any).insert({
    conversation_id: ctx.conversationId,
    channel_id: ctx.channelId,
    wa_message_id: waMsgId,
    direction: "out",
    msg_type: type,
    text_body: textBody,
    media_url: mediaUrl,
    media_filename: mediaFilename,
    caption,
    from_wa_id: phoneNumberId,
    to_wa_id: toNormalized,
    status: "sent",
    raw: rawData,
    created_at: createdAt,
  });
  await ctx.db.from("wa_conversations" as any).update({
    last_message_at: createdAt,
    last_message_preview: preview,
    last_message_direction: "out",
  }).eq("id", ctx.conversationId);
}


async function logExecution(db: any, runId: string, node: Node, status: string, output?: any, error?: string, started?: number, vendor?: VendorRunContext | null) {
  const rpcArgs = vendorRpcArgs(vendor);
  if (rpcArgs) {
    const { error: rpcError } = await db.rpc("vendor_insert_wa_flow_execution" as any, {
      ...rpcArgs,
      _run_id: runId,
      _node_id: node.id,
      _node_type: node.type,
      _status: status,
      _output: output ?? null,
      _error: error ?? null,
      _duration_ms: started ? Date.now() - started : null,
    });
    if (rpcError) throw new Error(rpcError.message);
    return;
  }
  await db.from("wa_flow_executions" as any).insert({
    run_id: runId,
    node_id: node.id,
    node_type: node.type,
    status,
    output: output ?? null,
    error: error ?? null,
    duration_ms: started ? Date.now() - started : null,
  });
}

async function createFlowRun(db: any, args: {
  flowId: string;
  conversationId: string | null;
  channelId: string;
  contactWaId: string;
  currentNodeId: string | null;
  triggerContext?: any;
  vendor?: VendorRunContext | null;
}) {
  const rpcArgs = vendorRpcArgs(args.vendor);
  if (rpcArgs) {
    const { data, error } = await db.rpc("vendor_create_wa_flow_run" as any, {
      ...rpcArgs,
      _flow_id: args.flowId,
      _conversation_id: args.conversationId,
      _channel_id: args.channelId,
      _contact_wa_id: args.contactWaId,
      _current_node_id: args.currentNodeId,
      _context: { trigger: args.triggerContext ?? {} },
    });
    const run = Array.isArray(data) ? data[0] : data;
    if (error || !run) throw new Error(error?.message ?? "Não foi possível criar a execução");
    return run as any;
  }

  const { data: run, error } = await db
    .from("wa_flow_runs" as any)
    .insert({
      flow_id: args.flowId,
      conversation_id: args.conversationId,
      channel_id: args.channelId,
      contact_wa_id: args.contactWaId,
      current_node_id: args.currentNodeId,
      status: "running",
      context: { trigger: args.triggerContext ?? {} },
    })
    .select("id")
    .single();
  if (error || !run) throw new Error(error?.message ?? "Não foi possível criar a execução");
  return run as any;
}

async function updateFlowRun(ctx: Ctx, patch: Record<string, any>) {
  const rpcArgs = vendorRpcArgs(ctx.vendor);
  if (rpcArgs) {
    const { data, error } = await ctx.db.rpc("vendor_update_wa_flow_run" as any, {
      ...rpcArgs,
      _run_id: ctx.runId,
      _patch: patch,
    });
    if (error) throw new Error(error.message);
    if (data === false) {
      if (await isFlowRunCancelled(ctx)) return;
      throw new Error("Execução não encontrada");
    }
    return;
  }
  const { data, error } = await ctx.db.rpc("update_wa_flow_run" as any, {
    _run_id: ctx.runId,
    _patch: patch,
  });
  if (error) throw new Error(error.message);
  if (data === false) {
    if (await isFlowRunCancelled(ctx)) return;
    throw new Error("Execução não encontrada");
  }
}

async function isFlowRunCancelled(ctx: Ctx): Promise<boolean> {
  const { data } = await ctx.db
    .from("wa_flow_runs" as any)
    .select("status")
    .eq("id", ctx.runId)
    .maybeSingle();
  return String((data as any)?.status ?? "") === "cancelled";
}

async function hasRecentManualCancellation(ctx: Ctx): Promise<boolean> {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const variants = whatsappNumberVariants(ctx.contactWaId);
  const { data } = await ctx.db
    .from("wa_flow_runs" as any)
    .select("id")
    .eq("flow_id", ctx.flowId)
    .eq("channel_id", ctx.channelId)
    .in("contact_wa_id", variants.length > 0 ? variants : [ctx.contactWaId])
    .eq("status", "cancelled")
    .neq("id", ctx.runId)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function shouldStopFlowRun(ctx: Ctx): Promise<boolean> {
  const isCancelled = await isFlowRunCancelled(ctx);
  if (isCancelled) return true;
  // Se o disparo foi feito manualmente pelo vendedor, ignora cancelamentos anteriores
  const isManual = Boolean(ctx.variables?.trigger?.manual);
  if (isManual) return false;
  return await hasRecentManualCancellation(ctx);
}

function nextNodeId(edges: Edge[], fromNodeId: string, handle?: string | null): string | null {
  const edge = edges.find((e) =>
    e.source === fromNodeId &&
    (handle === undefined || handle === null
      ? !e.sourceHandle || e.sourceHandle === "out" || e.sourceHandle === null
      : e.sourceHandle === handle)
  );
  return edge?.target ?? null;
}

async function loadFlow(flowId: string, db: any) {
  // Prefer SECURITY DEFINER RPC to bypass RLS in vendor sessions
  try {
    const { data: rpcRows } = await db.rpc("load_wa_flow", { _flow_id: flowId });
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (row) return row as any;
  } catch {}
  let { data, error } = await db
    .from("wa_flows" as any)
    .select("*")
    .eq("id", flowId)
    .maybeSingle();
  if (!data) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await supabaseAdmin
        .from("wa_flows" as any)
        .select("*")
        .eq("id", flowId)
        .maybeSingle();
      data = res.data;
      error = res.error;
    } catch {}
  }
  if (error || !data) throw new Error(`Flow ${flowId} não encontrado`);
  return data as any;
}



async function executeFrom(ctx: Ctx, startNodeId: string) {
  const flow = await loadFlow(ctx.flowId, ctx.db);
  const nodes: Node[] = jsonArray<Node>(flow.nodes);
  const edges: Edge[] = jsonArray<Edge>(flow.edges);

  let currentId: string | null = startNodeId;
  let safety = 0;

  while (currentId && safety++ < 50) {
    if (await shouldStopFlowRun(ctx)) return;
    const node = nodes.find((n) => n.id === currentId);
    if (!node) {
      // Node não existe mais (fluxo editado). Não deixa o run preso em "running".
      await updateFlowRun(ctx, { status: "completed", waiting_for: null, expires_at: null });
      await logExecution(ctx.db, ctx.runId, { id: currentId, type: "missing", data: {} } as any, "error", null, `node ${currentId} não encontrado no fluxo`, Date.now(), ctx.vendor);
      return;
    }
    const started = Date.now();

    try {
      const result = await runNode(node, ctx);
      if (await shouldStopFlowRun(ctx)) return;

      // Update run pointer
      await updateFlowRun(ctx, {
        current_node_id: node.id,
        context: ctx.variables,
        status: result.pause ? "waiting" : "running",
        waiting_for: result.waitingFor ?? null,
        expires_at: result.expiresAt ?? null,
      });

      await logExecution(ctx.db, ctx.runId, node, "ok", result.log ?? null, undefined, started, ctx.vendor);

      if (result.pause) return;
      if (result.end) {
        await updateFlowRun(ctx, {
          status: "completed", waiting_for: null,
        });
        return;
      }
      currentId = nextNodeId(edges, node.id, result.handle);
    } catch (e: any) {
      await logExecution(ctx.db, ctx.runId, node, "error", null, String(e?.message ?? e), started, ctx.vendor);
      // Envio falhou mesmo após retry/conversão: para o fluxo aqui.
      // Antes ele seguia para o próximo nó e podia mandar "a primeira e a última"
      // mensagem do funil, pulando mídias/mensagens do meio.
      const isSendNode =
        node.type === "send_text" ||
        node.type === "send_image" ||
        node.type === "send_video" ||
        node.type === "send_audio" ||
        node.type === "send_document" ||
        node.type === "send_buttons";
      if (!isSendNode) {
        await updateFlowRun(ctx, {
          status: "failed", error: String(e?.message ?? e),
        });
        return;
      }
      await updateFlowRun(ctx, {
        status: "failed", error: String(e?.message ?? e),
      });
      return;
    }
  }

  if (!currentId) {
    await updateFlowRun(ctx, {
      status: "completed", waiting_for: null,
    });
  }
}

type NodeResult = {
  pause?: boolean;
  waitingFor?: "message" | "button" | "timer" | null;
  expiresAt?: string | null;
  end?: boolean;
  handle?: string | null;
  log?: any;
};

async function runNode(node: Node, ctx: Ctx): Promise<NodeResult> {
  // Última linha de defesa contra "mesmo após cancelar, ainda enviou".
  // Checa cancelamento imediatamente antes de qualquer nó de envio de mídia/texto.
  const isSendNode =
    node.type === "send_text" ||
    node.type === "send_image" ||
    node.type === "send_video" ||
    node.type === "send_audio" ||
    node.type === "send_document" ||
    node.type === "send_buttons";
  if (isSendNode && (await shouldStopFlowRun(ctx))) {
    return {};
  }
  switch (node.type) {

    case "trigger":
      return {};

    case "send_text": {
      const text = interpolate(String(node.data?.text ?? ""), ctx);
      if (!text) return {};
      const initialQuotedId = popInitialQuotedMessageId(ctx);
      const body: any = {
        type: "text",
        text: { body: text },
        ...(initialQuotedId ? { context: { message_id: initialQuotedId } } : {}),
      };
      if (await shouldStopFlowRun(ctx)) return {};
      const { waMsgId, phoneNumberId, toNormalized } = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
      await persistOutMessage(ctx, "text", body, waMsgId, phoneNumberId, toNormalized, initialQuotedId);
      if (await shouldStopFlowRun(ctx)) return {};
      return { log: { text } };
    }

    case "send_image":
    case "send_video":
    case "send_audio":
    case "send_document": {
      const url = String(node.data?.mediaUrl ?? "").trim();
      if (!url) throw new Error("URL de mídia ausente");
      const mediaType = node.type.replace("send_", "");
      const caption = node.data?.caption ? interpolate(String(node.data.caption), ctx) : undefined;
      const filename = node.data?.filename || undefined;

      let finalUrl = url;

      // 1) Conversão prévia de formato — somente quando o Transloadit está configurado
      //    e o formato precisa de conversão. Sem credenciais, vai direto ao espelhamento.
      const transloaditAvailable = hasTransloaditCreds();
      if (mediaType === "audio") {
        const isAlreadyOgg = /\.(ogg|opus)($|\?)/i.test(url);
        if (!isAlreadyOgg && transloaditAvailable) {
          try {
            const { convertAudioToWhatsappVoice } = await import("@/lib/transloadit.server");
            const converted = await convertAudioToWhatsappVoice(url);
            if (converted) finalUrl = converted;
          } catch (e) {
            console.warn("[flow-engine] conversão de áudio falhou (continuando com URL original):", e);
          }
        }
      } else {
        if (mediaType === "image" && transloaditAvailable && shouldNormalizeWhatsappImage(finalUrl)) {
          try {
            const { convertImageToWhatsappJpeg } = await import("@/lib/transloadit.server");
            const converted = await convertImageToWhatsappJpeg(finalUrl);
            if (converted) finalUrl = converted;
          } catch (e) {
            console.warn("[flow-engine] conversão de imagem falhou (continuando com URL original):", e);
          }
        }
        if (mediaType === "video" && transloaditAvailable && shouldNormalizeWhatsappVideo(finalUrl)) {
          try {
            const { convertVideoToWhatsappMp4 } = await import("@/lib/transloadit.server");
            const converted = await convertVideoToWhatsappMp4(finalUrl);
            if (converted) finalUrl = converted;
          } catch (e) {
            console.warn("[flow-engine] conversão de vídeo falhou (continuando com URL original):", e);
          }
        }
      }

      // 2) TENTATIVA 1 & ESPELHAMENTO: Garantir que a URL esteja no nosso bucket público `wa-media`
      // Isso impede falhas quando o host original tem Cloudflare/403/Redirects/Timeouts para o robô da Meta.
      let mirroredUrl = finalUrl;
      try {
        mirroredUrl = await mirrorMediaToSupabaseStorage(ctx.db, finalUrl, mediaType);
      } catch (e) {
        console.warn("[flow-engine] mirrorMediaToSupabaseStorage falhou:", e);
      }

      const inner: any = { link: mirroredUrl };
      let isVoice = false;
      if (mediaType === "audio") {
        const audioInfo = getAudioFileInfo(mirroredUrl, filename);
        if (audioInfo.isOggOpus) {
          inner.voice = true;
          isVoice = true;
        }
      }
      if (mediaType !== "sticker" && caption) inner.caption = caption;
      if (mediaType === "document" && filename) inner.filename = filename;

      const initialQuotedId = popInitialQuotedMessageId(ctx);
      let body: any = {
        type: mediaType,
        [mediaType]: inner,
        ...(initialQuotedId ? { context: { message_id: initialQuotedId } } : {}),
      };

      if (await shouldStopFlowRun(ctx)) return {};

      let sendResult: { waMsgId: string | null; phoneNumberId: string; toNormalized: string } | null = null;

      try {
        // Envia com a URL espelhada/otimizada
        sendResult = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
      } catch (firstSendErr: any) {
        if (mediaType === "audio" && inner.voice) {
          console.warn("[flow-engine] Meta rejeitou voice: true na URL, tentando sem voice: true...", firstSendErr?.message);
          delete inner.voice;
          body[mediaType] = inner;
          try {
            sendResult = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
          } catch (retryNoVoiceErr: any) {
            firstSendErr = retryNoVoiceErr;
          }
        }

        if (!sendResult) {
          console.warn(`[flow-engine] Envio de ${mediaType} por URL falhou (${firstSendErr?.message}). Executando FALLBACK: Upload Direto do Binário no Meta (media_id)...`);

          // 3) TENTATIVA 2 (FALLBACK): Upload direto do binário para a API de Mídia da Meta (retorna media_id)
          try {
            const { token, phoneNumberId } = await fetchChannelToken(ctx.channelId, ctx.db);
            let mime = "application/octet-stream";
            let ext = "file";

            if (mediaType === "image") {
              mime = "image/jpeg";
              ext = "jpg";
            } else if (mediaType === "video") {
              mime = "video/mp4";
              ext = "mp4";
            } else if (mediaType === "audio") {
              const audioInfo = getAudioFileInfo(mirroredUrl, filename);
              mime = audioInfo.mime;
              ext = audioInfo.ext;
              isVoice = audioInfo.isOggOpus;
            } else {
              mime = "application/pdf";
              ext = "pdf";
            }

            const safeFilename = filename || `arquivo.${ext}`;

            const mediaId = await uploadMediaToMeta(token, phoneNumberId, mirroredUrl, mime, safeFilename);

            const mediaIdInner: any = { id: mediaId };
            if (mediaType === "audio" && isVoice) mediaIdInner.voice = true;
            if (mediaType !== "sticker" && caption) mediaIdInner.caption = caption;
            if (mediaType === "document" && filename) mediaIdInner.filename = filename;

            body = {
              type: mediaType,
              [mediaType]: mediaIdInner,
              ...(initialQuotedId ? { context: { message_id: initialQuotedId } } : {}),
            };

            try {
              sendResult = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
            } catch (mErr: any) {
              if (mediaType === "audio" && mediaIdInner.voice) {
                console.warn("[flow-engine] Meta rejeitou voice: true no media_id, tentando sem voice: true...");
                delete mediaIdInner.voice;
                body[mediaType] = mediaIdInner;
                sendResult = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
              } else {
                throw mErr;
              }
            }
            console.log(`[flow-engine] SUCESSO no envio de ${mediaType} usando media_id (${mediaId})!`);
          } catch (secondSendErr: any) {
            console.error(`[flow-engine] Fallback de mídia via media_id também falhou:`, secondSendErr);
            throw firstSendErr;
          }
        }
      }

      const { waMsgId, phoneNumberId, toNormalized } = sendResult!;
      await persistOutMessage(ctx, mediaType, body, waMsgId, phoneNumberId, toNormalized, initialQuotedId);
      if (await shouldStopFlowRun(ctx)) return {};
      return { log: { url: mirroredUrl, originalUrl: url } };
    }



    case "send_buttons": {
      const text = interpolate(String(node.data?.text ?? ""), ctx);
      const all: Array<{ id: string; label: string; type?: string; url?: string }> = (node.data?.buttons ?? []).slice(0, 6);
      if (!text || all.length === 0) throw new Error("Texto e pelo menos 1 botão obrigatórios");
      const replies = all.filter((b) => (b.type ?? "reply") === "reply").slice(0, 3);
      const urls = all.filter((b) => b.type === "url" && b.url);

      const initialQuotedId = popInitialQuotedMessageId(ctx);

      // 1) Reply buttons (grouped, max 3) — single interactive button message.
      if (replies.length > 0) {
        const body: any = {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text },
            action: {
              buttons: replies.map((b) => ({
                type: "reply",
                reply: { id: b.id, title: (b.label || "Opção").slice(0, 20) },
              })),
            },
          },
          ...(initialQuotedId ? { context: { message_id: initialQuotedId } } : {}),
        };
        if (await shouldStopFlowRun(ctx)) return {};
        const { waMsgId, phoneNumberId, toNormalized } = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
        await persistOutMessage(ctx, "interactive", body, waMsgId, phoneNumberId, toNormalized, initialQuotedId);
        if (await shouldStopFlowRun(ctx)) return {};
      }

      // 2) URL buttons — each one a separate cta_url interactive message.
      for (const b of urls) {
        const body = {
          type: "interactive",
          interactive: {
            type: "cta_url",
            body: { text: replies.length === 0 ? text : (b.label || text) },
            action: {
              name: "cta_url",
              parameters: { display_text: (b.label || "Abrir").slice(0, 20), url: interpolate(String(b.url ?? ""), ctx) },
            },
          },
        };
        if (await shouldStopFlowRun(ctx)) return {};
        const { waMsgId, phoneNumberId, toNormalized } = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
        await persistOutMessage(ctx, "interactive", body, waMsgId, phoneNumberId, toNormalized);
        if (await shouldStopFlowRun(ctx)) return {};
      }

      // Pause waiting for button reply only if there are reply buttons.
      if (replies.length === 0) {
        return { log: { urls: urls.length } };
      }
      const ttl = Number(node.data?.timeoutSeconds ?? 86400);
      return {
        pause: true,
        waitingFor: "button",
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      };
    }

    case "wait_message": {
      const infinite = !!node.data?.infinite;
      const remarketing = node.data?.remarketing;
      let expiresAt: string | null = null;
      // waiting_for tem check constraint: só aceita 'message' | 'button' | 'timer'.
      // Remarketing usa 'message' + flag no context; um valor custom quebrava o run
      // com constraint violation e deixava o fluxo travado sem enviar as próximas msgs.
      if (remarketing?.enabled) {
        const secs = Math.max(1, Number(remarketing.afterSeconds ?? 3600));
        expiresAt = new Date(Date.now() + secs * 1000).toISOString();
        ctx.variables.__remarketing = {
          nodeId: node.id,
          text: String(remarketing.text ?? ""),
          sent: false,
          finalTimeoutSeconds: infinite ? null : Number(node.data?.timeoutSeconds ?? 86400),
        };
      } else if (!infinite) {
        const ttl = Math.max(1, Number(node.data?.timeoutSeconds ?? 86400));
        expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
      }
      return { pause: true, waitingFor: "message", expiresAt };
    }

    case "wait_button": {
      const ttl = Number(node.data?.timeoutSeconds ?? 86400);
      return {
        pause: true,
        waitingFor: "button",
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      };
    }

    case "delay": {
      const secs = Math.max(1, Math.min(86400, Number(node.data?.seconds ?? 2)));
      // Sempre pausa e delega ao worker de timer. Antes, delays ≤30s usavam
      // setTimeout inline — se o worker terminava (Cloudflare kill), a run ficava
      // em "running" no delay e podia ser reexecutada, enviando mensagens em duplicata.
      return {
        pause: true,
        waitingFor: "timer",
        expiresAt: new Date(Date.now() + secs * 1000).toISOString(),
      };
    }


    case "tag_action": {
      const addIds: string[] = Array.isArray(node.data?.addTags) ? node.data.addTags : [];
      const removeIds: string[] = Array.isArray(node.data?.removeTags) ? node.data.removeTags : [];
      if (addIds.length === 0 && removeIds.length === 0) return { log: { skipped: true } };

      // Resolve tag names from ids
      const allIds = [...new Set([...addIds, ...removeIds])];
      const { data: tagRows } = await ctx.db
        .from("crm_tags" as any).select("id,nome").in("id", allIds);
      const nameById = new Map<string, string>((tagRows ?? []).map((t: any) => [t.id, t.nome]));
      const addNames = addIds.map((id) => nameById.get(id)).filter(Boolean) as string[];
      const removeNames = removeIds.map((id) => nameById.get(id)).filter(Boolean) as string[];

      // Find matching CRM lead by phone (last 10-13 digits)
      const phone = String(ctx.contactWaId ?? "").replace(/\D/g, "");
      if (!phone) return { log: { skipped: "no phone" } };
      const tail = phone.slice(-10);
      const { data: leads } = await ctx.db
        .from("crm_leads" as any).select("id,tags,telefone,expert,status").ilike("telefone", `%${tail}%`).limit(5);

      // Se nenhum lead casa com o telefone, cria um novo já com as tags —
      // assim o fluxo consegue mover o contato pro CRM automaticamente.
      let targetLeads = leads ?? [];
      if (targetLeads.length === 0) {
        // Descobre a operação/expert do canal e o nome do contato pela conversa.
        const { data: ch } = await ctx.db
          .from("wa_channels" as any).select("operacao_id").eq("id", ctx.channelId).maybeSingle();
        let contactName = "";
        if (ctx.conversationId) {
          const { data: conv } = await ctx.db
            .from("wa_conversations" as any).select("contact_name").eq("id", ctx.conversationId).maybeSingle();
          contactName = String((conv as any)?.contact_name ?? "").trim();
        }
        const insertPayload: Record<string, any> = {
          nome: contactName || phone,
          telefone: ctx.contactWaId,
          expert: (ch as any)?.operacao_id ?? null,
          tags: addNames,
          fonte: "fluxo",
        };
        const autoStatus = await resolveStageFromTags(ctx.db, addNames, insertPayload.expert);
        if (autoStatus) insertPayload.status = autoStatus;
        const { data: created, error: insErr } = await ctx.db
          .from("crm_leads" as any).insert(insertPayload).select("id,tags,expert,status").single();
        if (insErr) return { log: { error: insErr.message, tried: "create_lead" } };
        return { log: { created: true, leadId: (created as any)?.id, added: addNames, status: (created as any)?.status ?? null } };
      }

      for (const l of targetLeads) {
        const cur: string[] = Array.isArray((l as any).tags) ? (l as any).tags : [];
        const next = new Set(cur);
        for (const n of addNames) next.add(n);
        for (const n of removeNames) next.delete(n);
        const tags = Array.from(next);
        const patch: Record<string, any> = { tags, updated_at: new Date().toISOString() };
        const autoStatus = await resolveStageFromTags(ctx.db, tags, (l as any).expert);
        if (autoStatus) patch.status = autoStatus;
        await ctx.db.from("crm_leads" as any).update(patch).eq("id", (l as any).id);
      }
      return { log: { added: addNames, removed: removeNames, leads: targetLeads.length } };
    }

    case "condition": {
      const op = String(node.data?.operator ?? "text_contains");
      const rawText = ctx.lastInput?.text ?? "";
      const input = rawText.toLowerCase();
      const target = String(node.data?.value ?? "").toLowerCase();
      const msgType = String(ctx.lastInput?.messageType ?? "").toLowerCase();
      let matched = false;

      // Text-based
      if (op === "text_contains" || op === "contains") matched = !!target && input.includes(target);
      else if (op === "text_equals" || op === "equals") matched = input === target;
      else if (op === "text_starts_with" || op === "starts_with") matched = input.startsWith(target);
      else if (op === "text_regex" || op === "regex") {
        try { matched = new RegExp(node.data?.value ?? "", "i").test(rawText); } catch { matched = false; }
      }
      else if (op === "text_word_count_gte") {
        const n = Number(node.data?.value ?? 0);
        const words = rawText.trim().split(/\s+/).filter(Boolean).length;
        matched = words >= n;
      }
      // Media-based (no value needed)
      else if (op === "is_audio") matched = msgType === "audio" || msgType === "voice";
      else if (op === "is_image") matched = msgType === "image";
      else if (op === "is_video") matched = msgType === "video";
      else if (op === "is_document") matched = msgType === "document";
      else if (op === "is_sticker") matched = msgType === "sticker";
      else if (op === "is_location") matched = msgType === "location";
      else if (op === "is_contact") matched = msgType === "contacts" || msgType === "contact";
      else if (op === "is_text") matched = msgType === "text";
      else if (op === "is_button_reply") matched = !!ctx.lastInput?.buttonId;
      else if (op === "button_id_equals") matched = String(ctx.lastInput?.buttonId ?? "") === String(node.data?.value ?? "");

      return { handle: matched ? "true" : "false", log: { matched, op, msgType } };
    }

    case "random": {
      const outs: Array<{ id: string; weight: number }> = Array.isArray(node.data?.outputs) ? node.data.outputs : [];
      const valid = outs.filter((o) => o && typeof o.id === "string");
      if (valid.length === 0) return { handle: "out" };
      const weights = valid.map((o) => Math.max(0, Number(o.weight ?? 0)));
      const total = weights.reduce((a, b) => a + b, 0);
      let pickIdx = 0;
      if (total <= 0) {
        pickIdx = Math.floor(Math.random() * valid.length);
      } else {
        const r = Math.random() * total;
        let acc = 0;
        for (let i = 0; i < valid.length; i++) {
          acc += weights[i];
          if (r <= acc) { pickIdx = i; break; }
        }
      }
      const chosen = valid[pickIdx];
      return { handle: chosen.id, log: { chosen: chosen.id, weight: weights[pickIdx], total } };
    }

    case "end":
      return { end: true };

    default:
      throw new Error(`Tipo de nó desconhecido: ${node.type}`);
  }
}

// ============================================================
// Public entry points (called by webhook)
// ============================================================

export async function runFlowAdmin(args: {
  flowId: string;
  channelId: string;
  contactWaId: string;
  conversationId: string | null;
  triggerContext?: any;
  db?: any;
  vendor?: VendorRunContext | null;
  queueOnly?: boolean;
}) {
  const db = args.db ?? await getAdminDb();
  const flow = await loadFlow(args.flowId, db);
  const nodes: Node[] = jsonArray<Node>(flow.nodes);
  const edges: Edge[] = jsonArray<Edge>(flow.edges);
  if (nodes.length === 0) throw new Error("Fluxo sem nós");

  // Se o vendedor cancelou este fluxo agora há pouco, não deixa gatilho
  // automático/webhook recriar a mesma execução logo em seguida. Disparo manual
  // explícito continua permitido.
  if ((args.triggerContext as any)?.manual !== true) {
    const contactCandidates = whatsappNumberVariants(String(args.contactWaId ?? ""));
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentCancelled } = await db
      .from("wa_flow_runs" as any)
      .select("id, updated_at")
      .eq("flow_id", args.flowId)
      .eq("channel_id", args.channelId)
      .in("contact_wa_id", contactCandidates.length > 0 ? contactCandidates : [String(args.contactWaId ?? "")])
      .eq("status", "cancelled")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentCancelled) {
      console.log("[flow-engine] dispatch skipped after recent manual cancel", {
        flowId: args.flowId,
        channelId: args.channelId,
        contactWaId: args.contactWaId,
        cancelledRunId: (recentCancelled as any).id,
      });
      return { runId: (recentCancelled as any).id, skipped: true, recentlyCancelled: true };
    }
  }

  // Idempotency guard: se já existe uma run ativa (queued/running/waiting)
  // pra mesma combinação flow + canal + contato.
  // Se for disparo MANUAL pelo vendedor, encerra a run ativa anterior para que o novo fluxo rode na hora!
  {
    const contactCandidates = whatsappNumberVariants(String(args.contactWaId ?? ""));
    const isManual = (args.triggerContext as any)?.manual === true;

    if (isManual) {
      const { data: activeRuns } = await db
        .from("wa_flow_runs" as any)
        .select("id")
        .eq("channel_id", args.channelId)
        .in("contact_wa_id", contactCandidates.length > 0 ? contactCandidates : [String(args.contactWaId ?? "")])
        .in("status", ["queued", "running", "waiting"]);

      if (activeRuns && activeRuns.length > 0) {
        const idsToCancel = activeRuns.map((r: any) => String(r.id));
        await db.from("wa_flow_runs" as any).update({
          status: "cancelled",
          waiting_for: null,
          expires_at: null,
          error: "Substituído por novo disparo manual",
          updated_at: new Date().toISOString(),
        }).in("id", idsToCancel);
      }
    } else {
      const { data: existingActive } = await db
        .from("wa_flow_runs" as any)
        .select("id, status, current_node_id, contact_wa_id")
        .eq("flow_id", args.flowId)
        .eq("channel_id", args.channelId)
        .in("contact_wa_id", contactCandidates)
        .in("status", ["queued", "running", "waiting"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingActive) {
        console.log("[flow-engine] duplicate dispatch skipped", {
          flowId: args.flowId, channelId: args.channelId, contactWaId: args.contactWaId,
          existingRunId: (existingActive as any).id, status: (existingActive as any).status,
        });
        return { runId: (existingActive as any).id, deduped: true };
      }
    }
  }

  let entryId: string | null = flow.entry_node_id ?? null;
  if (!entryId) entryId = nodes.find((n) => n.type === "trigger")?.id ?? null;
  if (!entryId) {
    const targets = new Set(edges.map((e) => e.target));
    entryId = nodes.find((n) => !targets.has(n.id))?.id ?? nodes[0].id;
  }

  const entryNode = nodes.find((n) => n.id === entryId);
  const startId =
    entryNode?.type === "trigger" ? nextNodeId(edges, entryId!) : entryId;

  const run = await createFlowRun(db, {
    flowId: args.flowId,
    conversationId: args.conversationId,
    channelId: args.channelId,
    contactWaId: args.contactWaId,
    currentNodeId: startId ?? entryId,
    triggerContext: args.triggerContext,
    vendor: args.vendor,
  });

  // Non-blocking mode: mark as queued and let the background worker execute it.
  if (args.queueOnly) {
    const queueCtx: Ctx = {
      runId: String((run as any).id),
      flowId: args.flowId,
      channelId: args.channelId,
      contactWaId: args.contactWaId,
      conversationId: (run as any).conversation_id ?? args.conversationId,
      db,
      variables: { trigger: args.triggerContext ?? {} },
      vendor: args.vendor ?? null,
    };
    await updateFlowRun(queueCtx, { status: "queued", waiting_for: null, expires_at: null });
    return { runId: (run as any).id, queued: true };
  }

  const ctx: Ctx = {
    runId: (run as any).id,
    flowId: args.flowId,
    channelId: args.channelId,
    contactWaId: args.contactWaId,
    conversationId: (run as any).conversation_id ?? args.conversationId,
    db,
    variables: { trigger: args.triggerContext ?? {} },
    vendor: args.vendor ?? null,
  };

  if (!startId) {
    await updateFlowRun(ctx, { status: "completed" });
    return { runId: ctx.runId, completed: true, reason: "no_next_node" };
  }
  await executeFrom(ctx, startId);
  return { runId: ctx.runId };
}

// Background worker: claims up to `limit` queued runs and executes them in parallel.
export async function processQueuedFlowRuns(limit = 20) {
  const db = await getAdminDb();
  const { data: claimed, error } = await db.rpc("claim_queued_flow_runs" as any, { _limit: limit });
  if (error) throw new Error(error.message);
  const runs = Array.isArray(claimed) ? claimed : [];
  if (runs.length === 0) return { processed: 0, results: [] };

  const results = await Promise.allSettled(
    runs.map(async (run: any) => {
      const ctx: Ctx = {
        runId: String(run.id),
        flowId: String(run.flow_id),
        channelId: String(run.channel_id),
        contactWaId: String(run.contact_wa_id),
        conversationId: run.conversation_id ?? null,
        db,
        variables: run.context && typeof run.context === "object" ? { ...run.context, trigger: (run.context as any).trigger ?? {} } : { trigger: {} },
        vendor: null,
      };
      const startId = run.current_node_id ? String(run.current_node_id) : null;
      if (!startId) {
        await updateFlowRun(ctx, { status: "completed" });
        return { runId: ctx.runId, completed: true };
      }
      try {
        await executeFrom(ctx, startId);
        return { runId: ctx.runId, ok: true };
      } catch (err: any) {
        await updateFlowRun(ctx, { status: "failed", error: String(err?.message ?? err) });
        return { runId: ctx.runId, error: String(err?.message ?? err) };
      }
    }),
  );

  return {
    processed: runs.length,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  };
}

// Wakes up flow runs paused on a `delay` node whose timer has expired.
// Advances to the next node and resumes execution.
export async function processExpiredTimerRuns(limit = 20) {
  const db = await getAdminDb();
  const { data: expired, error } = await db.rpc("claim_expired_timer_flow_runs" as any, { _limit: limit });
  if (error) throw new Error(error.message);
  const claimed = Array.isArray(expired) ? expired : [];
  if (claimed.length === 0) return { resumed: 0, results: [] };

  const results = await Promise.allSettled(
    claimed.map(async (run: any) => {
      const flow = await loadFlow(String(run.flow_id), db);
      const edges: Edge[] = jsonArray<Edge>(flow.edges);
      const nextId = nextNodeId(edges, String(run.current_node_id));
      const ctx: Ctx = {
        runId: String(run.id),
        flowId: String(run.flow_id),
        channelId: String(run.channel_id),
        contactWaId: String(run.contact_wa_id),
        conversationId: run.conversation_id ?? null,
        db,
        variables: run.context && typeof run.context === "object" ? { ...run.context, trigger: (run.context as any).trigger ?? {} } : { trigger: {} },
        vendor: null,
      };
      if (!nextId) {
        await updateFlowRun(ctx, { status: "completed" });
        return { runId: ctx.runId, completed: true };
      }
      try {
        // Move the pointer off the delay before executing the next node. If the
        // worker is interrupted while sending media, the run will not be
        // recovered as the same delay again and duplicate the message.
        await updateFlowRun(ctx, {
          status: "running",
          waiting_for: null,
          expires_at: null,
          current_node_id: nextId,
        });
        await executeFrom(ctx, nextId);
        return { runId: ctx.runId, ok: true };
      } catch (err: any) {
        await updateFlowRun(ctx, { status: "failed", error: String(err?.message ?? err) });
        return { runId: ctx.runId, error: String(err?.message ?? err) };
      }
    }),
  );

  return {
    resumed: claimed.length,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  };
}

// Recovers delay nodes that were left as `running` before the worker could mark
// them as queued/waiting. This prevents manual vendor triggers from staying stuck.
export async function processStaleRunningDelayRuns(olderThanSeconds = 90, limit = 20) {
  const db = await getAdminDb();
  const { data: stale, error } = await db.rpc("claim_stale_running_delay_flow_runs" as any, {
    _older_than_seconds: olderThanSeconds,
    _limit: limit,
  });
  if (error) throw new Error(error.message);
  const runs = Array.isArray(stale) ? stale : [];
  return {
    recovered: runs.length,
    results: runs.map((run: any) => ({
      runId: String(run.id),
      status: run.status,
      waitingFor: run.waiting_for,
      expiresAt: run.expires_at,
    })),
  };
}

// Recupera runs travados em nós de envio/ação com status "running" mas sem
// waiting_for (Worker morreu no meio do loop).
// Se estava num nó de envio (send_*): marca como failed — envio provavelmente silhou.
// Se estava em outro tipo de nó: avança pro próximo.
export async function processStaleRunningSendRuns(olderThanSeconds = 60, limit = 20) {
  const db = await getAdminDb();
  const { data: stale, error } = await db.rpc("claim_stale_running_send_flow_runs" as any, {
    _older_than_seconds: olderThanSeconds,
    _limit: limit,
  });
  if (error) throw new Error(error.message);
  const runs = Array.isArray(stale) ? stale : [];
  if (runs.length === 0) return { recovered: 0, results: [] };

  const SEND_NODE_TYPES = new Set(["send_text", "send_image", "send_video", "send_audio", "send_document", "send_buttons", "send_list"]);

  const results = await Promise.allSettled(
    runs.map(async (run: any) => {
      const ctx: Ctx = {
        runId: String(run.id),
        flowId: String(run.flow_id),
        channelId: String(run.channel_id),
        contactWaId: String(run.contact_wa_id),
        conversationId: run.conversation_id ?? null,
        db,
        variables: (run.context as any) ?? {},
        vendor: null,
      };
      try {
        const flow = await loadFlow(ctx.flowId, db);
        const nodes: Node[] = jsonArray<Node>(flow.nodes);
        const edges: Edge[] = jsonArray<Edge>(flow.edges);
        const currentNode = nodes.find((n) => n.id === String(run.current_node_id));

        // Se estava num nó de envio e o worker morreu: o envio pode ter falhado.
        // Marca como failed para parar o fluxo e evitar envios duplicados ao retomar.
        if (currentNode && SEND_NODE_TYPES.has(currentNode.type)) {
          await updateFlowRun(ctx, {
            status: "failed",
            error: `Envio de ${currentNode.type} travado (worker timeout após ${olderThanSeconds}s)`,
          });
          console.warn(`[flow-engine] stale send run ${ctx.runId} marked failed (node: ${currentNode.type})`);
          return { runId: ctx.runId, failed: true, nodeType: currentNode.type };
        }

        // Para outros nós (ação, condição, etc.): avança pro próximo nó
        const nextId = nextNodeId(edges, String(run.current_node_id));
        if (!nextId) {
          await updateFlowRun(ctx, { status: "completed", waiting_for: null, expires_at: null });
          return { runId: ctx.runId, completed: true };
        }
        await updateFlowRun(ctx, {
          status: "running",
          waiting_for: null,
          expires_at: null,
          current_node_id: nextId,
        });
        await executeFrom(ctx, nextId);
        return { runId: ctx.runId, ok: true, resumedFrom: nextId };
      } catch (err: any) {
        await updateFlowRun(ctx, { status: "failed", error: String(err?.message ?? err) });
        return { runId: ctx.runId, error: String(err?.message ?? err) };
      }
    }),
  );

  return {
    recovered: runs.length,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  };
}



// Clears flows that were waiting for a user reply/button and already expired.
// Timer delays are handled by processExpiredTimerRuns; do not cancel them here.
export async function processExpiredWaitingRuns(olderThanSeconds = 60, limit = 100) {
  const db = await getAdminDb();
  const { data: expired, error } = await db.rpc("cancel_expired_waiting_flow_runs" as any, {
    _older_than_seconds: olderThanSeconds,
    _limit: limit,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(expired) ? expired : [];
  return {
    cancelled: rows.length,
    results: rows.map((run: any) => ({
      runId: String(run.id),
      waitingFor: run.waiting_for,
      expiresAt: run.expires_at,
    })),
  };
}


export async function advanceWaitingRun(args: {
  conversationId: string;
  input: { text?: string | null; buttonId?: string | null; messageType?: string | null };
  db?: any;
}) {
  const db = args.db ?? await getAdminDb();
  // Find a waiting run for this conversation
  const { data: run } = await db
    .from("wa_flow_runs" as any)
    .select("*")
    .eq("conversation_id", args.conversationId)
    .eq("status", "waiting")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;

  const r = run as any;
  const flow = await loadFlow(r.flow_id, db);
  const edges: Edge[] = jsonArray<Edge>(flow.edges);

  const ctx: Ctx = {
    runId: r.id,
    flowId: r.flow_id,
    channelId: r.channel_id,
    contactWaId: r.contact_wa_id,
    conversationId: r.conversation_id,
    db,
    variables: r.context ?? {},
    lastInput: args.input,
  };

  // Choose next node based on what we were waiting for
  let nextId: string | null = null;
  if (r.waiting_for === "button" && args.input.buttonId) {
    nextId = nextNodeId(edges, r.current_node_id, args.input.buttonId);
    if (!nextId) nextId = nextNodeId(edges, r.current_node_id); // fallback default out
  } else {
    nextId = nextNodeId(edges, r.current_node_id);
  }

  if (!nextId) {
    await updateFlowRun(ctx, { status: "completed", waiting_for: null });
    return { runId: r.id, completed: true };
  }

  await updateFlowRun(ctx, { status: "running", waiting_for: null });
  await executeFrom(ctx, nextId);
  return { runId: r.id };
}

// Called by webhook for every incoming message
export async function dispatchIncomingForFlows(args: {
  conversationId: string;
  channelId: string;
  contactWaId: string;
  text: string | null;
  buttonId: string | null;
  messageType?: string | null;
  isFirstMessage: boolean;
  db?: any;
}) {
  const db = args.db ?? await getAdminDb();
  // 1. Advance a waiting run if any
  const advanced = await advanceWaitingRun({
    conversationId: args.conversationId,
    input: { text: args.text, buttonId: args.buttonId, messageType: args.messageType ?? null },
    db,
  });
  if (advanced) return advanced;

  // 2. Look up active triggers
  const { data: triggers } = await db
    .from("wa_flow_triggers" as any)
    .select("*, wa_flows!inner(id, ativo, entry_node_id)")
    .eq("ativo", true);

  const t = (triggers ?? []) as any[];
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const text = norm(args.text ?? "");

  // Verifica janela opcional de dias/horário do gatilho.
  // Se days_of_week/time_start/time_end estiverem NULL, o gatilho roda o tempo todo.
  const isWithinSchedule = (trg: any): boolean => {
    const days = Array.isArray(trg.days_of_week) ? trg.days_of_week : null;
    const start = trg.time_start || null;
    const end = trg.time_end || null;
    if (!days && !start && !end) return true;
    const tz = trg.timezone || "America/Sao_Paulo";
    let parts: Record<string, string> = {};
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      });
      for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
    } catch { return true; }
    const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = DOW[parts.weekday as string] ?? new Date().getDay();
    if (days && days.length && !days.includes(dow)) return false;
    if (start || end) {
      const hh = parseInt(parts.hour ?? "0", 10);
      const mm = parseInt(parts.minute ?? "0", 10);
      const cur = hh * 60 + mm;
      const toMin = (s: string) => { const [a, b] = s.split(":").map((x) => parseInt(x, 10)); return (a || 0) * 60 + (b || 0); };
      const s = start ? toMin(start) : 0;
      const e = end ? toMin(end) : 24 * 60;
      // suporta janela que cruza meia-noite (ex: 22:00-06:00)
      if (s <= e) { if (cur < s || cur > e) return false; }
      else { if (cur < s && cur > e) return false; }
    }
    return true;
  };

  for (const trg of t) {
    if (!trg.wa_flows?.ativo) continue;
    if (trg.channel_id && trg.channel_id !== args.channelId) continue;
    if (!isWithinSchedule(trg)) continue;

    let match = false;
    if (trg.tipo === "any_message") match = true;
    else if (trg.tipo === "new_conversation") match = args.isFirstMessage;
    else if (trg.tipo === "keyword") {
      const v = norm(String(trg.valor ?? ""));
      if (!v) continue;
      const mode = trg.match_mode ?? "word";
      if (mode === "equals") {
        // Frase-chave: mensagem inteira precisa bater exato (após normalizar)
        match = text === v;
      } else if (mode === "starts_with") match = text.startsWith(v);
      else if (mode === "regex") {
        try { match = new RegExp(trg.valor, "i").test(args.text ?? ""); } catch { match = false; }
      } else if (mode === "word") {
        // Palavra-chave: match por borda de palavra (não pega substring)
        const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        try { match = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u").test(text); }
        catch { match = new RegExp(`\\b${escaped}\\b`).test(text); }
      } else {
        // legado: contains
        match = text.includes(v);
      }
    }

    if (match) {
      return runFlowAdmin({
        flowId: trg.flow_id,
        channelId: args.channelId,
        contactWaId: args.contactWaId,
        conversationId: args.conversationId,
        db,
        triggerContext: { tipo: trg.tipo, valor: trg.valor, input: args.text },
      });
    }
  }

  return null;
}

// Verifica janela opcional de dias/horário do gatilho (compartilhada).
function triggerScheduleAllows(trg: any): boolean {
  const days = Array.isArray(trg.days_of_week) ? trg.days_of_week : null;
  const start = trg.time_start || null;
  const end = trg.time_end || null;
  if (!days && !start && !end) return true;
  const tz = trg.timezone || "America/Sao_Paulo";
  const parts: Record<string, string> = {};
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    });
    for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
  } catch { return true; }
  const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = DOW[parts.weekday as string] ?? new Date().getDay();
  if (days && days.length && !days.includes(dow)) return false;
  if (start || end) {
    const hh = parseInt(parts.hour ?? "0", 10);
    const mm = parseInt(parts.minute ?? "0", 10);
    const cur = hh * 60 + mm;
    const toMin = (s: string) => { const [a, b] = s.split(":").map((x) => parseInt(x, 10)); return (a || 0) * 60 + (b || 0); };
    const s = start ? toMin(start) : 0;
    const e = end ? toMin(end) : 24 * 60;
    if (s <= e) { if (cur < s || cur > e) return false; }
    else { if (cur < s && cur > e) return false; }
  }
  return true;
}

// Dispatch flows tied to "new_lead" trigger when a CRM lead is inserted.
export async function dispatchNewLead(args: { leadId: string; db?: any }) {
  const db = args.db ?? await getAdminDb();
  const { data: lead } = await db
    .from("crm_leads" as any).select("*").eq("id", args.leadId).maybeSingle();
  if (!lead) return { matched: 0, reason: "lead not found" };
  const l: any = lead;
  const phoneDigits = String(l.telefone ?? "").replace(/\D/g, "");
  if (!phoneDigits) return { matched: 0, reason: "no phone" };

  const { data: triggers } = await db
    .from("wa_flow_triggers" as any)
    .select("*, wa_flows!inner(id, ativo, entry_node_id, operacao_id)")
    .eq("ativo", true)
    .eq("tipo", "new_lead");

  let started = 0;
  const seenFlowChannel = new Set<string>();
  for (const trg of (triggers ?? []) as any[]) {
    if (!trg.wa_flows?.ativo) continue;
    if (!triggerScheduleAllows(trg)) continue;
    const flowOp = trg.wa_flows?.operacao_id;
    if (flowOp && l.expert && String(flowOp) !== String(l.expert) && String(flowOp) !== String(l.operacao_id ?? "")) continue;
    if (!trg.channel_id) continue;
    // Dedupe múltiplos triggers apontando pro mesmo (flow, canal)
    const key = `${trg.flow_id}::${trg.channel_id}`;
    if (seenFlowChannel.has(key)) continue;
    seenFlowChannel.add(key);
    await runFlowAdmin({
      flowId: trg.flow_id,
      channelId: trg.channel_id,
      contactWaId: phoneDigits,
      conversationId: null,
      db,
      triggerContext: { tipo: "new_lead", lead: { id: l.id, nome: l.nome, telefone: l.telefone, email: l.email } },
    });
    started++;
  }
  return { matched: started };
}
