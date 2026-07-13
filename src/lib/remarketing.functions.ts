import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function dbFor(context: any) {
  // Vendedor não tem sessão Supabase Auth, então RLS anon bloqueia leitura/escrita.
  // Usa o admin client (fallback pra anon em dev; service role em prod).
  if (context?.vendor) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
  }
  return context.supabase as any;
}

function vendorRpcArgs(context: any) {
  const id = Number(context?.vendor?.id);
  const codigo = String(context?.vendor?.codigo ?? "").trim();
  return Number.isFinite(id) && id > 0 && codigo ? { _vendor_id: id, _codigo: codigo } : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ensureVendorRpcArgs(context: any) {
  const args = vendorRpcArgs(context);
  if (!args) throw new Error("Sessão de vendedor inválida. Saia e entre novamente.");
  return args;
}

function parseDbRule(row: any): RemarketingRule {
  return {
    ...row,
    conditions: Array.isArray(row?.conditions) ? row.conditions : [],
  } as RemarketingRule;
}

export type RemarketingCondition =
  | { type: "tag"; value: string }
  | { type: "stage"; value: string };

export type RemarketingRule = {
  id: string;
  nome: string;
  ativo: boolean;
  operacao: string;
  channel_id: string | null;
  flow_id: string;
  minutes_before_close: number;
  conditions: RemarketingCondition[];
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export const listRemarketingRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { operacao?: string }) => ({ operacao: d?.operacao ?? "" }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (context?.vendor) {
      const { data: rows, error } = await db.rpc("vendor_list_remarketing_rules" as any, ensureVendorRpcArgs(context));
      if (error) throw new Error(error.message);
      const list = ((rows ?? []) as any[]).map(parseDbRule);
      if (!data.operacao) return list;
      return list.filter((r) => normalizeText(r.operacao) === normalizeText(data.operacao));
    }
    let q = db.from("wa_remarketing_rules" as any).select("*").order("created_at", { ascending: false });
    if (data.operacao) q = q.eq("operacao", data.operacao);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map(parseDbRule);
  });

export const upsertRemarketingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<RemarketingRule>) => ({
    id: d?.id ? String(d.id) : undefined,
    nome: String(d?.nome ?? "").trim(),
    ativo: d?.ativo !== false,
    operacao: String(d?.operacao ?? "").trim(),
    channel_id: d?.channel_id ? String(d.channel_id) : null,
    flow_id: String(d?.flow_id ?? ""),
    minutes_before_close: Math.max(1, Math.min(1440, Math.floor(Number(d?.minutes_before_close) || 30))),
    conditions: Array.isArray(d?.conditions) ? d!.conditions! : [],
  }))
  .handler(async ({ context, data }) => {
    if (!data.nome || !data.operacao || !data.flow_id) throw new Error("Nome, operação e fluxo são obrigatórios");
    const db = await dbFor(context);
    if (context?.vendor) {
      const { data: row, error } = await db.rpc("vendor_upsert_remarketing_rule" as any, {
        ...ensureVendorRpcArgs(context),
        _rule_id: data.id ?? null,
        _nome: data.nome,
        _ativo: data.ativo,
        _operacao: data.operacao,
        _channel_id: data.channel_id,
        _flow_id: data.flow_id,
        _minutes_before_close: data.minutes_before_close,
        _conditions: data.conditions,
      });
      if (error) throw new Error(error.message);
      const saved = Array.isArray(row) ? row[0] : row;
      if (!saved?.id) throw new Error("A regra foi enviada, mas o banco não retornou o ID.");
      return { id: saved.id };
    }
    const payload = {
      nome: data.nome,
      ativo: data.ativo,
      operacao: data.operacao,
      channel_id: data.channel_id,
      flow_id: data.flow_id,
      minutes_before_close: data.minutes_before_close,
      conditions: data.conditions,
    };
    if (data.id) {
      const { error } = await db.from("wa_remarketing_rules" as any).update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const rawUserId = (context as any)?.userId ?? null;
    // created_by é uuid — vendedor tem userId "vendor:123", que quebra o insert.
    const createdBy =
      typeof rawUserId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId)
        ? rawUserId
        : null;
    const { data: ins, error } = await db
      .from("wa_remarketing_rules" as any)
      .insert({ ...payload, created_by: createdBy })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return ins;
  });

export const deleteRemarketingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (context?.vendor) {
      const { error } = await db.rpc("vendor_delete_remarketing_rule" as any, {
        ...ensureVendorRpcArgs(context),
        _rule_id: data.id,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await db.from("wa_remarketing_rules" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleRemarketingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; ativo: boolean }) => ({ id: String(d?.id ?? ""), ativo: !!d?.ativo }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    if (context?.vendor) {
      const { error } = await db.rpc("vendor_toggle_remarketing_rule" as any, {
        ...ensureVendorRpcArgs(context),
        _rule_id: data.id,
        _ativo: data.ativo,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await db.from("wa_remarketing_rules" as any).update({ ativo: data.ativo }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRemarketingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rule_id?: string; limit?: number }) => ({
    rule_id: d?.rule_id ? String(d.rule_id) : "",
    limit: Math.max(1, Math.min(200, Math.floor(Number(d?.limit) || 50))),
  }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
    let q = db.from("wa_remarketing_dispatches" as any).select("*").order("fired_at", { ascending: false }).limit(data.limit);
    if (data.rule_id) q = q.eq("rule_id", data.rule_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
