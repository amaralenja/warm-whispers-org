import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function jwtRole(value: string): string | null {
  try {
    const [, payload] = value.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof json?.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

function collectSecretCandidates(value: unknown, out: string[] = []): string[] {
  if (!value) return out;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return out;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        collectSecretCandidates(JSON.parse(trimmed), out);
        return out;
      } catch {
        // keep raw string fallback below
      }
    }
    for (const part of trimmed.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean)) out.push(part);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSecretCandidates(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectSecretCandidates(item, out);
  }
  return out;
}

function pickSupabaseAdminKey(): string | null {
  const candidates = collectSecretCandidates([
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SECRET_KEYS,
  ]);
  return (
    candidates.find((k) => k.startsWith("sb_secret_")) ||
    candidates.find((k) => jwtRole(k) === "service_role") ||
    null
  );
}

async function createRouteSupabaseAdmin() {
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://wvcwrozwnwdlpandwubp.supabase.co";
  const key = pickSupabaseAdminKey();
  if (!key) {
    throw new Error("Supabase admin key (service role) não encontrada no servidor.");
  }
  return createClient(SUPABASE_URL, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
        if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
        if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "X-API-Key, Content-Type",
  "Access-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export const Route = (createFileRoute as any)("/api/public/onboarding-leads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      
      GET: async ({ request }: { request: Request }) => {
        try {
          const apiKey = request.headers.get("x-api-key")?.trim();
          const expectedKey = "sk_onboarding_9il22601t8jcyri0mrwz6v";
          
          if (!apiKey || apiKey !== expectedKey) {
            return json(401, { ok: false, error: "API Key inválida ou ausente no header X-API-Key" });
          }

          const adminSb = await createRouteSupabaseAdmin();
          const { data, error } = await adminSb
            .from("ht_quiz_submissions")
            .select("*")
            .eq("utm_source", "criar_saas")
            .order("received_at", { ascending: false });

          if (error) {
            return json(500, { ok: false, error: "Erro ao buscar do banco: " + error.message });
          }

          const leads = (data || []).map((item: any) => {
            const resp = item.respostas || {};
            return {
              user_id: resp.user_id || null,
              email: item.email,
              display_name: item.nome,
              knows_saas: resp.knows_saas ?? null,
              niche: resp.niche || null,
              team_size: resp.team_size || null,
              revenue_goal: resp.revenue_goal || null,
              budget: resp.budget || null,
              whatsapp: item.whatsapp,
              completed_at: item.received_at
            };
          });

          return json(200, { leads });
        } catch (e: any) {
          return json(500, { ok: false, error: e?.message || "erro interno" });
        }
      },

      POST: async ({ request }: { request: Request }) => {
        try {
          const apiKey = request.headers.get("x-api-key")?.trim();
          const expectedKey = "sk_onboarding_9il22601t8jcyri0mrwz6v";
          
          if (!apiKey || apiKey !== expectedKey) {
            return json(401, { ok: false, error: "API Key inválida ou ausente no header X-API-Key" });
          }

          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object") {
            return json(400, { ok: false, error: "JSON inválido" });
          }

          const b = body as Record<string, any>;
          const email = b.email ? String(b.email).trim() : null;
          const display_name = b.display_name ? String(b.display_name).trim() : null;
          const whatsapp = b.whatsapp ? String(b.whatsapp).trim() : null;

          if (!email || !display_name) {
            return json(400, { ok: false, error: "Os campos email e display_name são obrigatórios" });
          }

          const adminSb = await createRouteSupabaseAdmin();

          const insertPayload = {
            nome: display_name,
            email: email,
            whatsapp: whatsapp,
            utm_source: "criar_saas",
            respostas: {
              ...b,
              origem: "criar_saas"
            },
            received_at: b.completed_at || new Date().toISOString()
          };

          const { data, error } = await adminSb
            .from("ht_quiz_submissions")
            .insert([insertPayload])
            .select()
            .single();

          if (error) {
            console.error("Erro ao salvar lead do Criar SaaS:", error);
            return json(500, { ok: false, error: "Erro ao salvar no banco: " + error.message });
          }

          return json(200, { ok: true, id: data.id, received_at: data.received_at });
        } catch (e: any) {
          console.error("Erro interno no endpoint onboarding-leads:", e);
          return json(500, { ok: false, error: e?.message || "erro interno" });
        }
      }
    }
  }
});
