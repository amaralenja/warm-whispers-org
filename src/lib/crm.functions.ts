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
    let rows: any[] = [];
    if (rpcArgs) {
      const { data, error } = await db.rpc("vendor_list_crm_leads" as any, rpcArgs);
      if (error) throw new Error(error.message);
      rows = (data ?? []) as any[];
    } else {
      let q: any = db.from("crm_leads" as any).select("*").order("ordem", { ascending: true }).order("created_at", { ascending: false });
      q = applyVendorWorkspaceFilter(context, q);
      if (!q) return [];
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      rows = (data ?? []) as any[];
    }
    // Escopo por vendedor: mostra leads vinculados ao vendedor (canal, UTM, nome, código ou ID)
    // ou leads da operação do vendedor sem responsável exclusivo.
    if (context?.vendor) {
      const vUtm = normalizeText(context.vendor.utm);
      const vNome = normalizeText(context.vendor.nome);
      const vCodigo = normalizeText(context.vendor.codigo);
      const vId = String(context.vendor.id ?? "");
      const mine = new Set([vUtm, vNome, vCodigo].filter(Boolean));
      
      const vChannels = new Set(
        Array.isArray(context.vendor.wa_channel_ids)
          ? context.vendor.wa_channel_ids.map((id: any) => String(id).trim().toLowerCase())
          : []
      );

      const allowedWorkspaces = vendorWorkspaceIds(context) ?? [];

      rows = rows.filter((l: any) => {
        // 1. Vincular pelo canal do WhatsApp (channel_id nos dados do lead)
        const channelId = String(l?.dados?.channel_id ?? "").trim().toLowerCase();
        if (channelId && vChannels.has(channelId)) return true;

        // 2. Vincular pelas informações de responsável (nome, utm, código ou id)
        const ru = normalizeText(l?.responsavel_utm);
        const rn = normalizeText(l?.responsavel_nome);
        const rc = normalizeText((l as any)?.responsavel_codigo);
        const rVendorId = String(l?.dados?.assigned_vendor_id ?? (l as any)?.vendedor_id ?? "");

        if (rVendorId && rVendorId === vId) return true;
        if (ru && mine.has(ru)) return true;
        if (rn && mine.has(rn)) return true;
        if (rc && mine.has(rc)) return true;

        // Suporte a correspondência parcial de nome ou utm
        if (rn && vNome && (rn.includes(vNome) || vNome.includes(rn))) return true;
        if (ru && vUtm && (ru.includes(vUtm) || vUtm.includes(ru))) return true;

        // 3. Leads do mesmo workspace/operação sem responsável exclusivo são visíveis ao vendedor da operação
        if (!ru && !rn && !rc && !rVendorId) {
          if (allowedWorkspaces.length === 0) return true;
          const exp = String(l?.expert ?? "").trim();
          if (!exp || allowedWorkspaces.some((w) => sameWorkspace(w, exp))) return true;
        }

        // 4. Se a lead é do workspace do vendedor e não está bloqueada por outro responsável
        const exp = String(l?.expert ?? "").trim();
        if (allowedWorkspaces.some((w) => sameWorkspace(w, exp))) {
          if (!ru && !rn && !rc) return true;
        }

        return false;
      });
    }
    return rows;
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

    // Se veio lista de tags, resolve stage_id da primeira tag vinculada a coluna
    // e força status = stage_id (automação "tag -> coluna").
    let autoStatus: string | null = null;
    if (Array.isArray(data?.tags) && data.tags.length > 0) {
      const tagNames = data.tags.map((t: any) => String(t ?? "").trim()).filter(Boolean);
      if (tagNames.length > 0) {
        const opFilter = data?.expert ? String(data.expert) : null;
        let q = db.from("crm_tags" as any).select("nome, stage_id, operacao").in("nome", tagNames);
        const { data: tagRows } = await q;
        const rows = (tagRows as any[]) ?? [];
        const match = rows.find((r) => r?.stage_id && (!opFilter || r.operacao === opFilter || r.operacao === "all"))
          ?? rows.find((r) => r?.stage_id);
        if (match?.stage_id) autoStatus = String(match.stage_id);
      }
    }

    if (data.id) {
      await assertLeadAccess(context, db, String(data.id));
      if (data.expert !== undefined) assertPayloadWorkspace(context, data);
      const patch = { ...data };
      if (autoStatus) patch.status = autoStatus;
      const { error } = await db.from("crm_leads" as any).update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    assertPayloadWorkspace(context, data);
    const insertPayload = { ...data };
    if (autoStatus) insertPayload.status = autoStatus;
    const { data: ins, error } = await db.from("crm_leads" as any).insert(insertPayload).select("id").single();
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
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { error } = await db.rpc("vendor_create_crm_tag" as any, {
        ...rpcArgs,
        _nome: data.nome,
        _cor: data.cor,
        _operacao: data.operacao,
        _stage_id: data.stage_id,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
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
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { error } = await db.rpc("vendor_update_crm_tag" as any, {
        ...rpcArgs,
        _id: data.id,
        _nome: data.nome ?? null,
        _cor: data.cor ?? null,
        _stage_id: data.stage_id ?? null,
        _clear_stage: data.stage_id === null,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
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
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { data: newId, error } = await db.rpc("vendor_upsert_crm_stage" as any, {
        ...rpcArgs,
        _id: data.id ?? null,
        _operacao: data.operacao,
        _nome: data.nome,
        _cor: data.cor,
        _ordem: data.ordem,
      });
      if (error) throw new Error(error.message);
      return { id: data.id ?? newId };
    }
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
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { error } = await db.rpc("vendor_delete_crm_stage" as any, { ...rpcArgs, _id: data.id });
      if (error) throw new Error(error.message);
      return { ok: true };
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
    const rpcArgs = context?.vendor ? vendorRpcArgs(context) : null;
    if (rpcArgs) {
      const { error } = await db.rpc("vendor_delete_crm_tag" as any, { ...rpcArgs, _id: data.id });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await db.from("crm_tags" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

