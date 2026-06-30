import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function extractUsername(input: string): string | null {
  const t = input.trim().replace(/^@/, "");
  if (!t) return null;
  // URL form
  const m = t.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (m) return m[1].replace(/\/+$/, "");
  // bare username
  if (/^[A-Za-z0-9._]+$/.test(t)) return t;
  return null;
}

export const fetchInstagramProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { input: string }) => data)
  .handler(async ({ data, context }) => {
    const username = extractUsername(data.input);
    if (!username) throw new Error("Informe um @usuario ou URL válida do Instagram");

    // Já está salvo? Devolve sem chamar Bright Data de novo.
    const { data: existing } = await context.supabase
      .from("instagram_leads")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    if (existing) return existing;

    const apiKey = process.env.BRIGHTDATA_API_KEY;
    if (!apiKey) throw new Error("BRIGHTDATA_API_KEY não configurada no servidor");

    const url = `https://www.instagram.com/${username}/`;

    let row: any = null;
    let failure: string | null = null;
    try {
      const res = await fetch(
        "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1vikfch901nx3by4&format=json",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify([{ url }]),
        }
      );
      if (!res.ok) {
        failure = `Bright Data ${res.status}`;
      } else {
        const json = await res.json();
        row = Array.isArray(json) ? json[0] : json;
        if (!row || row.error || row.warning) {
          failure = row?.error || row?.warning || "not_found";
          row = null;
        }
      }
    } catch (e: any) {
      failure = e?.message || "fetch_error";
    }

    if (!row) {
      // Marca como fake no banco pra não re-verificar.
      const fakeRow = {
        username,
        verification_status: "fake",
        profile_url: url,
        raw: { failure } as any,
        fetched_at: new Date().toISOString(),
      };
      const { data: savedFake } = await context.supabase
        .from("instagram_leads")
        .upsert(fakeRow, { onConflict: "username" })
        .select()
        .single();
      throw new Error(failure || "Perfil não encontrado");
    }

    const profile = {
      username: String(row.account || row.username || username).replace(/^@/, ""),
      full_name: row.full_name ?? row.profile_name ?? null,
      biography: row.biography ?? row.bio ?? null,
      followers: Number(row.followers ?? row.followers_count ?? 0) || 0,
      following: Number(row.following ?? row.following_count ?? 0) || 0,
      posts_count: Number(row.posts_count ?? row.posts ?? 0) || 0,
      is_verified: Boolean(row.is_verified ?? row.verified ?? false),
      profile_pic_url:
        row.profile_image_link ?? row.profile_pic_url ?? row.profile_pic_url_hd ??
        row.profile_picture_url ?? row.profile_image ?? row.avatar ?? row.profilePicUrl ?? null,
      profile_url: row.url ?? url,
      verification_status: "real",
      raw: row,
      fetched_at: new Date().toISOString(),
    };

    const { data: saved, error } = await context.supabase
      .from("instagram_leads")
      .upsert(profile, { onConflict: "username" })
      .select()
      .single();

    if (error) throw new Error("Erro ao salvar: " + error.message);
    return saved;
  });

export const getInstagramLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { username: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("instagram_leads")
      .select("*")
      .eq("username", data.username.replace(/^@/, ""))
      .maybeSingle();
    return row;
  });

export const listInstagramLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { usernames: string[] }) => data)
  .handler(async ({ data, context }) => {
    const list = (data.usernames || [])
      .map((u) => (u || "").replace(/^@/, "").toLowerCase())
      .filter(Boolean);
    if (list.length === 0) return [];
    const { data: rows } = await context.supabase
      .from("instagram_leads")
      .select("*")
      .in("username", list);
    return rows ?? [];
  });
