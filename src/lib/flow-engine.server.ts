// Server-only flow engine. Safe to import from server routes/functions.
// Never import this from client modules.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EVOHUB_BASE = "https://app.evohub.evolutionfoundation.com.br";

type Ctx = {
  runId: string;
  flowId: string;
  channelId: string;
  contactWaId: string;
  conversationId: string | null;
  variables: Record<string, any>;
  lastInput?: { text?: string | null; buttonId?: string | null };
};

type Node = { id: string; type: string; data: any };
type Edge = { id: string; source: string; target: string; sourceHandle?: string | null };

function interpolate(tpl: string, ctx: Ctx): string {
  if (!tpl) return tpl;
  return tpl
    .replace(/\{\{\s*contato\.telefone\s*\}\}/g, ctx.contactWaId)
    .replace(/\{\{\s*var\.([\w-]+)\s*\}\}/g, (_, k) => String(ctx.variables?.[k] ?? ""))
    .replace(/\{\{\s*input\.texto\s*\}\}/g, ctx.lastInput?.text ?? "");
}

async function fetchChannelToken(channelId: string): Promise<{ token: string; phoneNumberId: string }> {
  const res = await fetch(`${EVOHUB_BASE}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${process.env.EVOHUB_API_KEY}` },
  });
  if (!res.ok) throw new Error(`EvoHub HTTP ${res.status}`);
  const body = await res.json();
  const list: any[] = Array.isArray(body) ? body : body?.data ?? body?.channels ?? [];
  const ch = list.find((c) => c.id === channelId);
  if (!ch) throw new Error(`Canal ${channelId} não encontrado no EvoHub`);
  const phoneNumberId = ch?.metadata?.meta_connection?.phone_number_id;
  if (!phoneNumberId) throw new Error("Canal sem phone_number_id");
  return { token: ch.token, phoneNumberId };
}

async function sendWA(channelId: string, to: string, body: any) {
  const { token, phoneNumberId } = await fetchChannelToken(channelId);
  const res = await fetch(`${EVOHUB_BASE}/meta/v23.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...body }),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return { waMsgId: json?.messages?.[0]?.id ?? null, phoneNumberId };
}

async function persistOutMessage(ctx: Ctx, type: string, body: any, waMsgId: string | null, phoneNumberId: string) {
  if (!ctx.conversationId) return;
  await supabaseAdmin.from("wa_messages" as any).insert({
    conversation_id: ctx.conversationId,
    channel_id: ctx.channelId,
    wa_message_id: waMsgId,
    direction: "out",
    msg_type: type,
    text_body: body?.text?.body ?? null,
    media_url: body?.image?.link ?? body?.video?.link ?? body?.audio?.link ?? body?.document?.link ?? null,
    media_filename: body?.document?.filename ?? null,
    caption: body?.image?.caption ?? body?.video?.caption ?? body?.document?.caption ?? null,
    from_wa_id: phoneNumberId,
    to_wa_id: ctx.contactWaId,
    status: "sent",
    raw: body,
  });
  await supabaseAdmin.from("wa_conversations" as any).update({
    last_message_at: new Date().toISOString(),
    last_message_preview: type === "text" ? (body?.text?.body ?? "").slice(0, 120) : `[${type}]`,
    last_message_direction: "out",
  }).eq("id", ctx.conversationId);
}

async function logExecution(runId: string, node: Node, status: string, output?: any, error?: string, started?: number) {
  await supabaseAdmin.from("wa_flow_executions" as any).insert({
    run_id: runId,
    node_id: node.id,
    node_type: node.type,
    status,
    output: output ?? null,
    error: error ?? null,
    duration_ms: started ? Date.now() - started : null,
  });
}

function nextNodeId(edges: Edge[], fromNodeId: string, handle?: string | null): string | null {
  const edge = edges.find((e) =>
    e.source === fromNodeId &&
    (handle === undefined || handle === null
      ? !e.sourceHandle || e.sourceHandle === "out" || e.sourceHandle === null
      : e.sourceHandle === handle)
  );
  return edge?.target ?? null;
}

async function loadFlow(flowId: string) {
  const { data, error } = await supabaseAdmin
    .from("wa_flows" as any)
    .select("*")
    .eq("id", flowId)
    .single();
  if (error || !data) throw new Error(`Flow ${flowId} não encontrado`);
  return data as any;
}

async function executeFrom(ctx: Ctx, startNodeId: string) {
  const flow = await loadFlow(ctx.flowId);
  const nodes: Node[] = (flow.nodes as Node[]) ?? [];
  const edges: Edge[] = (flow.edges as Edge[]) ?? [];

  let currentId: string | null = startNodeId;
  let safety = 0;

  while (currentId && safety++ < 50) {
    const node = nodes.find((n) => n.id === currentId);
    if (!node) break;
    const started = Date.now();

    try {
      const result = await runNode(node, ctx);

      // Update run pointer
      await supabaseAdmin.from("wa_flow_runs" as any).update({
        current_node_id: node.id,
        context: ctx.variables,
        status: result.pause ? "waiting" : "running",
        waiting_for: result.waitingFor ?? null,
        expires_at: result.expiresAt ?? null,
      }).eq("id", ctx.runId);

      await logExecution(ctx.runId, node, "ok", result.log ?? null, undefined, started);

      if (result.pause) return;
      if (result.end) {
        await supabaseAdmin.from("wa_flow_runs" as any).update({
          status: "completed", waiting_for: null,
        }).eq("id", ctx.runId);
        return;
      }
      currentId = nextNodeId(edges, node.id, result.handle);
    } catch (e: any) {
      await logExecution(ctx.runId, node, "error", null, String(e?.message ?? e), started);
      await supabaseAdmin.from("wa_flow_runs" as any).update({
        status: "failed", error: String(e?.message ?? e),
      }).eq("id", ctx.runId);
      return;
    }
  }

  if (!currentId) {
    await supabaseAdmin.from("wa_flow_runs" as any).update({
      status: "completed", waiting_for: null,
    }).eq("id", ctx.runId);
  }
}

type NodeResult = {
  pause?: boolean;
  waitingFor?: "message" | "button" | "timer" | null;
  expiresAt?: string | null;
  end?: boolean;
  handle?: string | null;
  log?: any;
};

async function runNode(node: Node, ctx: Ctx): Promise<NodeResult> {
  switch (node.type) {
    case "trigger":
      return {};

    case "send_text": {
      const text = interpolate(String(node.data?.text ?? ""), ctx);
      if (!text) return {};
      const body = { type: "text", text: { body: text } };
      const { waMsgId, phoneNumberId } = await sendWA(ctx.channelId, ctx.contactWaId, body);
      await persistOutMessage(ctx, "text", body, waMsgId, phoneNumberId);
      return { log: { text } };
    }

    case "send_image":
    case "send_video":
    case "send_audio":
    case "send_document": {
      const url = String(node.data?.mediaUrl ?? "");
      if (!url) throw new Error("URL de mídia ausente");
      const mediaType = node.type.replace("send_", "");
      const caption = node.data?.caption ? interpolate(String(node.data.caption), ctx) : undefined;
      const filename = node.data?.filename || undefined;
      const inner: any = { link: url };
      if (mediaType !== "audio" && mediaType !== "sticker" && caption) inner.caption = caption;
      if (mediaType === "document" && filename) inner.filename = filename;
      const body: any = { type: mediaType, [mediaType]: inner };
      const { waMsgId, phoneNumberId } = await sendWA(ctx.channelId, ctx.contactWaId, body);
      await persistOutMessage(ctx, mediaType, body, waMsgId, phoneNumberId);
      return { log: { url } };
    }

    case "send_buttons": {
      const text = interpolate(String(node.data?.text ?? ""), ctx);
      const buttons: Array<{ id: string; label: string }> = (node.data?.buttons ?? []).slice(0, 3);
      if (!text || buttons.length === 0) throw new Error("Texto e pelo menos 1 botão obrigatórios");
      const body = {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text },
          action: {
            buttons: buttons.map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.label.slice(0, 20) },
            })),
          },
        },
      };
      const { waMsgId, phoneNumberId } = await sendWA(ctx.channelId, ctx.contactWaId, body);
      await persistOutMessage(ctx, "interactive", body, waMsgId, phoneNumberId);
      // After sending, automatically pause to wait for button reply.
      const ttl = Number(node.data?.timeoutSeconds ?? 86400);
      return {
        pause: true,
        waitingFor: "button",
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      };
    }

    case "wait_message": {
      const ttl = Number(node.data?.timeoutSeconds ?? 86400);
      return {
        pause: true,
        waitingFor: "message",
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      };
    }

    case "wait_button": {
      const ttl = Number(node.data?.timeoutSeconds ?? 86400);
      return {
        pause: true,
        waitingFor: "button",
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      };
    }

    case "delay": {
      const secs = Math.min(30, Number(node.data?.seconds ?? 2));
      await new Promise((r) => setTimeout(r, secs * 1000));
      return {};
    }

    case "condition": {
      const op = String(node.data?.operator ?? "contains");
      const target = String(node.data?.value ?? "").toLowerCase();
      const input = (ctx.lastInput?.text ?? "").toLowerCase();
      let matched = false;
      if (op === "contains") matched = input.includes(target);
      else if (op === "equals") matched = input === target;
      else if (op === "starts_with") matched = input.startsWith(target);
      else if (op === "regex") {
        try { matched = new RegExp(node.data?.value ?? "", "i").test(ctx.lastInput?.text ?? ""); } catch { matched = false; }
      }
      return { handle: matched ? "true" : "false", log: { matched } };
    }

    case "end":
      return { end: true };

    default:
      throw new Error(`Tipo de nó desconhecido: ${node.type}`);
  }
}

// ============================================================
// Public entry points (called by webhook)
// ============================================================

export async function runFlowAdmin(args: {
  flowId: string;
  channelId: string;
  contactWaId: string;
  conversationId: string | null;
  triggerContext?: any;
}) {
  const flow = await loadFlow(args.flowId);
  if (!flow.entry_node_id) throw new Error("Fluxo sem nó inicial");

  const { data: run, error } = await supabaseAdmin
    .from("wa_flow_runs" as any)
    .insert({
      flow_id: args.flowId,
      conversation_id: args.conversationId,
      channel_id: args.channelId,
      contact_wa_id: args.contactWaId,
      current_node_id: flow.entry_node_id,
      status: "running",
      context: { trigger: args.triggerContext ?? {} },
    })
    .select("id")
    .single();
  if (error || !run) throw new Error(error?.message ?? "Não foi possível criar a execução");

  const ctx: Ctx = {
    runId: (run as any).id,
    flowId: args.flowId,
    channelId: args.channelId,
    contactWaId: args.contactWaId,
    conversationId: args.conversationId,
    variables: { trigger: args.triggerContext ?? {} },
  };

  // Skip the trigger node and move to its next
  const edges: Edge[] = (flow.edges as Edge[]) ?? [];
  const next = nextNodeId(edges, flow.entry_node_id);
  if (!next) {
    await supabaseAdmin.from("wa_flow_runs" as any).update({ status: "completed" }).eq("id", ctx.runId);
    return { runId: ctx.runId, completed: true };
  }
  await executeFrom(ctx, next);
  return { runId: ctx.runId };
}

export async function advanceWaitingRun(args: {
  conversationId: string;
  input: { text?: string | null; buttonId?: string | null };
}) {
  // Find a waiting run for this conversation
  const { data: run } = await supabaseAdmin
    .from("wa_flow_runs" as any)
    .select("*")
    .eq("conversation_id", args.conversationId)
    .eq("status", "waiting")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;

  const r = run as any;
  const flow = await loadFlow(r.flow_id);
  const edges: Edge[] = (flow.edges as Edge[]) ?? [];

  const ctx: Ctx = {
    runId: r.id,
    flowId: r.flow_id,
    channelId: r.channel_id,
    contactWaId: r.contact_wa_id,
    conversationId: r.conversation_id,
    variables: r.context ?? {},
    lastInput: args.input,
  };

  // Choose next node based on what we were waiting for
  let nextId: string | null = null;
  if (r.waiting_for === "button" && args.input.buttonId) {
    nextId = nextNodeId(edges, r.current_node_id, args.input.buttonId);
    if (!nextId) nextId = nextNodeId(edges, r.current_node_id); // fallback default out
  } else {
    nextId = nextNodeId(edges, r.current_node_id);
  }

  if (!nextId) {
    await supabaseAdmin.from("wa_flow_runs" as any).update({
      status: "completed", waiting_for: null,
    }).eq("id", r.id);
    return { runId: r.id, completed: true };
  }

  await supabaseAdmin.from("wa_flow_runs" as any).update({
    status: "running", waiting_for: null,
  }).eq("id", r.id);
  await executeFrom(ctx, nextId);
  return { runId: r.id };
}

// Called by webhook for every incoming message
export async function dispatchIncomingForFlows(args: {
  conversationId: string;
  channelId: string;
  contactWaId: string;
  text: string | null;
  buttonId: string | null;
  isFirstMessage: boolean;
}) {
  // 1. Advance a waiting run if any
  const advanced = await advanceWaitingRun({
    conversationId: args.conversationId,
    input: { text: args.text, buttonId: args.buttonId },
  });
  if (advanced) return advanced;

  // 2. Look up active triggers
  const { data: triggers } = await supabaseAdmin
    .from("wa_flow_triggers" as any)
    .select("*, wa_flows!inner(id, ativo, entry_node_id)")
    .eq("ativo", true);

  const t = (triggers ?? []) as any[];
  const text = (args.text ?? "").toLowerCase();

  for (const trg of t) {
    if (!trg.wa_flows?.ativo) continue;
    if (trg.channel_id && trg.channel_id !== args.channelId) continue;

    let match = false;
    if (trg.tipo === "any_message") match = true;
    else if (trg.tipo === "new_conversation") match = args.isFirstMessage;
    else if (trg.tipo === "keyword") {
      const v = String(trg.valor ?? "").toLowerCase();
      if (!v) continue;
      if (trg.match_mode === "equals") match = text === v;
      else if (trg.match_mode === "starts_with") match = text.startsWith(v);
      else if (trg.match_mode === "regex") {
        try { match = new RegExp(trg.valor, "i").test(args.text ?? ""); } catch { match = false; }
      } else match = text.includes(v);
    }

    if (match) {
      return runFlowAdmin({
        flowId: trg.flow_id,
        channelId: args.channelId,
        contactWaId: args.contactWaId,
        conversationId: args.conversationId,
        triggerContext: { tipo: trg.tipo, valor: trg.valor, input: args.text },
      });
    }
  }

  return null;
}
