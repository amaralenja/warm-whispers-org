import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// Types
// ============================================================

export type FlowNodeType =
  | "trigger"
  | "send_text"
  | "send_image"
  | "send_video"
  | "send_audio"
  | "send_document"
  | "send_buttons"
  | "wait_message"
  | "wait_button"
  | "delay"
  | "condition"
  | "end";

export type FlowNode = {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: any;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

// ============================================================
// CRUD
// ============================================================

export const listFlows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wa_flows" as any)
      .select("*, wa_flow_triggers(*)")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getFlow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const { data: flow, error } = await context.supabase
      .from("wa_flows" as any)
      .select("*, wa_flow_triggers(*)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return flow;
  });

export const createFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string; operacao_id?: string | null }) => ({
    nome: String(d?.nome ?? "Novo Fluxo"),
    operacao_id: d?.operacao_id ?? null,
  }))
  .handler(async ({ context, data }) => {
    const startId = "n-trigger";
    const { data: row, error } = await context.supabase
      .from("wa_flows" as any)
      .insert({
        nome: data.nome,
        operacao_id: data.operacao_id,
        ativo: true,
        entry_node_id: startId,
        nodes: [
          {
            id: startId,
            type: "trigger",
            position: { x: 100, y: 100 },
            data: { label: "Início" },
          },
        ],
        edges: [],
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    nome?: string;
    operacao_id?: string | null;
    ativo?: boolean;
    entry_node_id?: string | null;
    nodes?: FlowNode[];
    edges?: FlowEdge[];
  }) => d)
  .handler(async ({ context, data }) => {
    const patch: any = {};
    for (const k of ["nome", "operacao_id", "ativo", "entry_node_id", "nodes", "edges"]) {
      if ((data as any)[k] !== undefined) patch[k] = (data as any)[k];
    }
    const { error } = await context.supabase
      .from("wa_flows" as any)
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("wa_flows" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Triggers
// ============================================================

export const saveTriggers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { flow_id: string; triggers: Array<{ tipo: string; valor?: string; match_mode?: string; channel_id?: string | null; ativo?: boolean }> }) => d)
  .handler(async ({ context, data }) => {
    await context.supabase.from("wa_flow_triggers" as any).delete().eq("flow_id", data.flow_id);
    if (data.triggers.length === 0) return { ok: true };
    const rows = data.triggers.map((t) => ({
      flow_id: data.flow_id,
      tipo: t.tipo,
      valor: t.valor ?? null,
      match_mode: t.match_mode ?? "contains",
      channel_id: t.channel_id ?? null,
      ativo: t.ativo ?? true,
    }));
    const { error } = await context.supabase.from("wa_flow_triggers" as any).insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Engine
// ============================================================

// Run a flow against a specific contact via webhook (admin)
export const triggerFlowManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { flow_id: string; channel_id: string; contact_wa_id: string; conversation_id?: string }) => d)
  .handler(async ({ data }) => {
    const { runFlowAdmin } = await import("@/lib/flow-engine.server");
    return runFlowAdmin({
      flowId: data.flow_id,
      channelId: data.channel_id,
      contactWaId: data.contact_wa_id,
      conversationId: data.conversation_id ?? null,
      triggerContext: { manual: true },
    });
  });

export const fireNewLeadTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lead_id: string }) => ({ lead_id: String(d?.lead_id ?? "") }))
  .handler(async ({ data }) => {
    if (!data.lead_id) return { matched: 0 };
    const { dispatchNewLead } = await import("@/lib/flow-engine.server");
    return dispatchNewLead({ leadId: data.lead_id });
  });
