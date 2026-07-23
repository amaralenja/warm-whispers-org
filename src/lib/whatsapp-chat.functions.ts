import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
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
    const err = body?.error ?? {};
    const parts = [
      err.error_user_title,
      err.error_user_msg,
      err.message || body?.message,
      err.error_subcode ? `subcode ${err.error_subcode}` : null,
      err.code ? `code ${err.code}` : null,
      err.type || null,
    ].filter(Boolean);
    const msg = parts.length ? parts.join(" — ") : `Meta HTTP ${res.status}`;
    console.error("[metaProxy] Meta rejected request", { path, status: res.status, body });
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

function shouldNormalizeWhatsappImage(url: string): boolean {
  const clean = String(url ?? "").split("?")[0].toLowerCase();
  return clean.endsWith(".png") || clean.endsWith(".webp") || clean.endsWith(".heic") || clean.endsWith(".heif");
}

function shouldNormalizeWhatsappVideo(url: string): boolean {
  const clean = String(url ?? "").split("?")[0].toLowerCase();
  return clean.endsWith(".mov") || clean.endsWith(".quicktime") || clean.endsWith(".hevc") || clean.endsWith(".heic") || clean.endsWith(".m4v") || !clean.endsWith(".mp4");
}

async function withRetry<T>(label: string, attempts: number, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.warn(`[whatsapp-chat] ${label} tentativa ${i + 1} falhou`, e);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 900 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? `${label} falhou`));
}

// --- DB reads ---

async function dbFor(context: any) {
  if (context?.vendor) {
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

function sameWorkspace(a: unknown, b: unknown) {
  return normalizeText(a) === normalizeText(b);
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

function uniqueRowsById<T extends { id?: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = String(row?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

async function autoAssignUnassignedConversations(db: any, channelIds?: string[]) {
  const allowedChannels = Array.isArray(channelIds) ? channelIds.map(String).filter(Boolean) : [];
  let q = db
    .from("wa_conversations" as any)
    .select("id,channel_id")
    .is("assigned_vendor_id", null)
    .or("operacao_id.is.null,operacao_id.neq.__notificador__")
    .limit(200);

  if (allowedChannels.length > 0) q = q.in("channel_id", allowedChannels);

  const { data: rows, error } = await q;
  if (error || !Array.isArray(rows) || rows.length === 0) return;

  // IMPORTANTE: NÃO cachear o vendedor por canal. Antes, a gente pegava um único
  // vendedor via `assign_vendor_for_channel` e reusava pra TODAS as conversas
  // não atribuídas do mesmo canal — resultado: todos os leads da Jéssica caíam
  // pro Caio (ou vice-versa) em um único disparo. Agora cada conversa recebe
  // seu próprio sorteio ponderado, mantendo o balanceamento por vendedor.
  for (const row of rows as any[]) {
    const channelId = String(row.channel_id ?? "");
    if (!channelId) continue;

    const { data: vendorId } = await db.rpc("assign_vendor_for_channel" as any, { _channel_id: channelId });
    if (!vendorId) continue;

    await db
      .from("wa_conversations" as any)
      .update({ assigned_vendor_id: Number(vendorId) })
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
  if (context?.vendor) {
    const rpcArgs = vendorRpcArgs(context);
    if (!rpcArgs) throw new Error("Sessão de vendedor inválida");

    const channelId = String(fallback?.channelId ?? "").trim() || null;
    const contactWaId = String(fallback?.contactWaId ?? "").trim() || null;
    const { data: rpcData, error: rpcError } = await db.rpc("vendor_resolve_wa_conversation" as any, {
      ...rpcArgs,
      _conversation_id: conversationId || null,
      _channel_id: channelId,
      _contact_wa_id: contactWaId,
    });
    if (rpcError) {
      console.error("[whatsapp-chat] vendor_resolve_wa_conversation failed", {
        error: rpcError,
        vendorId: rpcArgs._vendor_id,
        conversationId,
        channelId,
        contactWaId,
      });
      throw new Error(`Conversa não encontrada (id=${conversationId.slice(0, 8)}… canal=${String(channelId ?? "").slice(0, 8)}… contato=${contactWaId ?? ""})`);
    }

    const conv = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!conv) {
      throw new Error(`Conversa não encontrada (id=${conversationId.slice(0, 8)}… canal=${String(channelId ?? "").slice(0, 8)}… contato=${contactWaId ?? ""})`);
    }
    return conv as any;
  }

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
    const assignedVendorId = (conv as any).assigned_vendor_id == null ? null : Number((conv as any).assigned_vendor_id);
    const currentVendorId = Number(context.vendor.id);
    // Se a conversa já está atribuída ao vendedor, libera mesmo que o cadastro do canal
    // esteja sem vínculo/operacao correto. Isso evita chat zerado e envio bloqueado
    // para vendedores que já receberam leads antes da normalização dos canais.
    if (assignedVendorId !== currentVendorId) {
      await assertVendorChannel(context, String((conv as any).channel_id), db);
    }
    if (assignedVendorId == null) {
      const vendorId = currentVendorId;
      await db
        .from("wa_conversations" as any)
        .update({ assigned_vendor_id: vendorId })
        .eq("id", (conv as any).id)
        .is("assigned_vendor_id", null);
      return { ...(conv as any), assigned_vendor_id: vendorId };
    }
    if (assignedVendorId !== currentVendorId) {
      throw new Error("Inautorizado: este lead está com outro vendedor");
    }
  }
  return conv as any;
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { operacaoId?: string; vendorId?: number | null; phone?: string | null } | undefined) => ({
    operacaoId: d?.operacaoId ?? null,
    vendorId: d?.vendorId ?? null,
    phone: d?.phone ? String(d.phone) : null,
  }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    const phoneDigits = String(data.phone ?? "").replace(/\D+/g, "");
    const phoneCandidates = (() => {
      if (!phoneDigits) return [] as string[];
      const set = new Set<string>([phoneDigits]);
      const add = (value: string) => {
        const digits = String(value ?? "").replace(/\D+/g, "");
        if (digits) set.add(digits);
      };
      if (!phoneDigits.startsWith("55") && (phoneDigits.length === 10 || phoneDigits.length === 11)) add(`55${phoneDigits}`);
      if (phoneDigits.startsWith("55")) add(phoneDigits.slice(2));
      const withoutCountry = phoneDigits.startsWith("55") ? phoneDigits.slice(2) : phoneDigits;
      if (withoutCountry.length === 10) {
        const withNine = `${withoutCountry.slice(0, 2)}9${withoutCountry.slice(2)}`;
        add(withNine);
        add(`55${withNine}`);
      }
      if (withoutCountry.length === 11 && withoutCountry[2] === "9") {
        const withoutNine = `${withoutCountry.slice(0, 2)}${withoutCountry.slice(3)}`;
        add(withoutNine);
        add(`55${withoutNine}`);
      }
      if (phoneDigits.length > 8) add(phoneDigits.slice(-8));
      return Array.from(set).filter((v) => v.length >= 8);
    })();
    const phoneMatches = (row: any) => {
      if (phoneCandidates.length === 0) return true;
      const wa = String(row?.contact_wa_id ?? "").replace(/\D+/g, "");
      return phoneCandidates.some((candidate) => wa === candidate || wa.endsWith(candidate) || candidate.endsWith(wa));
    };
    const rpcArgs = (context as any)?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const vendorId = Number((context as any).vendor.id);
      const { data: rows, error } = await db.rpc("vendor_list_wa_conversations" as any, {
        ...rpcArgs,
        _operacao_id: data.operacaoId ?? null,
      });
      if (error) {
        console.error("[whatsapp-chat] vendor listConversations RPC failed", {
          vendorId,
          operacaoId: data.operacaoId ?? null,
          error: error.message,
        });
        throw new Error(error.message);
      }
      let result = ((rows ?? []) as any[])
        .filter(phoneMatches)
        .sort((a, b) => new Date(b?.last_message_at ?? 0).getTime() - new Date(a?.last_message_at ?? 0).getTime());

      // Fallback: vendedor abriu um lead pelo Kanban mas a conversa está atribuída
      // a outro vendedor (ou sem vendor). Se o número existe em um canal permitido
      // dessa vendedora, reatribui pra ela e retorna a conversa.
      if (result.length === 0 && phoneCandidates.length > 0) {
        const allowed = await vendorChannelIds(context, db);
        if (allowed.length > 0) {
          const filters = phoneCandidates.flatMap((candidate) => [
            `contact_wa_id.eq.${candidate}`,
            `contact_wa_id.ilike.%${candidate}%`,
          ]);
          const { data: candidates } = await db
            .from("wa_conversations" as any)
            .select("*")
            .in("channel_id", allowed)
            .or(filters.join(","))
            .limit(20);
          const matches = ((candidates ?? []) as any[]).filter(phoneMatches);
          if (matches.length > 0) {
            const ids = matches.map((m) => m.id);
            await db
              .from("wa_conversations" as any)
              .update({ assigned_vendor_id: vendorId })
              .in("id", ids);
            result = matches
              .map((m) => ({ ...m, assigned_vendor_id: vendorId }))
              .sort((a, b) => new Date(b?.last_message_at ?? 0).getTime() - new Date(a?.last_message_at ?? 0).getTime());
            console.info("[whatsapp-chat] vendor listConversations reassigned by phone", {
              vendorId,
              phone: data.phone,
              reassigned: ids.length,
            });
          }
        }
      }

      console.info("[whatsapp-chat] vendor listConversations", {
        vendorId,
        operacaoId: data.operacaoId ?? null,
        rows: result.length,
      });
      return result;
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
      .limit(2000)
      .or("operacao_id.is.null,operacao_id.neq.__notificador__");
    if (notifIds.length) q = q.not("channel_id", "in", `(${notifIds.map((i) => `"${i}"`).join(",")})`);
    if (data.operacaoId) q = q.eq("operacao_id", data.operacaoId);
    if (phoneCandidates.length) {
      const filters = phoneCandidates.flatMap((candidate) => [
        `contact_wa_id.eq.${candidate}`,
        `contact_wa_id.ilike.%${candidate}%`,
      ]);
      q = q.or(filters.join(",")).limit(50);
    }

    if (isVendor) {
      if (allowed.length === 0) return [];
      q = q.in("channel_id", allowed).eq("assigned_vendor_id", Number((context as any).vendor.id));
    } else if (data.vendorId != null) q = q.eq("assigned_vendor_id", data.vendorId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return phoneCandidates.length ? ((rows ?? []) as any[]).filter(phoneMatches) : rows ?? [];
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) => ({ conversationId: String(d?.conversationId ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) return [];
    const db = await dbFor(context);
    const rpcArgs = (context as any)?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const vendorId = Number((context as any).vendor.id);
      const { data: rows, error } = await db.rpc("vendor_list_wa_messages" as any, {
        ...rpcArgs,
        _conversation_id: data.conversationId,
      });
      if (error) {
        console.error("[whatsapp-chat] vendor listMessages RPC failed", {
          vendorId,
          conversationId: data.conversationId,
          error: error.message,
        });
        throw new Error(error.message);
      }
      console.info("[whatsapp-chat] vendor listMessages", {
        vendorId,
        conversationId: data.conversationId,
        rows: Array.isArray(rows) ? rows.length : 0,
      });
      return rows ?? [];
    }
    await assertConversationAccess(context, db, data.conversationId);
    const { data: rows, error } = await db
      .from("wa_messages" as any)
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(2000);

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
      const vendorId = Number((context as any).vendor.id);
      const { data: ok, error } = await db.rpc("vendor_mark_conversation_read" as any, {
        ...rpcArgs,
        _conversation_id: data.conversationId,
      });
      if (error) {
        console.error("[whatsapp-chat] vendor markRead RPC failed", {
          vendorId,
          conversationId: data.conversationId,
          error: error.message,
        });
        throw new Error(error.message);
      }
      console.info("[whatsapp-chat] vendor markRead", { vendorId, conversationId: data.conversationId, ok: Boolean(ok) });
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

export const setConversationArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; archived: boolean }) => ({
    conversationId: String(d?.conversationId ?? ""),
    archived: Boolean(d?.archived),
  }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) throw new Error("conversationId obrigatório");
    const db = await dbFor(context);
    await assertConversationAccess(context, db, data.conversationId);
    const { error } = await db
      .from("wa_conversations" as any)
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
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
    const conv = await assertConversationAccess(context, db, data.conversationId);
    if (String(conv.channel_id) !== String(data.channelId)) throw new Error("Canal não pertence a esta conversa");
    if (!data.base64) throw new Error("Arquivo vazio");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "arquivo.bin";
    const ext = safeName.split(".").pop() || "bin";
    const path = `${data.channelId}/${data.conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(data.base64, "base64");
    await withRetry("upload da mídia", 3, async () => {
      const { error } = await supabaseAdmin.storage.from("wa-media").upload(path, buffer, {
        contentType: data.contentType,
        upsert: false,
      });
      if (error) throw new Error(error.message);
      return true;
    });
    const signed = await withRetry("gerar URL da mídia", 3, async () => {
      const res = await supabaseAdmin.storage.from("wa-media").createSignedUrl(path, 60 * 60 * 24);
      if (res.error || !res.data?.signedUrl) throw new Error(res.error?.message ?? "Erro ao gerar URL");
      return res;
    });
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
  contextWaMessageId?: string;
  replyPreview?: string;
};


// Brazilian numbers: WhatsApp Cloud API expects mobile as 55 + DDD + 9 + 8 digits.
// Many contacts arrive without the "9" (legacy 10-digit format). Insert it when missing.
function normalizeBrWhatsappNumber(raw: string): string {
  const rawStr = String(raw ?? "").trim();
  let digits = rawStr.replace(/\D/g, "");
  // Se veio com "+" explícito, é internacional — nunca prefixar 55.
  const hasPlus = rawStr.startsWith("+");
  // Heurística BR: DDD válido (dígitos 1-9, 1-9). Móvel BR de 11 dígitos tem o "9" na posição 2.
  const dddOk = digits.length >= 2 && digits[0] !== "0" && digits[1] !== "0";
  const looksBr11 = digits.length === 11 && dddOk && digits[2] === "9";
  const looksBr10 = digits.length === 10 && dddOk;
  if (!hasPlus && !digits.startsWith("55") && (looksBr10 || looksBr11)) {
    digits = `55${digits}`;
  }
  if (digits.startsWith("55") && digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8 && ddd[0] !== "0" && ddd[1] !== "0") {
      return `55${ddd}9${rest}`;
    }
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
    if (value.startsWith("55") && value.length === 13 && value[4] === "9") {
      variants.add(`${value.slice(0, 4)}${value.slice(5)}`);
    }
    if (value.startsWith("55") && value.length === 12) {
      variants.add(`${value.slice(0, 4)}9${value.slice(4)}`);
    }
  }
  return Array.from(variants).filter(Boolean);
}

async function resolveStageFromTags(db: any, tags: string[], operation?: unknown) {
  const tagNames = [...new Set(tags.map((t) => String(t ?? "").trim()).filter(Boolean))];
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

async function syncConversationTagsToCrmLead(db: any, conversationId: string, oldTags: string[], nextTags: string[]) {
  const { data: conv, error: convError } = await db
    .from("wa_conversations" as any)
    .select("id,contact_wa_id,operacao_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convError) throw new Error(convError.message);
  if (!conv?.contact_wa_id) return { updated: 0 };

  const added = nextTags.filter((t) => !oldTags.some((o) => o.toLowerCase() === t.toLowerCase()));
  const removed = oldTags.filter((t) => !nextTags.some((n) => n.toLowerCase() === t.toLowerCase()));
  if (added.length === 0 && removed.length === 0) return { updated: 0 };

  const variants = whatsappNumberVariants(String(conv.contact_wa_id));
  const tails = [...new Set(
    variants
      .flatMap((n) => [n.slice(-13), n.slice(-12), n.slice(-11), n.slice(-10), n.slice(-8)])
      .filter((n) => n.length >= 8),
  )];
  const byId = new Map<string, any>();

  for (const tail of tails) {
    const { data: rows } = await db
      .from("crm_leads" as any)
      .select("id,tags,telefone,expert,status")
      .ilike("telefone", `%${tail}%`)
      .limit(20);
    for (const row of (rows ?? []) as any[]) byId.set(String(row.id), row);
  }

  const operation = String(conv.operacao_id ?? "").trim();
  let updated = 0;
  for (const lead of byId.values()) {
    if (operation && operation !== "__notificador__" && lead?.expert && !sameWorkspace(lead.expert, operation)) continue;

    const current = Array.isArray(lead.tags) ? lead.tags.map((t: unknown) => String(t)).filter(Boolean) : [];
    const lowerRemoved = new Set(removed.map((t) => t.toLowerCase()));
    const merged = current.filter((t: string) => !lowerRemoved.has(t.toLowerCase()));
    for (const tag of added) {
      if (!merged.some((t: string) => t.toLowerCase() === tag.toLowerCase())) merged.push(tag);
    }

    const patch: Record<string, any> = { tags: merged, updated_at: new Date().toISOString() };
    const autoStatus = await resolveStageFromTags(db, merged, lead.expert ?? operation);
    if (autoStatus) patch.status = autoStatus;

    const { error } = await db.from("crm_leads" as any).update(patch).eq("id", lead.id);
    if (error) throw new Error(error.message);
    updated++;
  }

  return { updated };
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
    contextWaMessageId: d?.contextWaMessageId ? String(d.contextWaMessageId) : "",
    replyPreview: d?.replyPreview ? String(d.replyPreview) : "",
  }))

  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    const isVendor = Boolean((context as any).vendor);
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
      ...(data.contextWaMessageId ? { context: { message_id: data.contextWaMessageId } } : {}),
    };

    // Chunk long text messages — Meta rejects text > 4096 chars with a generic INTERNAL error.
    // We split at paragraph/word boundaries and send each chunk as its own message.
    const MAX_TEXT_LEN = 3500;
    function splitText(input: string): string[] {
      const text = String(input ?? "");
      if (text.length <= MAX_TEXT_LEN) return [text];
      const chunks: string[] = [];
      let remaining = text;
      while (remaining.length > MAX_TEXT_LEN) {
        let cut = remaining.lastIndexOf("\n\n", MAX_TEXT_LEN);
        if (cut < MAX_TEXT_LEN * 0.5) cut = remaining.lastIndexOf("\n", MAX_TEXT_LEN);
        if (cut < MAX_TEXT_LEN * 0.5) cut = remaining.lastIndexOf(" ", MAX_TEXT_LEN);
        if (cut <= 0) cut = MAX_TEXT_LEN;
        chunks.push(remaining.slice(0, cut).trimEnd());
        remaining = remaining.slice(cut).trimStart();
      }
      if (remaining) chunks.push(remaining);
      return chunks;
    }

    async function deliverOne(sendBody: any, chunkText: string | null) {
      let insertedMessageId = "";
      if (isVendor) {
        const rpcArgs = vendorRpcArgs(context);
        if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
        const { data: messageId, error } = await db.rpc("vendor_insert_wa_message" as any, {
          ...rpcArgs,
          _conversation_id: conversationId,
          _channel_id: data.channelId,
          _wa_message_id: null,
          _direction: "out",
          _msg_type: data.type,
          _text_body: data.type === "text" ? chunkText : null,
          _media_url: data.type !== "text" ? data.mediaUrl : null,
          _media_filename: data.filename || null,
          _caption: data.caption || null,
          _from_wa_id: ch.phoneNumberId,
          _to_wa_id: toNormalized,
          _status: "pending",
          _raw: { pending: true, request: sendBody, sent_by_vendor_id: (context as any).vendor?.id ?? null, ...(data.contextWaMessageId ? { context: { message_id: data.contextWaMessageId }, reply_preview: data.replyPreview || null } : {}) },
        });
        if (error || !messageId) throw new Error(`Falha ao salvar mensagem: ${error?.message ?? "mensagem não criada"}`);
        insertedMessageId = String(messageId);

        await db.rpc("vendor_touch_wa_conversation" as any, {
          ...rpcArgs,
          _conversation_id: conversationId,
          _preview: data.type === "text" ? (chunkText ?? "").slice(0, 120) : previewForOut(data),
          _direction: "out",
        });
      } else {
        const { data: inserted, error } = await db.from("wa_messages" as any).insert({
          conversation_id: conversationId,
          channel_id: data.channelId,
          wa_message_id: null,
          direction: "out",
          msg_type: data.type,
          text_body: data.type === "text" ? chunkText : null,
          media_url: data.type !== "text" ? data.mediaUrl : null,
          media_filename: data.filename || null,
          caption: data.caption || null,
          from_wa_id: ch.phoneNumberId,
          to_wa_id: toNormalized,
          status: "pending",
          sent_by: context.userId,
          raw: { pending: true, request: sendBody, sent_by_vendor_id: null, ...(data.contextWaMessageId ? { context: { message_id: data.contextWaMessageId }, reply_preview: data.replyPreview || null } : {}) },
        }).select("id").single();
        if (error) throw new Error(`Falha ao salvar mensagem: ${error.message}`);
        insertedMessageId = String((inserted as any).id);

        await db
          .from("wa_conversations" as any)
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: data.type === "text" ? (chunkText ?? "").slice(0, 120) : previewForOut(data),
            last_message_direction: "out",
            last_message_status: "pending",
          })
          .eq("id", conversationId);
      }

      try {
        let resp: any;
        try {
          const r = await withRetry("enviar WhatsApp", 3, () => metaProxyForChannel(ch, `/${ch.phoneNumberId}/messages`, {
            method: "POST",
            body: JSON.stringify(sendBody),
          }, db));
          resp = r.body;
        } catch (firstErr: any) {
          const firstMsg = String(firstErr?.message ?? "").trim().toUpperCase();
          // Meta devolve "INTERNAL" opaco quando o context.message_id do reply está
          // expirado/inválido. Retry sem o context resolve na maior parte dos casos.
          if (firstMsg === "INTERNAL" && sendBody?.context?.message_id) {
            const { context: _drop, ...retryBody } = sendBody;
            console.warn("[whatsapp-chat] Meta INTERNAL com context.message_id — tentando sem reply");
            const r = await withRetry("enviar WhatsApp sem resposta vinculada", 3, () => metaProxyForChannel(ch, `/${ch.phoneNumberId}/messages`, {
              method: "POST",
              body: JSON.stringify(retryBody),
            }, db));
            resp = r.body;
          } else {
            throw firstErr;
          }
        }

        const waMsgId = resp?.messages?.[0]?.id ?? null;
        const replyMeta = data.contextWaMessageId
          ? { context: { message_id: data.contextWaMessageId }, reply_preview: data.replyPreview || null }
          : {};
        if (isVendor) {
          const rpcArgs = vendorRpcArgs(context);
          if (rpcArgs) {
            await db.rpc("vendor_update_wa_message_status" as any, {
              ...rpcArgs,
              _message_id: insertedMessageId,
              _wa_message_id: waMsgId,
              _status: "sent",
              _raw: { request: sendBody, response: resp, ...replyMeta },
            });
          }
        } else {
          await db
            .from("wa_messages" as any)
            .update({ wa_message_id: waMsgId, status: "sent", raw: { request: sendBody, response: resp, ...replyMeta } })
            .eq("id", insertedMessageId);
        }

        // Atualiza o last_message_status da conversa para 'sent'
        await db
          .from("wa_conversations" as any)
          .update({ last_message_status: "sent" })
          .eq("id", conversationId);

        return { waMsgId, messageId: insertedMessageId };
      } catch (e: any) {
        const rawMessage = e?.message ? String(e.message) : "Falha ao enviar no WhatsApp";
        const isBareInternal = rawMessage.trim().toUpperCase() === "INTERNAL";
        const friendly = isBareInternal
          ? "WhatsApp recusou (INTERNAL da Meta, sem detalhe). Provável janela de 24h expirada — o cliente precisa enviar uma mensagem antes, ou você precisa usar um template aprovado."
          : `WhatsApp recusou: ${rawMessage}`;
        if (isVendor) {
          const rpcArgs = vendorRpcArgs(context);
          if (rpcArgs) {
            await db.rpc("vendor_update_wa_message_status" as any, {
              ...rpcArgs,
              _message_id: insertedMessageId,
              _wa_message_id: null,
              _status: "failed",
              _raw: { request: sendBody, error: rawMessage },
            });
          }
        } else {
          await db
            .from("wa_messages" as any)
            .update({ status: "failed", raw: { request: sendBody, error: rawMessage } })
            .eq("id", insertedMessageId);
        }

        await db
          .from("wa_conversations" as any)
          .update({ last_message_status: "failed" })
          .eq("id", conversationId);

        throw new Error(friendly);
      }
    }

    if (data.type === "text") {
      if (!data.text) throw new Error("Texto vazio");
      const chunks = splitText(data.text);
      let last: { waMsgId: string | null; messageId: string } | null = null;
      for (const chunk of chunks) {
        const chunkBody = { ...body, text: { body: chunk } };
        last = await deliverOne(chunkBody, chunk);
      }
      return { ok: true, waMsgId: last?.waMsgId ?? null, messageId: last?.messageId ?? "", chunks: chunks.length };
    }

    if (data.type === "audio") {
      if (!data.mediaUrl) throw new Error("URL da mídia ausente");
      try {
        const { convertAudioToWhatsappVoice } = await import("@/lib/transloadit.server");
        const voiceUrl = await convertAudioToWhatsappVoice(data.mediaUrl);
        body.audio = { link: voiceUrl || data.mediaUrl, voice: true };
      } catch (audioErr: any) {
        console.warn("[sendWhatsappMessage] Converter áudio falhou/timeout, enviando URL direto:", audioErr?.message);
        body.audio = { link: data.mediaUrl, voice: true };
      }
    } else if (data.type === "image" || data.type === "video" || data.type === "sticker") {
      if (!data.mediaUrl) throw new Error("URL da mídia ausente");
      let mediaUrl = data.mediaUrl;
      if (data.type === "image" && shouldNormalizeWhatsappImage(mediaUrl)) {
        const { convertImageToWhatsappJpeg } = await import("@/lib/transloadit.server");
        mediaUrl = await withRetry("converter imagem", 3, () => convertImageToWhatsappJpeg(data.mediaUrl!));
      }
      if (data.type === "video" && shouldNormalizeWhatsappVideo(mediaUrl)) {
        const { convertVideoToWhatsappMp4 } = await import("@/lib/transloadit.server");
        mediaUrl = await withRetry("converter vídeo", 3, () => convertVideoToWhatsappMp4(data.mediaUrl!));
      }
      body[data.type] = { link: mediaUrl, ...(data.caption && data.type !== "sticker" ? { caption: data.caption } : {}) };
    } else if (data.type === "document") {
      if (!data.mediaUrl) throw new Error("URL da mídia ausente");
      body.document = { link: data.mediaUrl, filename: data.filename || "arquivo", ...(data.caption ? { caption: data.caption } : {}) };
    }

    const result = await deliverOne(body, null);
    return { ok: true, waMsgId: result.waMsgId, messageId: result.messageId };
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
  .inputValidator((d: { channelId: string; mediaId: string; conversationId?: string }) => ({
    channelId: String(d?.channelId ?? ""),
    mediaId: String(d?.mediaId ?? ""),
    conversationId: d?.conversationId ? String(d.conversationId) : "",
  }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (data.conversationId) {
      const conv = await assertConversationAccess(context, db, data.conversationId, { channelId: data.channelId });
      if (String(conv.channel_id) !== String(data.channelId)) throw new Error("Canal não pertence a esta conversa");
    } else {
      await assertVendorChannel(context, data.channelId, db);
    }
    const ch = await findChannel(data.channelId, db);
    const qs = ch.phoneNumberId ? `?phone_number_id=${ch.phoneNumberId}` : "";
    const { body: resp } = await metaProxyForChannel(ch, `/${data.mediaId}${qs}`, { method: "GET" });
    return { url: resp?.url as string | undefined, mime: resp?.mime_type as string | undefined };
  });

// Download a media URL (proxied through EvoHub) and stream the bytes back as base64 so the browser can render it.
export const downloadIncomingMediaBase64 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelId: string; mediaId: string; conversationId?: string }) => ({
    channelId: String(d?.channelId ?? ""),
    mediaId: String(d?.mediaId ?? ""),
    conversationId: d?.conversationId ? String(d.conversationId) : "",
  }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (data.conversationId) {
      const conv = await assertConversationAccess(context, db, data.conversationId, { channelId: data.channelId });
      if (String(conv.channel_id) !== String(data.channelId)) throw new Error("Canal não pertence a esta conversa");
    } else {
      await assertVendorChannel(context, data.channelId, db);
    }
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

// Delete an outgoing message. Soft-deletes in DB (message shown as "apagada")
// and best-effort attempts to delete on WhatsApp side via Meta Graph API.
export const deleteWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string }) => ({ messageId: String(d?.messageId ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.messageId) throw new Error("messageId obrigatório");
    const db = await dbFor(context);
    const isVendor = Boolean((context as any).vendor);

    let waMessageId: string | null = null;
    let channelId: string | null = null;

    if (isVendor) {
      const rpcArgs = vendorRpcArgs(context);
      if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
      const { data: rows, error } = await db.rpc("vendor_delete_wa_message" as any, {
        ...rpcArgs,
        _message_id: data.messageId,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error("Mensagem não encontrada ou não é sua");
      waMessageId = row.wa_message_id ?? null;
      channelId = row.channel_id ?? null;
    } else {
      const { data: msg, error: fetchErr } = await db
        .from("wa_messages" as any)
        .select("id,wa_message_id,channel_id,direction,deleted_at")
        .eq("id", data.messageId)
        .maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!msg) throw new Error("Mensagem não encontrada");
      if ((msg as any).direction !== "out") throw new Error("Só é possível apagar mensagens enviadas por você");
      waMessageId = (msg as any).wa_message_id ?? null;
      channelId = (msg as any).channel_id ?? null;
      const { error: upErr } = await db
        .from("wa_messages" as any)
        .update({
          deleted_at: new Date().toISOString(),
        })
        .eq("id", data.messageId);
      if (upErr) throw new Error(upErr.message);

    }

    // WhatsApp Cloud API não expõe endpoint oficial de "delete for everyone".
    // Tentamos alguns caminhos que a Meta às vezes aceita e reportamos o resultado real.
    let waRemoved = false;
    let waError: string | null = null;
    if (waMessageId && channelId) {
      try {
        const ch = await findChannel(channelId, db);
        if (!ch.phoneNumberId) throw new Error("Canal sem phone_number_id");
        // Tentativa 1: DELETE /{wamid}
        try {
          await metaProxyForChannel(ch, `/${waMessageId}`, { method: "DELETE" }, db);
          waRemoved = true;
        } catch (e1: any) {
          // Tentativa 2: POST /{phone_number_id}/messages { status:"deleted", message_id }
          try {
            await metaProxyForChannel(
              ch,
              `/${ch.phoneNumberId}/messages`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  status: "deleted",
                  message_id: waMessageId,
                }),
              },
              db,
            );
            waRemoved = true;
          } catch (e2: any) {
            waError = String(e2?.message || e1?.message || "Falha ao apagar no WhatsApp");
          }
        }
      } catch (e: any) {
        waError = String(e?.message || "Falha ao apagar no WhatsApp");
      }
    }

    if (!waRemoved) {
      console.warn("[whatsapp-chat] delete for everyone falhou:", waError);
    }

    return { ok: true, waRemoved, waError };
  });

export const updateConversationTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; tags: string[] }) => ({
    conversationId: String(d?.conversationId ?? ""),
    tags: Array.isArray(d?.tags) ? d.tags.map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 50) : [],
  }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) throw new Error("Conversa não informada");
    const db = await dbFor(context);
    const { data: currentConv } = await db
      .from("wa_conversations" as any)
      .select("tags")
      .eq("id", data.conversationId)
      .maybeSingle();
    const oldTags = Array.isArray((currentConv as any)?.tags)
      ? ((currentConv as any).tags as unknown[]).map(String).filter(Boolean)
      : [];
    const rpcArgs = (context as any)?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { error } = await db.rpc("vendor_update_conversation_tags" as any, {
        ...rpcArgs,
        _conversation_id: data.conversationId,
        _tags: data.tags,
      });
      if (error) throw new Error(error.message);
      const sync = await syncConversationTagsToCrmLead(db, data.conversationId, oldTags, data.tags);
      return { ok: true, crmUpdated: sync.updated };
    }
    const { error } = await db
      .from("wa_conversations" as any)
      .update({ tags: data.tags, updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    const sync = await syncConversationTagsToCrmLead(db, data.conversationId, oldTags, data.tags);
    return { ok: true, crmUpdated: sync.updated };
  });

export const updateConversationNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; notes: string }) => ({
    conversationId: String(d?.conversationId ?? ""),
    notes: String(d?.notes ?? ""),
  }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId) throw new Error("Conversa não informada");
    const db = await dbFor(context);
    const rpcArgs = (context as any)?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { error } = await db.rpc("vendor_update_conversation_notes" as any, {
        ...rpcArgs,
        _conversation_id: data.conversationId,
        _notes: data.notes,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await db
      .from("wa_conversations" as any)
      .update({ notes: data.notes, updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// React (or remove reaction) to a WhatsApp message. Empty emoji removes the reaction.
// cache-bust v2: force client bundle refresh after server-fn ID scheme change
export const reactToWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; messageId: string; emoji: string }) => ({
    conversationId: String(d?.conversationId ?? ""),
    messageId: String(d?.messageId ?? ""),
    emoji: String(d?.emoji ?? ""),
  }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId || !data.messageId) throw new Error("Parâmetros inválidos");
    const db = await dbFor(context);
    const isVendor = Boolean((context as any).vendor);

    let targetWamid: string | null = null;
    let channelId: string | null = null;
    let contactWaId: string | null = null;
    let prevRaw: Record<string, any> = {};

    if (isVendor) {
      const rpcArgs = vendorRpcArgs(context);
      if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
      const { data: rows, error } = await db.rpc("vendor_get_wa_message_for_react" as any, {
        ...rpcArgs,
        _message_id: data.messageId,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error("Mensagem não encontrada ou fora do seu acesso");
      targetWamid = (row as any).wa_message_id ?? null;
      channelId = (row as any).channel_id ?? null;
      contactWaId = (row as any).contact_wa_id ?? null;
      prevRaw = ((row as any).raw ?? {}) as Record<string, any>;
    } else {
      const conv = await assertConversationAccess(context, db, data.conversationId);
      channelId = String(conv.channel_id);
      contactWaId = String(conv.contact_wa_id);
      const { data: msgRow, error: msgErr } = await db
        .from("wa_messages" as any)
        .select("id, wa_message_id, raw, direction")
        .eq("id", data.messageId)
        .maybeSingle();
      if (msgErr || !msgRow) throw new Error("Mensagem não encontrada");
      targetWamid = (msgRow as any).wa_message_id ?? null;
      prevRaw = ((msgRow as any).raw ?? {}) as Record<string, any>;
    }

    if (!targetWamid) throw new Error("Mensagem ainda não confirmada pelo WhatsApp");
    if (!channelId) throw new Error("Canal não encontrado");

    const ch = await findChannel(channelId, db);
    if (!ch.phoneNumberId) throw new Error("Canal sem phone_number_id");

    const toNormalized = normalizeBrWhatsappNumber(String(contactWaId ?? ""));
    const body = {
      messaging_product: "whatsapp",
      to: toNormalized,
      type: "reaction",
      reaction: { message_id: targetWamid, emoji: data.emoji || "" },
    };

    const { body: resp } = await metaProxyForChannel(
      ch,
      `/${ch.phoneNumberId}/messages`,
      { method: "POST", body: JSON.stringify(body) },
      db,
    );

    const responseId = resp?.messages?.[0]?.id ?? null;

    if (isVendor) {
      const rpcArgs = vendorRpcArgs(context);
      if (rpcArgs) {
        const { error: applyErr } = await db.rpc("vendor_apply_wa_reaction" as any, {
          ...rpcArgs,
          _message_id: data.messageId,
          _emoji: data.emoji || "",
          _response_id: responseId,
        });
        if (applyErr) console.warn("[whatsapp-chat] vendor_apply_wa_reaction falhou", applyErr);
      }
    } else {
      const prevReactions = (prevRaw.reactions ?? {}) as Record<string, any>;
      const nextRaw = {
        ...prevRaw,
        reactions: {
          ...prevReactions,
          mine: data.emoji || null,
          mine_at: new Date().toISOString(),
          mine_response: responseId,
        },
      };
      const { error: updErr } = await db
        .from("wa_messages" as any)
        .update({ raw: nextRaw })
        .eq("id", data.messageId);
      if (updErr) throw new Error(updErr.message);
    }

    return { ok: true, emoji: data.emoji || null };
  });

// Edit an outbound text message in the internal chat history (15-min window).
// Meta's official WhatsApp Cloud API currently exposes incoming edit webhooks,
// but it does not expose a supported endpoint to edit business-sent messages.
export const editWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; messageId: string; newText: string }) => ({
    conversationId: String(d?.conversationId ?? ""),
    messageId: String(d?.messageId ?? ""),
    newText: String(d?.newText ?? ""),
  }))
  .handler(async ({ context, data }) => {
    if (!data.conversationId || !data.messageId) throw new Error("Parâmetros inválidos");
    const newText = data.newText.trim();
    if (!newText) throw new Error("Texto não pode ficar vazio");
    if (newText.length > 4096) throw new Error("Texto muito longo (máx 4096 caracteres)");

    const db = await dbFor(context);
    const isVendor = Boolean((context as any).vendor);

    let targetWamid: string | null = null;
    let channelId: string | null = null;
    let contactWaId: string | null = null;
    let prevText: string | null = null;

    if (isVendor) {
      const rpcArgs = vendorRpcArgs(context);
      if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
      const { data: rows, error } = await db.rpc("vendor_edit_wa_message" as any, {
        ...rpcArgs,
        _message_id: data.messageId,
        _new_text: newText,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error("Mensagem não encontrada, já expirou (15min) ou não é sua");
      targetWamid = (row as any).wa_message_id ?? null;
      channelId = (row as any).channel_id ?? null;
      contactWaId = (row as any).contact_wa_id ?? null;
      prevText = (row as any).prev_text ?? null;
    } else {
      const { data: msgRow, error: msgErr } = await db
        .from("wa_messages" as any)
        .select("id, wa_message_id, channel_id, direction, msg_type, text_body, created_at, deleted_at, raw, conversation_id")
        .eq("id", data.messageId)
        .maybeSingle();
      if (msgErr || !msgRow) throw new Error("Mensagem não encontrada");
      const m: any = msgRow;
      if (m.direction !== "out") throw new Error("Só é possível editar mensagens enviadas por você");
      if (m.msg_type !== "text") throw new Error("Só é possível editar mensagens de texto");
      if (m.deleted_at) throw new Error("Mensagem foi apagada");
      const ageMs = Date.now() - new Date(m.created_at).getTime();
      if (ageMs > 15 * 60 * 1000) throw new Error("Janela de 15min para edição expirou");
      targetWamid = m.wa_message_id ?? null;
      channelId = m.channel_id ?? null;
      prevText = m.text_body ?? null;

      const { data: conv } = await db
        .from("wa_conversations" as any)
        .select("contact_wa_id")
        .eq("id", m.conversation_id)
        .maybeSingle();
      contactWaId = (conv as any)?.contact_wa_id ?? null;

      const prevRaw = (m.raw ?? {}) as Record<string, any>;
      const nextRaw = {
        ...prevRaw,
        edited_at: new Date().toISOString(),
        edit_history: [
          ...(Array.isArray(prevRaw.edit_history) ? prevRaw.edit_history : []),
          { at: new Date().toISOString(), prev: prevText },
        ],
      };
      const { error: updErr } = await db
        .from("wa_messages" as any)
        .update({ text_body: newText, raw: nextRaw })
        .eq("id", data.messageId);
      if (updErr) throw new Error(updErr.message);
    }

    console.log("[editWhatsappMessage] edição oficial indisponível; salvando somente no histórico interno", {
      channelId,
      wamid: targetWamid,
      wamidLooksValid: /^wamid\./i.test(String(targetWamid ?? "")),
      newTextLen: newText.length,
      isVendor,
    });

    return {
      ok: true,
      newText,
      whatsappUpdated: false,
      reason: "A API oficial do WhatsApp não permite editar mensagens enviadas pela empresa; a alteração foi salva apenas no histórico interno.",
    };
  });

export const getActiveBuyers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (opts) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://wvcwrozwnwdlpandwubp.supabase.co";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                process.env.SUPASUPABASE_SERVICE_ROLE_KEY || 
                process.env.SUPABASE_SECRET_KEY || 
                process.env.SUPABASE_SECRET_KEYS || 
                process.env.SUPABASE_SERVICE_KEY ||
                process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    let supabaseInstance;
    if (url && key) {
      supabaseInstance = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    } else {
      supabaseInstance = opts.context.supabase;
    }

    const [{ data: vAll }, { data: htAll }] = await Promise.all([
      supabaseInstance
        .from("vendas")
        .select("Telefone, Email, Ticket, Evento, Produto, Nome")
        .or('Evento.eq.purchase_approved,Evento.ilike.*aprov*'),
      supabaseInstance
        .from("ht_vendas")
        .select("id, valor_total, data, status, cliente, lead_id")
        .neq("status", "reembolso")
    ]);
    return {
      vendas: (vAll ?? []) as any[],
      htVendas: (htAll ?? []) as any[]
    };
  });

export const searchChatMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query: string; operacaoId?: string | null }) => ({
    query: String(d?.query ?? "").trim(),
    operacaoId: d?.operacaoId ? String(d.operacaoId) : null,
  }))
  .handler(async ({ context, data }) => {
    const q = data.query;
    if (!q || q.length < 2) return { ok: true, results: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rpcArgs = (context as any)?.vendor ? vendorRpcArgs(context) : null;

    let convIds: string[] = [];

    if (rpcArgs) {
      // Pega IDs das conversas visíveis para este vendedor
      const { data: convRows } = await supabaseAdmin.rpc("vendor_list_wa_conversations" as any, {
        ...rpcArgs,
        _operacao_id: data.operacaoId ?? null,
      });
      convIds = Array.isArray(convRows) ? convRows.map((c: any) => String(c.id)).filter(Boolean) : [];
      if (convIds.length === 0) return { ok: true, results: [] };
    }

    // Executa a busca em wa_messages por texto, legenda de mídia ou nome de arquivo
    let queryBuilder = supabaseAdmin
      .from("wa_messages" as any)
      .select("id, conversation_id, direction, msg_type, text_body, media_filename, caption, created_at")
      .or(`text_body.ilike.%${q}%,caption.ilike.%${q}%,media_filename.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(60);

    if (convIds.length > 0) {
      queryBuilder = queryBuilder.in("conversation_id", convIds);
    }

    const { data: msgs, error } = await queryBuilder;
    if (error) throw new Error(error.message);

    // Agrupa por conversa para retornar a mensagem mais recente encontrada em cada conversa
    const resultsMap = new Map<string, { conversation_id: string; message_id: string; snippet: string; created_at: string; direction: string }>();
    for (const m of (msgs ?? []) as any[]) {
      const cid = String(m.conversation_id);
      if (!resultsMap.has(cid)) {
        const text = m.text_body || m.caption || m.media_filename || `[${m.msg_type}]`;
        resultsMap.set(cid, {
          conversation_id: cid,
          message_id: String(m.id),
          snippet: text.length > 120 ? text.slice(0, 120) + "..." : text,
          created_at: m.created_at,
          direction: String(m.direction),
        });
      }
    }

    return { ok: true, results: Array.from(resultsMap.values()) };
  });

export const checkDuplicateLeadVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; contactWaId: string }) => ({
    conversationId: String(d?.conversationId ?? ""),
    contactWaId: String(d?.contactWaId ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    const { conversationId, contactWaId } = data;
    if (!contactWaId) return { hasOtherVendor: false, otherConvs: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const digits = contactWaId.replace(/\D+/g, "");
    if (!digits || digits.length < 8) return { hasOtherVendor: false, otherConvs: [] };

    const last8 = digits.slice(-8);

    // 1. Busca todas as conversas do sistema com o mesmo número (diferentes da conversa atual)
    const { data: convs, error } = await supabaseAdmin
      .from("wa_conversations" as any)
      .select("id, channel_id, assigned_vendor_id, contact_name, last_message_at, created_at")
      .neq("id", conversationId)
      .or(`contact_wa_id.ilike.%${last8}%,contact_wa_id.ilike.%${digits}%`)
      .order("last_message_at", { ascending: false });

    if (error || !Array.isArray(convs) || convs.length === 0) {
      return { hasOtherVendor: false, otherConvs: [] };
    }

    // 2. Busca lista de vendedores para mapear id -> nome
    const { data: vendors } = await supabaseAdmin
      .from("vendedores" as any)
      .select("id, nome");

    const vendorMap = new Map<number, string>();
    for (const v of (vendors ?? []) as any[]) {
      if (v?.id) vendorMap.set(Number(v.id), String(v.nome ?? `Vendedor ${v.id}`));
    }

    // 3. Mapeia canais para nome do canal
    const { data: channels } = await supabaseAdmin
      .from("wa_channels" as any)
      .select("id, name, display_phone_number");

    const channelMap = new Map<string, string>();
    for (const ch of (channels ?? []) as any[]) {
      if (ch?.id) channelMap.set(String(ch.id), String(ch.name || ch.display_phone_number || "WhatsApp"));
    }

    const currentVendorId = (context as any)?.vendor ? Number((context as any).vendor.id) : null;

    const otherConvs = convs
      .filter((c: any) => c.assigned_vendor_id != null)
      .map((c: any) => {
        const vId = Number(c.assigned_vendor_id);
        const vName = vendorMap.get(vId) || `Vendedor ${vId}`;
        const cName = channelMap.get(String(c.channel_id)) || "WhatsApp";
        return {
          id: String(c.id),
          vendorId: vId,
          vendorName: vName,
          channelName: cName,
          lastMessageAt: c.last_message_at || c.created_at,
          isDifferentVendor: currentVendorId != null ? vId !== currentVendorId : true,
        };
      });

    const differentVendors = otherConvs.filter((o) => o.isDifferentVendor);

    return {
      hasOtherVendor: differentVendors.length > 0,
      otherConvs,
      primaryOther: differentVendors[0] ?? otherConvs[0] ?? null,
    };
  });




