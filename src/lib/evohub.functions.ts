import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVOHUB_BASE = "https://api.evohub.ai";
const EVOHUB_CONNECT_BASE = "https://app.evohub.ai";

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

