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
  created_at: string;
  updated_at: string;
  connectUrl: string;
};

function withConnectUrl(ch: any): EvoChannel {
  const meta = ch.metadata ?? null;
  return {
    id: ch.id,
    name: ch.name,
    type: ch.type,
    status: ch.status,
    token: ch.token,
    metadata: meta,
    operacaoId: (meta && typeof meta.operacao_id === "string") ? meta.operacao_id : null,
    created_at: ch.created_at,
    updated_at: ch.updated_at,
    connectUrl: ch.token ? `${EVOHUB_CONNECT_BASE}/connect/${ch.token}` : "",
  };
}

const APP_SOURCE = "lovable-crm";

export const listWhatsappChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const data = await evoFetch("/api/v1/channels");
    const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.channels ?? [];
    return list
      .filter((c) => (c.type === "whatsapp" || c.type === "unified") && c?.metadata?.app_source === APP_SOURCE)
      .map(withConnectUrl);
  });

export const createWhatsappChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; operacaoId: string }) => ({
    name: String(d?.name ?? "").trim(),
    operacaoId: String(d?.operacaoId ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    if (!data.name) throw new Error("Nome obrigatório");
    if (!data.operacaoId) throw new Error("Operação obrigatória");
    const ch = await evoFetch("/api/v1/channels", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        type: "whatsapp",
        metadata: { operacao_id: data.operacaoId, app_source: APP_SOURCE },
      }),
    });
    return withConnectUrl(ch);
  });


export const setChannelOperacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; operacaoId: string; currentMetadata?: Record<string, any> | null }) => ({
    id: String(d?.id ?? ""),
    operacaoId: String(d?.operacaoId ?? "").trim(),
    currentMetadata: d?.currentMetadata ?? null,
  }))
  .handler(async ({ data }) => {
    if (!data.id) throw new Error("ID obrigatório");
    if (!data.operacaoId) throw new Error("Operação obrigatória");
    const merged = { ...(data.currentMetadata ?? {}), operacao_id: data.operacaoId };
    const ch = await evoFetch(`/api/v1/channels/${data.id}/metadata`, {
      method: "PUT",
      body: JSON.stringify({ metadata: merged }),
    });
    return withConnectUrl(ch);
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
    const pnid: string | undefined = ch?.metadata?.meta_connection?.phone_number_id;
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
      `${EVOHUB_BASE}/meta/v23.0/${pnid}?fields=${fields}`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
    );
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      return {
        id: data.id,
        phoneNumberId: pnid,
        displayPhoneNumber: ch?.metadata?.meta_connection?.phone_number ?? null,
        verifiedName: ch?.metadata?.meta_connection?.display_name ?? null,
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
      displayPhoneNumber: body?.display_phone_number ?? ch?.metadata?.meta_connection?.phone_number ?? null,
      verifiedName: body?.verified_name ?? ch?.metadata?.meta_connection?.display_name ?? null,
      qualityRating: body?.quality_rating ?? null,
      platformType: body?.platform_type ?? null,
      codeVerificationStatus: body?.code_verification_status ?? null,
      nameStatus: body?.name_status ?? null,
      throughputLevel: body?.throughput?.level ?? null,
    };
  });

