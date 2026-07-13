import { createServerFn } from "@tanstack/react-start";

export const FASES = ["espionagem", "modelagem", "construcao", "concluido"] as const;
export type Fase = (typeof FASES)[number];

export const CATEGORIAS = ["x1", "grupo", "individual"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export type HTCustomerSuccess = {
  id: string;
  aluno_nome: string;
  categoria: Categoria;
  entrada_mentoria: string | null;
  fase: Fase;
  ultima_call: string | null;
  whatsapp_privado: string | null;
  grupo_whatsapp_link: string | null;
  observacoes: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  celular: string | null;
  email: string | null;
  formulario_integracao_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HTCustomerSuccessCall = {
  id: string;
  aluno_id: string;
  data: string | null;
  evento: string | null;
  responsavel: string | null;
  link: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const listCustomerSuccess = createServerFn({ method: "GET" })
  .handler(async () => {
    const sb = await db();
    const { data, error } = await sb
      .from("ht_customer_success")
      .select("*")
      .order("fase", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as HTCustomerSuccess[];
  });

export const upsertCustomerSuccess = createServerFn({ method: "POST" })
  .inputValidator((d: {
    id?: string | null;
    aluno_nome: string;
    categoria?: Categoria;
    entrada_mentoria?: string | null;
    fase?: Fase;
    ultima_call?: string | null;
    whatsapp_privado?: string | null;
    grupo_whatsapp_link?: string | null;
    observacoes?: string | null;
    cpf?: string | null;
    data_nascimento?: string | null;
    endereco?: string | null;
    celular?: string | null;
    email?: string | null;
    formulario_integracao_url?: string | null;
  }) => d)
  .handler(async ({ data }) => {
    const nome = String(data.aluno_nome || "").trim();
    if (!nome) throw new Error("Nome do aluno é obrigatório");
    const payload: any = {
      aluno_nome: nome,
      categoria: data.categoria ?? "x1",
      entrada_mentoria: data.entrada_mentoria || null,
      fase: data.fase ?? "espionagem",
      ultima_call: data.ultima_call || null,
      whatsapp_privado: data.whatsapp_privado?.trim() || null,
      grupo_whatsapp_link: data.grupo_whatsapp_link?.trim() || null,
      observacoes: data.observacoes?.trim() || null,
      cpf: data.cpf?.trim() || null,
      data_nascimento: data.data_nascimento || null,
      endereco: data.endereco?.trim() || null,
      celular: data.celular?.trim() || null,
      email: data.email?.trim() || null,
      formulario_integracao_url: data.formulario_integracao_url?.trim() || null,
    };
    const sb = await db();
    if (data.id) {
      const { error } = await sb.from("ht_customer_success").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await sb
      .from("ht_customer_success")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row!.id as string };
  });

export const updateCustomerSuccessFase = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; fase: Fase; sort_order?: number }) => d)
  .handler(async ({ data }) => {
    const sb = await db();
    const { error } = await sb
      .from("ht_customer_success")
      .update({ fase: data.fase, sort_order: data.sort_order ?? 0 })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCustomerSuccess = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const sb = await db();
    const { error } = await sb.from("ht_customer_success").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Cronograma de Calls
// ============================================================

export const listCustomerSuccessCalls = createServerFn({ method: "GET" })
  .inputValidator((d: { aluno_id: string }) => d)
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: rows, error } = await sb
      .from("ht_customer_success_calls")
      .select("*")
      .eq("aluno_id", data.aluno_id)
      .order("sort_order", { ascending: true })
      .order("data", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as HTCustomerSuccessCall[];
  });

export const upsertCustomerSuccessCall = createServerFn({ method: "POST" })
  .inputValidator((d: {
    id?: string | null;
    aluno_id: string;
    data?: string | null;
    evento?: string | null;
    responsavel?: string | null;
    link?: string | null;
    sort_order?: number;
  }) => d)
  .handler(async ({ data }) => {
    if (!data.aluno_id) throw new Error("aluno_id obrigatório");
    const payload: any = {
      aluno_id: data.aluno_id,
      data: data.data || null,
      evento: data.evento?.trim() || null,
      responsavel: data.responsavel?.trim() || null,
      link: data.link?.trim() || null,
      sort_order: data.sort_order ?? 0,
    };
    const sb = await db();
    if (data.id) {
      const { error } = await sb.from("ht_customer_success_calls").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await sb
      .from("ht_customer_success_calls")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row!.id as string };
  });

export const deleteCustomerSuccessCall = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const sb = await db();
    const { error } = await sb.from("ht_customer_success_calls").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
