import type { Permissoes } from "@/lib/menu-permissions";

export type VendorSession = {
  id: number;
  nome?: string | null;
  utm?: string | null;
  expert?: string | null;
  foto_url?: string | null;
  codigo?: string | null;
  ativo?: boolean | null;
  permissoes?: Permissoes | null;
  wa_channel_ids?: string[] | null;
  workspace_ids?: string[] | null;
};

function normalizeSession(value: unknown): VendorSession | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  const id = Number(s.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    ...(s as VendorSession),
    id,
    codigo: s.codigo == null ? null : String(s.codigo),
    wa_channel_ids: Array.isArray(s.wa_channel_ids) ? s.wa_channel_ids.map(String) : [],
    workspace_ids: Array.isArray(s.workspace_ids) ? s.workspace_ids.map(String) : null,
  };
}

export function parseVendorSession(raw: string | null | undefined): VendorSession | null {
  if (!raw) return null;
  try {
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function getVendorSession(): VendorSession | null {
  if (typeof window === "undefined") return null;
  return parseVendorSession(window.localStorage.getItem("vendor_session"));
}

export function saveVendorSession(session: VendorSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("vendor_session", JSON.stringify(session));
}

export function clearVendorSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("vendor_session");
}

export function encodeVendorSessionHeader(session: VendorSession | null): string | null {
  if (!session?.id || !session.codigo) return null;
  const payload = JSON.stringify({ id: session.id, codigo: session.codigo });
  try {
    if (typeof btoa !== "undefined") {
      return btoa(unescape(encodeURIComponent(payload)));
    }
  } catch {
    // fallback abaixo
  }
  return encodeURIComponent(payload);
}

export function allowedWorkspaceIdsFromSession(session: VendorSession | null): string[] {
  if (!session) return [];
  // null/undefined = legado: cai no workspace do expert. [] = admin removeu todos.
  if (Array.isArray(session.workspace_ids)) {
    return session.workspace_ids.map(String).filter(Boolean);
  }
  return session.expert ? [String(session.expert)] : [];
}
