import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVOHUB_BASE = "https://api.evohub.ai";
const EVOHUB_CONNECT_BASE = "https://app.evohub.evolutionfoundation.com.br";

function getAuthHeaders() {
  const key = process.env.EVOHUB_API_KEY;
  if (!key) throw new Error("EVOHUB_API_KEY não configurada");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function evoFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${EVOHUB_BASE}${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers || {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const code = body?.code as string | undefined;
    if (code === "QUOTA_EXCEEDED") {
      throw new Error("EVOHUB_QUOTA_EXCEEDED");
    }
    const msg = (body && (body.message || body.error)) || `EvoHub HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body;
}

export type EvoChannel = {
  id: string;
  name: string;
  type: string;
  status: string;
  token: string;
  metadata: Record<string, any> | null;
  operacaoId: string | null;
  kind: "chat" | "notification";
  created_at: string;
  updated_at: string;
  connectUrl: string;
};


const APP_SOURCE = "lovable-crm";
const AUTO_IMPORT_WHATSAPP_NAMES = ["amaral"];

function normalizeMetadata(metadata: any): Record<string, any> | null {
  if (!metadata) return null;
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof metadata === "object" ? metadata : null;
}

function isWhatsappChannel(ch: any) {
  const type = String(ch?.type ?? "").toLowerCase();
  return type === "whatsapp" || type === "unified" || type.includes("whatsapp");
}

function belongsToMotion(ch: any) {
  const meta = normalizeMetadata(ch?.metadata);
  return meta?.app_source === APP_SOURCE || meta?.appSource === APP_SOURCE;
}

function getMetaConnection(ch: any) {
  const meta = normalizeMetadata(ch?.metadata);
  return ch?.meta_connection ?? meta?.meta_connection ?? null;
}

function normalizeChannel(ch: any) {
  const meta = normalizeMetadata(ch?.metadata) ?? {};
  const topConnection = ch?.meta_connection;
  return topConnection && !meta.meta_connection
    ? { ...ch, metadata: { ...meta, meta_connection: topConnection } }
    : { ...ch, metadata: meta };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function shouldAutoImport(ch: any) {
  const name = normalizeText(String(ch?.name ?? ""));
  return AUTO_IMPORT_WHATSAPP_NAMES.some((allowed) => name === normalizeText(allowed));
}

function getPhoneInfo(ch: any) {
  const metaConnection = getMetaConnection(ch);
  const firstPhone = Array.isArray(metaConnection?.phone_numbers) ? metaConnection.phone_numbers[0] : null;
  return {
    phoneNumberId: metaConnection?.phone_number_id ?? firstPhone?.id ?? null,
    displayPhoneNumber: metaConnection?.phone_number ?? firstPhone?.display_phone_number ?? null,
    verifiedName: metaConnection?.display_name ?? firstPhone?.verified_name ?? null,
    qualityRating: firstPhone?.quality_rating ?? null,
  };
}

function withConnectUrl(ch: any): EvoChannel {
  const normalized = normalizeChannel(ch);
  const meta = normalizeMetadata(normalized.metadata);
  return {
    id: normalized.id,
    name: normalized.name,
    type: normalized.type,
    status: normalized.status,
    token: normalized.token,
    metadata: meta,
    operacaoId: (meta && typeof meta.operacao_id === "string") ? meta.operacao_id : null,
    kind: (ch?.kind === "notification" || (meta && meta.kind === "notification")) ? "notification" : "chat",

    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
    connectUrl: normalized.token ? `${EVOHUB_CONNECT_BASE}/connect/${normalized.token}` : "",
  };
}

async function loadLocalChannels(supabase: any): Promise<any[]> {
  const { data, error } = await supabase
    .from("wa_channels" as any)
    .select("*")
    .eq("app_source", APP_SOURCE);
  if (error) {
    // A migration can still be pending in preview; don't break EvoHub listing because of it.
    console.warn("[wa_channels] load failed", error.message);
    return [];
  }
  return data ?? [];
}

async function upsertLocalChannel(supabase: any, ch: any, operacaoId?: string | null) {
  const normalized = normalizeChannel(ch);
  const meta = normalizeMetadata(normalized.metadata) ?? {};
  const info = getPhoneInfo(normalized);
  const currentLocal = await supabase
    .from("wa_channels" as any)
    .select("operacao_id")
    .eq("id", String(normalized.id))
    .maybeSingle()
    .then(({ data }: any) => data)
    .catch(() => null);

  const finalOperacao = operacaoId ?? currentLocal?.operacao_id ?? (typeof meta.operacao_id === "string" ? meta.operacao_id : null);

  const { error } = await supabase.from("wa_channels" as any).upsert({
    id: String(normalized.id),
    name: String(normalized.name ?? "WhatsApp"),
    type: String(normalized.type ?? "whatsapp"),
    status: String(normalized.status ?? ""),
    token: String(normalized.token ?? ""),
    metadata: { ...meta, meta_connection: getMetaConnection(normalized) ?? meta.meta_connection ?? null, kind: meta.kind ?? "chat" },
    operacao_id: finalOperacao,
    kind: (meta.kind === "notification" ? "notification" : "chat"),
    phone_number_id: info.phoneNumberId,
    display_phone_number: info.displayPhoneNumber,
    verified_name: info.verifiedName,
    quality_rating: info.qualityRating,
    connect_url: normalized.token ? `${EVOHUB_CONNECT_BASE}/connect/${normalized.token}` : "",
    app_source: APP_SOURCE,
    created_at: normalized.created_at ?? null,
    updated_at: normalized.updated_at ?? null,
    synced_at: new Date().toISOString(),
  }, { onConflict: "id" });


  if (error) console.warn("[wa_channels] upsert failed", error.message);
  return { ...normalized, metadata: { ...meta, app_source: APP_SOURCE, operacao_id: finalOperacao, meta_connection: getMetaConnection(normalized) ?? meta.meta_connection ?? null } };
}

function mergeLocalIntoRemote(ch: any, local?: any) {
  if (!local) return ch;
  const normalized = normalizeChannel(ch);
  const meta = normalizeMetadata(normalized.metadata) ?? {};
  return {
    ...normalized,
    metadata: {
      ...meta,
      ...(normalizeMetadata(local.metadata) ?? {}),
      app_source: APP_SOURCE,
      operacao_id: local.operacao_id ?? meta.operacao_id ?? null,
      meta_connection: getMetaConnection(normalized) ?? meta.meta_connection ?? local.metadata?.meta_connection ?? null,
    },
  };
}

export const listWhatsappChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const data = await evoFetch("/api/v1/channels");
    const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.channels ?? [];
    const local = await loadLocalChannels(context.supabase);
    const localById = new Map(local.map((row: any) => [String(row.id), row]));

    // If Amaral already exists in EvoHub but wasn't created from Motion, register only this channel locally.
    // We intentionally do not auto-import other numbers, so webhooks from unrelated EvoHub channels stay ignored.
    await Promise.all(
      list
        .filter((c) => isWhatsappChannel(c) && shouldAutoImport(c) && !localById.has(String(c.id)))
        .map(async (c) => {
          try {
            const full = await evoFetch(`/api/v1/channels/${c.id}`).catch(() => c);
            const saved = await upsertLocalChannel(context.supabase, full, "Caio");
            localById.set(String(saved.id), { id: saved.id, operacao_id: "Caio", metadata: saved.metadata });
          } catch {
            localById.set(String(c.id), { id: c.id, operacao_id: "Caio", metadata: { app_source: APP_SOURCE, operacao_id: "Caio", meta_connection: getMetaConnection(c) } });
          }
        }),
    );

    const visible = list.filter((c) => isWhatsappChannel(c) && (belongsToMotion(c) || localById.has(String(c.id)) || shouldAutoImport(c)));

    // EvoHub /channels list doesn't include meta_connection; fetch full detail per channel so phone + name render.
    const enriched = await Promise.all(
      visible.map(async (c) => {
        if (getMetaConnection(c)) return c;
        try {
          const full = await evoFetch(`/api/v1/channels/${c.id}`);
          // Persist phone info locally so subsequent renders are instant.
          await upsertLocalChannel(context.supabase, full, localById.get(String(c.id))?.operacao_id ?? null).catch(() => null);
          return full;
        } catch {
          return c;
        }
      }),
    );

    return enriched.map((c) => withConnectUrl(mergeLocalIntoRemote(c, localById.get(String(c.id)))));
  });

export const syncWhatsappChannelByName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; operacaoId?: string | null }) => ({
    name: String(d?.name ?? "").trim(),
    operacaoId: d?.operacaoId ? String(d.operacaoId).trim() : null,
  }))
  .handler(async ({ context, data }) => {
    if (!data.name) throw new Error("Nome obrigatório");
    const payload = await evoFetch("/api/v1/channels");
    const list: any[] = Array.isArray(payload) ? payload : payload?.data ?? payload?.channels ?? [];
    const needle = normalizeText(data.name);
    const candidates = list.filter((c) => isWhatsappChannel(c) && normalizeText(String(c?.name ?? "")).includes(needle));
    if (candidates.length === 0) throw new Error(`Conexão "${data.name}" não encontrada na EvoHub`);

    const picked =
      candidates.find((c) => normalizeText(String(c?.name ?? "")) === needle) ??
      candidates.find((c) => ["active", "connected", "open"].includes(String(c?.status ?? "").toLowerCase())) ??
      candidates[0];

    const currentFull = await evoFetch(`/api/v1/channels/${picked.id}`).catch(() => picked);
    const normalized = normalizeChannel(currentFull);
    const current: Record<string, any> = normalizeMetadata(normalized.metadata) ?? {};
    const merged: Record<string, any> = {
      ...current,
      app_source: APP_SOURCE,
      ...(data.operacaoId ? { operacao_id: data.operacaoId } : {}),
    };

    // EvoHub does not expose metadata in the list response for channels connected in its own UI.
    // So Motion keeps a local registry as the source of truth for "which numbers belong to Motion".
    const saved = await upsertLocalChannel(context.supabase, { ...normalized, metadata: merged }, data.operacaoId ?? null);

    await evoFetch(`/api/v1/channels/${picked.id}/metadata`, {
      method: "PUT",
      body: JSON.stringify({ metadata: { ...merged, meta_connection: getMetaConnection(normalized) ?? merged.meta_connection } }),
    }).catch(() => null);

    return withConnectUrl(saved);
  });

export const createWhatsappChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; operacaoId: string; kind?: "chat" | "notification" }) => ({
    name: String(d?.name ?? "").trim(),
    operacaoId: String(d?.operacaoId ?? "").trim(),
    kind: d?.kind === "notification" ? "notification" : "chat" as "chat" | "notification",
  }))
  .handler(async ({ context, data }) => {
    if (!data.name) throw new Error("Nome obrigatório");
    if (!data.operacaoId) throw new Error("Operação obrigatória");
    const ch = await evoFetch("/api/v1/channels", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        type: "whatsapp",
        metadata: { operacao_id: data.operacaoId, app_source: APP_SOURCE, kind: data.kind },
      }),
    });
    await upsertLocalChannel(context.supabase, { ...ch, metadata: { ...(ch?.metadata ?? {}), kind: data.kind } }, data.operacaoId);
    return withConnectUrl({ ...ch, kind: data.kind });
  });



export const setChannelOperacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; operacaoId: string; currentMetadata?: Record<string, any> | null }) => ({
    id: String(d?.id ?? ""),
    operacaoId: String(d?.operacaoId ?? "").trim(),
    currentMetadata: d?.currentMetadata ?? null,
  }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("ID obrigatório");
    if (!data.operacaoId) throw new Error("Operação obrigatória");
    const merged = { ...(normalizeMetadata(data.currentMetadata) ?? {}), app_source: APP_SOURCE, operacao_id: data.operacaoId };
    const currentFull = await evoFetch(`/api/v1/channels/${data.id}`).catch(() => ({ id: data.id, metadata: merged }));
    await upsertLocalChannel(context.supabase, { ...currentFull, metadata: merged }, data.operacaoId);
    await evoFetch(`/api/v1/channels/${data.id}/metadata`, {
      method: "PUT",
      body: JSON.stringify({ metadata: merged }),
    }).catch(() => null);
    return withConnectUrl({ ...currentFull, metadata: merged });
  });

export const deleteWhatsappChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data }) => {
    if (!data.id) throw new Error("ID obrigatório");
    await evoFetch(`/api/v1/channels/${data.id}`, { method: "DELETE" });
    return { ok: true };
  });

export const regenerateWhatsappToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data }) => {
    if (!data.id) throw new Error("ID obrigatório");
    const ch = await evoFetch(`/api/v1/channels/${data.id}/regenerate-token`, {
      method: "POST",
    });
    return withConnectUrl(ch);
  });

export type WhatsappQuality = {
  id: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null; // GREEN | YELLOW | RED | UNKNOWN
  platformType: string | null;
  codeVerificationStatus: string | null;
  nameStatus: string | null;
  throughputLevel: string | null;
};

// Fetches phone quality info from Meta Graph through the EvoHub Meta proxy.
export const getWhatsappQuality = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data }): Promise<WhatsappQuality | null> => {
    if (!data.id) throw new Error("ID obrigatório");
    // Load the channel to get its token + phone_number_id
    const all = await evoFetch("/api/v1/channels");
    const list: any[] = Array.isArray(all) ? all : all?.data ?? all?.channels ?? [];
    const ch = list.find((c) => c.id === data.id);
    if (!ch) return null;
    const metaConnection = getMetaConnection(ch);
    const pnid: string | undefined = metaConnection?.phone_number_id ?? metaConnection?.phone_numbers?.[0]?.id;
    const token: string | undefined = ch?.token;
    if (!pnid || !token) {
      return {
        id: data.id,
        phoneNumberId: null,
        displayPhoneNumber: null,
        verifiedName: null,
        qualityRating: null,
        platformType: null,
        codeVerificationStatus: null,
        nameStatus: null,
        throughputLevel: null,
      };
    }
    const fields = [
      "display_phone_number",
      "verified_name",
      "quality_rating",
      "platform_type",
      "code_verification_status",
      "name_status",
      "throughput",
    ].join(",");
    const res = await fetch(
      `${EVOHUB_BASE}/meta/${pnid}?fields=${fields}`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
    );
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      return {
        id: data.id,
        phoneNumberId: pnid,
        displayPhoneNumber: metaConnection?.phone_number ?? metaConnection?.phone_numbers?.[0]?.display_phone_number ?? null,
        verifiedName: metaConnection?.display_name ?? metaConnection?.phone_numbers?.[0]?.verified_name ?? null,
        qualityRating: null,
        platformType: null,
        codeVerificationStatus: null,
        nameStatus: null,
        throughputLevel: null,
      };
    }
    return {
      id: data.id,
      phoneNumberId: pnid,
      displayPhoneNumber: body?.display_phone_number ?? metaConnection?.phone_number ?? metaConnection?.phone_numbers?.[0]?.display_phone_number ?? null,
      verifiedName: body?.verified_name ?? metaConnection?.display_name ?? metaConnection?.phone_numbers?.[0]?.verified_name ?? null,
      qualityRating: body?.quality_rating ?? null,
      platformType: body?.platform_type ?? null,
      codeVerificationStatus: body?.code_verification_status ?? null,
      nameStatus: body?.name_status ?? null,
      throughputLevel: body?.throughput?.level ?? null,
    };
  });

