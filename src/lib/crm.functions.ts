import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function dbFor(context: any) {
  if (context?.vendor && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
  }
  return context.supabase as any;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sameWorkspace(a: unknown, b: unknown) {
  return normalizeText(a) === normalizeText(b);
}

function vendorRpcArgs(context: any) {
  const id = Number(context?.vendor?.id);
  const codigo = String(context?.vendor?.codigo ?? "").trim();
  return Number.isFinite(id) && id > 0 && codigo ? { _vendor_id: id, _codigo: codigo } : null;
}

function vendorWorkspaceIds(context: any): string[] | null {
  if (!context?.vendor) return null;
  const ids = context.vendor.workspace_ids;
  const expert = context.vendor.expert ? [String(context.vendor.expert)] : [];
  if (Array.isArray(ids)) {
    const list = ids.map(String).filter(Boolean);
    // Empty array → cai pro expert do vendedor pra não bloquear acesso.
    return list.length > 0 ? list : expert;
  }
  return expert;
}

function applyVendorWorkspaceFilter(context: any, q: any) {
  const allowed = vendorWorkspaceIds(context);
  if (!allowed) return q;
  if (allowed.length === 0) return q; // sem expert → não filtra (mostra geral)
  return q.in("expert", allowed);
}

function hasAllowedWorkspace(context: any, workspace: unknown) {
  const allowed = vendorWorkspaceIds(context) ?? [];
  return allowed.some((a) => sameWorkspace(a, workspace));
}

async function assertLeadAccess(context: any, db: any, leadId: string) {
  if (!context?.vendor) return;
  const { data, error } = await db.from("crm_leads" as any).select("id,expert").eq("id", leadId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lead não encontrado");
  const allowed = vendorWorkspaceIds(context) ?? [];
  if (!hasAllowedWorkspace(context, (data as any).expert)) {
    throw new Error("Inautorizado: vendedor sem acesso a este workspace");
  }
}

function assertPayloadWorkspace(context: any, payload: any) {
  if (!context?.vendor) return;
  const allowed = vendorWorkspaceIds(context) ?? [];
  const expert = String(payload?.expert ?? context.vendor.expert ?? "");
  if (!expert || !allowed.some((a) => sameWorkspace(a, expert))) throw new Error("Inautorizado: vendedor sem acesso a este workspace");
}

export const listCrmExperts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await dbFor(context);
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data, error } = await db.rpc("vendor_list_crm_experts" as any, rpcArgs);
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((e) => ({ ...e, crm_api_key: null }));
    }
    let q = db.from("experts" as any).select("id,nome,ativo,crm_api_key").order("nome");
    const allowed = vendorWorkspaceIds(context);
    if (allowed) {
      if (allowed.length === 0) return [];
      q = q.in("nome", allowed);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((e) => ({ ...e, crm_api_key: context?.vendor ? null : e.crm_api_key }));
  });

export const listCrmLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await dbFor(context);
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data, error } = await db.rpc("vendor_list_crm_leads" as any, rpcArgs);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    let q: any = db.from("crm_leads" as any).select("*").order("ordem", { ascending: true }).order("created_at", { ascending: false });
    q = applyVendorWorkspaceFilter(context, q);
    if (!q) return [];
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const syncInsertCrmLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leads: any[] }) => ({ leads: Array.isArray(d?.leads) ? d.leads : [] }))
  .handler(async ({ context, data }) => {
    if (context?.vendor) throw new Error("Inautorizado: sincronização é restrita ao admin");
    const db = await dbFor(context);
    if (data.leads.length === 0) return [];
    const { data: ins, error } = await db.from("crm_leads" as any).insert(data.leads).select("id");
    if (error) throw new Error(error.message);
    return ins ?? [];
  });

export const upsertCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d ?? {})
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (data.id) {
      await assertLeadAccess(context, db, String(data.id));
      if (data.expert !== undefined) assertPayloadWorkspace(context, data);
      const { error } = await db.from("crm_leads" as any).update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    assertPayloadWorkspace(context, data);
    const { data: ins, error } = await db.from("crm_leads" as any).insert(data).select("id").single();
    if (error) throw new Error(error.message);
    return ins;
  });

export const deleteCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    await assertLeadAccess(context, db, data.id);
    const { error } = await db.from("crm_leads" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCrmLeadStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string }) => ({ id: String(d?.id ?? ""), status: String(d?.status ?? "novo") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data: ok, error } = await db.rpc("vendor_update_crm_lead_stage" as any, { ...rpcArgs, _lead_id: data.id, _status: data.status });
      if (error) throw new Error(error.message);
      if (!ok) throw new Error("Inautorizado: vendedor sem acesso a este lead");
      return { ok: true };
    }
    await assertLeadAccess(context, db, data.id);
    const { error } = await db.from("crm_leads" as any).update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCrmTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { operacao?: string }) => ({ operacao: d?.operacao ?? "all" }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data: rows, error } = await db.rpc("vendor_list_crm_tags" as any, { ...rpcArgs, _operacao: data.operacao ?? "all" });
      if (error) throw new Error(error.message);
      return rows ?? [];
    }
    let q = db.from("crm_tags" as any).select("*").order("nome");
    if (data.operacao && data.operacao !== "all") q = q.eq("operacao", data.operacao);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const allowed = vendorWorkspaceIds(context);
    if (!allowed) return rows ?? [];
    return ((rows ?? []) as any[]).filter((t) => allowed.some((a) => sameWorkspace(a, t.operacao)));
  });

export const createCrmTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string; cor: string; operacao: string; stage_id?: string | null }) => ({
    nome: String(d?.nome ?? ""),
    cor: String(d?.cor ?? "#3b82f6"),
    operacao: String(d?.operacao ?? "all"),
    stage_id: d?.stage_id ? String(d.stage_id) : null,
  }))
  .handler(async ({ context, data }) => {
    assertPayloadWorkspace(context, { expert: data.operacao });
    const db = await dbFor(context);
    const { error } = await db.from("crm_tags" as any).insert({ nome: data.nome, cor: data.cor, operacao: data.operacao, stage_id: data.stage_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCrmTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; nome?: string; cor?: string; stage_id?: string | null }) => ({
    id: String(d?.id ?? ""),
    nome: d?.nome !== undefined ? String(d.nome) : undefined,
    cor: d?.cor !== undefined ? String(d.cor) : undefined,
    stage_id: d?.stage_id !== undefined ? (d.stage_id ? String(d.stage_id) : null) : undefined,
  }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (context?.vendor) {
      const { data: tag } = await db.from("crm_tags" as any).select("operacao").eq("id", data.id).maybeSingle();
      assertPayloadWorkspace(context, { expert: (tag as any)?.operacao });
    }
    const patch: any = {};
    if (data.nome !== undefined) patch.nome = data.nome;
    if (data.cor !== undefined) patch.cor = data.cor;
    if (data.stage_id !== undefined) patch.stage_id = data.stage_id;
    const { error } = await db.from("crm_tags" as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Stages (colunas) ----------
export const listCrmStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { operacao?: string }) => ({ operacao: d?.operacao ?? "all" }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data: rows, error } = await db.rpc("vendor_list_crm_stages" as any, { ...rpcArgs, _operacao: data.operacao ?? "all" });
      if (error) throw new Error(error.message);
      return rows ?? [];
    }
    let q = db.from("crm_stages" as any).select("*").order("ordem").order("created_at");
    if (data.operacao && data.operacao !== "all") q = q.eq("operacao", data.operacao);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const allowed = vendorWorkspaceIds(context);
    if (!allowed) return rows ?? [];
    return ((rows ?? []) as any[]).filter((t) => allowed.some((a) => sameWorkspace(a, t.operacao)));
  });

export const upsertCrmStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; operacao: string; nome: string; cor?: string; ordem?: number }) => ({
    id: d?.id ? String(d.id) : undefined,
    operacao: String(d?.operacao ?? "all"),
    nome: String(d?.nome ?? ""),
    cor: String(d?.cor ?? "#3b82f6"),
    ordem: Number.isFinite(d?.ordem) ? Number(d?.ordem) : 0,
  }))
  .handler(async ({ context, data }) => {
    assertPayloadWorkspace(context, { expert: data.operacao });
    const db = await dbFor(context);
    if (data.id) {
      const { error } = await db.from("crm_stages" as any).update({ nome: data.nome, cor: data.cor, ordem: data.ordem }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await db.from("crm_stages" as any).insert({ operacao: data.operacao, nome: data.nome, cor: data.cor, ordem: data.ordem }).select("id").single();
    if (error) throw new Error(error.message);
    return ins;
  });

export const deleteCrmStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (context?.vendor) {
      const { data: st } = await db.from("crm_stages" as any).select("operacao").eq("id", data.id).maybeSingle();
      assertPayloadWorkspace(context, { expert: (st as any)?.operacao });
    }
    const { error } = await db.from("crm_stages" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const deleteCrmTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (context?.vendor) {
      const { data: tag } = await db.from("crm_tags" as any).select("operacao").eq("id", data.id).maybeSingle();
      assertPayloadWorkspace(context, { expert: (tag as any)?.operacao });
    }
    const { error } = await db.from("crm_tags" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
