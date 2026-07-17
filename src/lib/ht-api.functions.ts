import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function hashToken(token: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export const listHtApiTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ht_api_tokens" as any)
      .select("id, name, token_prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tokens: ((data ?? []) as unknown) as Array<{
      id: string;
      name: string;
      token_prefix: string;
      created_at: string;
      last_used_at: string | null;
      revoked_at: string | null;
    }> };
  });

export const createHtApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string }) => {
    const name = String(data?.name ?? "").trim();
    if (!name) throw new Error("Nome obrigatório");
    if (name.length > 80) throw new Error("Nome muito longo");
    return { name };
  })
  .handler(async ({ data, context }) => {
    const { randomBytes } = await import("crypto");
    const raw = randomBytes(30).toString("base64").replace(/[+/=]/g, "").slice(0, 40);
    const token = `htq_${raw}`;
    const token_hash = await hashToken(token);
    const token_prefix = token.slice(0, 12);
    const { data: row, error } = await context.supabase
      .from("ht_api_tokens" as any)
      .insert({
        name: data.name,
        token_hash,
        token_prefix,
        created_by: context.userId,
      })
      .select("id, name, token_prefix, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { token, row };
  });

export const revokeHtApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    const id = String(data?.id ?? "").trim();
    if (!id) throw new Error("id obrigatório");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ht_api_tokens" as any)
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listHtQuizSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ht_quiz_submissions" as any)
      .select("id, received_at, updated_at, status, nome, email, whatsapp, instagram, utm_source, utm_medium, utm_campaign, utm_content, fbc, fbp, fbclid, gclid, respostas")
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (error) throw new Error(error.message);
    return { submissions: (data ?? []) as Array<any> };
  });


