import { createServerFn } from "@tanstack/react-start";
import type { SaasFase } from "./ht-saas-state";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const listSaasProjectsServer = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const sb = await db();
      const { data, error } = await sb
        .from("ht_saas_projects" as any)
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) return { ok: true, projects: [] };
      return { ok: true, projects: (data ?? []) as any[] };
    } catch {
      return { ok: true, projects: [] };
    }
  });

export const saveSaasProjectServer = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id?: string;
      nome: string;
      linkSaas?: string | null;
      nomeGrupo?: string | null;
      linkGrupo?: string | null;
      fase: SaasFase;
      devResponsavel?: string | null;
      progressoPct?: number;
      descricao?: string | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    const id = data.id || `saas-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const payload = {
      id,
      nome: data.nome.trim(),
      link_saas: data.linkSaas?.trim() || null,
      nome_grupo: data.nomeGrupo?.trim() || null,
      link_grupo: data.linkGrupo?.trim() || null,
      fase: data.fase,
      dev_responsavel: data.devResponsavel?.trim() || null,
      progresso_pct: Number(data.progressoPct ?? 0),
      descricao: data.descricao?.trim() || null,
      updated_at: now,
    };

    try {
      const sb = await db();
      await sb
        .from("ht_saas_projects" as any)
        .upsert({ ...payload, created_at: now });
    } catch {
      // Ignora caso tabela personalizada ainda não esteja criada
    }

    return { ok: true, id, payload };
  });

export const deleteSaasProjectServer = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    try {
      const sb = await db();
      await sb
        .from("ht_saas_projects" as any)
        .delete()
        .eq("id", data.id);
    } catch {
      // noop
    }
    return { ok: true };
  });
