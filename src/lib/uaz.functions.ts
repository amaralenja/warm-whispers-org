import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizePhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  return digits;
}

function normalizeServer(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

async function loadConfig(context: any): Promise<{ server_url: string; instance_token: string } | null> {
  const { data } = await context.supabase
    .from("uaz_config" as any)
    .select("server_url, instance_token")
    .eq("id", 1)
    .maybeSingle();
  const row = (data ?? null) as { server_url: string | null; instance_token: string | null } | null;
  if (!row?.server_url || !row?.instance_token) return null;
  return { server_url: normalizeServer(row.server_url), instance_token: row.instance_token };
}

export const getUazConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("uaz_config" as any)
      .select("server_url, instance_token, updated_at")
      .eq("id", 1)
      .maybeSingle();
    const row = (data ?? null) as { server_url: string | null; instance_token: string | null; updated_at: string | null } | null;
    return {
      server_url: row?.server_url ?? "",
      // mascarado — não devolve o token cru
      has_token: !!row?.instance_token,
      token_preview: row?.instance_token ? `${row.instance_token.slice(0, 6)}…${row.instance_token.slice(-4)}` : "",
      updated_at: row?.updated_at ?? null,
    };
  });

export const saveUazConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { server_url: string; instance_token?: string }) => {
    const server_url = normalizeServer(String(data?.server_url ?? ""));
    if (!server_url) throw new Error("Server URL obrigatório");
    const instance_token = data?.instance_token != null ? String(data.instance_token).trim() : undefined;
    return { server_url, instance_token };
  })
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      id: 1,
      server_url: data.server_url,
      updated_at: new Date().toISOString(),
    };
    if (data.instance_token) patch.instance_token = data.instance_token;
    const { error } = await context.supabase
      .from("uaz_config" as any)
      .upsert(patch, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testUazConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = await loadConfig(context);
    if (!cfg) throw new Error("Configura server_url e token primeiro");
    try {
      const res = await fetch(`${cfg.server_url}/instance/status`, {
        method: "GET",
        headers: { token: cfg.instance_token, Accept: "application/json" },
      });
      const text = await res.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* keep raw */ }
      return { ok: res.ok, status: res.status, body };
    } catch (e: any) {
      return { ok: false, status: 0, body: String(e?.message ?? e) };
    }
  });

export const getUazProfilePic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { phone: string }) => {
    const phone = normalizePhone(String(data?.phone ?? ""));
    if (!phone) throw new Error("phone obrigatório");
    return { phone };
  })
  .handler(async ({ data, context }) => {
    const cfg = await loadConfig(context);
    if (!cfg) return { image: null as string | null, name: null as string | null, error: "uaz_not_configured" };

    // uazapiGO V2 — POST /chat/GetNameAndImageURL  { number }
    async function callEndpoint(path: string, body: Record<string, unknown>) {
      const res = await fetch(`${cfg.server_url}${path}`, {
        method: "POST",
        headers: {
          token: cfg.instance_token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* raw */ }
      return { ok: res.ok, status: res.status, json, text };
    }

    const attempts = [
      { path: "/chat/GetNameAndImageURL", body: { number: data.phone } },
      { path: "/chat/getNameAndImageURL", body: { number: data.phone } },
      { path: "/chat/getContactInfo", body: { number: data.phone } },
    ];

    for (const a of attempts) {
      try {
        const r = await callEndpoint(a.path, a.body);
        if (!r.ok || !r.json) continue;
        const j = r.json;
        const image = j.imgUrl ?? j.image ?? j.imageUrl ?? j.picture ?? j.profilePicUrl ?? null;
        const name = j.name ?? j.pushname ?? j.verifiedName ?? null;
        if (image || name) return { image, name, error: null };
      } catch { /* try next */ }
    }
    return { image: null, name: null, error: "not_found" };
  });
