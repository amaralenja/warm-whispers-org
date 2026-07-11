import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function dbFor(context: any) {
  if (context?.vendor && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
  }
  return context.supabase as any;
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
    let q = db.from("wa_remarketing_rules" as any).select("*").order("created_at", { ascending: false });
    if (data.operacao) q = q.eq("operacao", data.operacao);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as RemarketingRule[];
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
    const userId = (context as any)?.userId ?? null;
    const { data: ins, error } = await db
      .from("wa_remarketing_rules" as any)
      .insert({ ...payload, created_by: userId })
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
    const { error } = await db.from("wa_remarketing_rules" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleRemarketingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; ativo: boolean }) => ({ id: String(d?.id ?? ""), ativo: !!d?.ativo }))
  .handler(async ({ context, data }) => {
    const db = await dbFor(context);
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
