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
  lastInput?: { text?: string | null; buttonId?: string | null; messageType?: string | null };
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

      let finalUrl = url;
      const inner: any = {};
      if (mediaType === "audio") {
        try {
          const { convertAudioToWhatsappVoice } = await import("@/lib/transloadit.server");
          finalUrl = await convertAudioToWhatsappVoice(url);
        } catch (e) {
          console.error("Flow voice conversion failed:", e);
        }
        inner.link = finalUrl;
        inner.voice = true;
      } else {
        inner.link = finalUrl;
        if (mediaType !== "sticker" && caption) inner.caption = caption;
        if (mediaType === "document" && filename) inner.filename = filename;
      }
      const body: any = { type: mediaType, [mediaType]: inner };
      const { waMsgId, phoneNumberId } = await sendWA(ctx.channelId, ctx.contactWaId, body);
      await persistOutMessage(ctx, mediaType, body, waMsgId, phoneNumberId);
      return { log: { url: finalUrl } };
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
      const infinite = !!node.data?.infinite;
      const remarketing = node.data?.remarketing;
      let expiresAt: string | null = null;
      let waitingFor: "message" | "remarketing" = "message";
      if (remarketing?.enabled) {
        const secs = Math.max(1, Number(remarketing.afterSeconds ?? 3600));
        expiresAt = new Date(Date.now() + secs * 1000).toISOString();
        waitingFor = "remarketing";
        ctx.variables.__remarketing = {
          nodeId: node.id,
          text: String(remarketing.text ?? ""),
          sent: false,
          finalTimeoutSeconds: infinite ? null : Number(node.data?.timeoutSeconds ?? 86400),
        };
      } else if (!infinite) {
        const ttl = Math.max(1, Number(node.data?.timeoutSeconds ?? 86400));
        expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
      }
      return { pause: true, waitingFor: waitingFor as any, expiresAt };
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
      const secs = Math.max(1, Math.min(86400, Number(node.data?.seconds ?? 2)));
      if (secs <= 30) {
        await new Promise((r) => setTimeout(r, secs * 1000));
        return {};
      }
      // Long delay: pause the run and let the timer worker resume it.
      return {
        pause: true,
        waitingFor: "timer",
        expiresAt: new Date(Date.now() + secs * 1000).toISOString(),
      };
    }


    case "tag_action": {
      const addIds: string[] = Array.isArray(node.data?.addTags) ? node.data.addTags : [];
      const removeIds: string[] = Array.isArray(node.data?.removeTags) ? node.data.removeTags : [];
      if (addIds.length === 0 && removeIds.length === 0) return { log: { skipped: true } };

      // Resolve tag names from ids
      const allIds = [...new Set([...addIds, ...removeIds])];
      const { data: tagRows } = await supabaseAdmin
        .from("crm_tags" as any).select("id,nome").in("id", allIds);
      const nameById = new Map<string, string>((tagRows ?? []).map((t: any) => [t.id, t.nome]));
      const addNames = addIds.map((id) => nameById.get(id)).filter(Boolean) as string[];
      const removeNames = removeIds.map((id) => nameById.get(id)).filter(Boolean) as string[];

      // Find matching CRM lead by phone (last 10-13 digits)
      const phone = String(ctx.contactWaId ?? "").replace(/\D/g, "");
      if (!phone) return { log: { skipped: "no phone" } };
      const tail = phone.slice(-10);
      const { data: leads } = await supabaseAdmin
        .from("crm_leads" as any).select("id,tags,telefone").ilike("telefone", `%${tail}%`).limit(5);

      for (const l of leads ?? []) {
        const cur: string[] = Array.isArray((l as any).tags) ? (l as any).tags : [];
        const next = new Set(cur);
        for (const n of addNames) next.add(n);
        for (const n of removeNames) next.delete(n);
        await supabaseAdmin.from("crm_leads" as any).update({ tags: Array.from(next) }).eq("id", (l as any).id);
      }
      return { log: { added: addNames, removed: removeNames, leads: leads?.length ?? 0 } };
    }

    case "condition": {
      const op = String(node.data?.operator ?? "text_contains");
      const rawText = ctx.lastInput?.text ?? "";
      const input = rawText.toLowerCase();
      const target = String(node.data?.value ?? "").toLowerCase();
      const msgType = String(ctx.lastInput?.messageType ?? "").toLowerCase();
      let matched = false;

      // Text-based
      if (op === "text_contains" || op === "contains") matched = !!target && input.includes(target);
      else if (op === "text_equals" || op === "equals") matched = input === target;
      else if (op === "text_starts_with" || op === "starts_with") matched = input.startsWith(target);
      else if (op === "text_regex" || op === "regex") {
        try { matched = new RegExp(node.data?.value ?? "", "i").test(rawText); } catch { matched = false; }
      }
      else if (op === "text_word_count_gte") {
        const n = Number(node.data?.value ?? 0);
        const words = rawText.trim().split(/\s+/).filter(Boolean).length;
        matched = words >= n;
      }
      // Media-based (no value needed)
      else if (op === "is_audio") matched = msgType === "audio" || msgType === "voice";
      else if (op === "is_image") matched = msgType === "image";
      else if (op === "is_video") matched = msgType === "video";
      else if (op === "is_document") matched = msgType === "document";
      else if (op === "is_sticker") matched = msgType === "sticker";
      else if (op === "is_location") matched = msgType === "location";
      else if (op === "is_contact") matched = msgType === "contacts" || msgType === "contact";
      else if (op === "is_text") matched = msgType === "text";
      else if (op === "is_button_reply") matched = !!ctx.lastInput?.buttonId;
      else if (op === "button_id_equals") matched = String(ctx.lastInput?.buttonId ?? "") === String(node.data?.value ?? "");

      return { handle: matched ? "true" : "false", log: { matched, op, msgType } };
    }

    case "random": {
      const outs: Array<{ id: string; weight: number }> = Array.isArray(node.data?.outputs) ? node.data.outputs : [];
      const valid = outs.filter((o) => o && typeof o.id === "string");
      if (valid.length === 0) return { handle: "out" };
      const weights = valid.map((o) => Math.max(0, Number(o.weight ?? 0)));
      const total = weights.reduce((a, b) => a + b, 0);
      let pickIdx = 0;
      if (total <= 0) {
        pickIdx = Math.floor(Math.random() * valid.length);
      } else {
        const r = Math.random() * total;
        let acc = 0;
        for (let i = 0; i < valid.length; i++) {
          acc += weights[i];
          if (r <= acc) { pickIdx = i; break; }
        }
      }
      const chosen = valid[pickIdx];
      return { handle: chosen.id, log: { chosen: chosen.id, weight: weights[pickIdx], total } };
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
  const nodes: Node[] = (flow.nodes as Node[]) ?? [];
  const edges: Edge[] = (flow.edges as Edge[]) ?? [];
  if (nodes.length === 0) throw new Error("Fluxo sem nós");

  // Pick a sensible starting node:
  // 1) entry_node_id if set (typically the trigger node)
  // 2) otherwise the first trigger node
  // 3) otherwise the first node with no incoming edges
  // 4) otherwise the first node
  let entryId: string | null = flow.entry_node_id ?? null;
  if (!entryId) entryId = nodes.find((n) => n.type === "trigger")?.id ?? null;
  if (!entryId) {
    const targets = new Set(edges.map((e) => e.target));
    entryId = nodes.find((n) => !targets.has(n.id))?.id ?? nodes[0].id;
  }

  const entryNode = nodes.find((n) => n.id === entryId);
  // If the entry is a trigger node, skip to its next; otherwise start at the entry itself.
  const startId =
    entryNode?.type === "trigger" ? nextNodeId(edges, entryId!) : entryId;

  const { data: run, error } = await supabaseAdmin
    .from("wa_flow_runs" as any)
    .insert({
      flow_id: args.flowId,
      conversation_id: args.conversationId,
      channel_id: args.channelId,
      contact_wa_id: args.contactWaId,
      current_node_id: startId ?? entryId,
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

  if (!startId) {
    await supabaseAdmin.from("wa_flow_runs" as any).update({ status: "completed" }).eq("id", ctx.runId);
    return { runId: ctx.runId, completed: true, reason: "no_next_node" };
  }
  await executeFrom(ctx, startId);
  return { runId: ctx.runId };
}

export async function advanceWaitingRun(args: {
  conversationId: string;
  input: { text?: string | null; buttonId?: string | null; messageType?: string | null };
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
  messageType?: string | null;
  isFirstMessage: boolean;
}) {
  // 1. Advance a waiting run if any
  const advanced = await advanceWaitingRun({
    conversationId: args.conversationId,
    input: { text: args.text, buttonId: args.buttonId, messageType: args.messageType ?? null },
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

// Dispatch flows tied to "new_lead" trigger when a CRM lead is inserted.
export async function dispatchNewLead(args: { leadId: string }) {
  const { data: lead } = await supabaseAdmin
    .from("crm_leads" as any).select("*").eq("id", args.leadId).maybeSingle();
  if (!lead) return { matched: 0, reason: "lead not found" };
  const l: any = lead;
  const phoneDigits = String(l.telefone ?? "").replace(/\D/g, "");
  if (!phoneDigits) return { matched: 0, reason: "no phone" };

  const { data: triggers } = await supabaseAdmin
    .from("wa_flow_triggers" as any)
    .select("*, wa_flows!inner(id, ativo, entry_node_id, operacao_id)")
    .eq("ativo", true)
    .eq("tipo", "new_lead");

  let started = 0;
  for (const trg of (triggers ?? []) as any[]) {
    if (!trg.wa_flows?.ativo) continue;
    // Optional operacao match
    const flowOp = trg.wa_flows?.operacao_id;
    if (flowOp && l.expert && String(flowOp) !== String(l.expert) && String(flowOp) !== String(l.operacao_id ?? "")) continue;
    if (!trg.channel_id) continue; // requires a channel selected on the trigger
    await runFlowAdmin({
      flowId: trg.flow_id,
      channelId: trg.channel_id,
      contactWaId: phoneDigits,
      conversationId: null,
      triggerContext: { tipo: "new_lead", lead: { id: l.id, nome: l.nome, telefone: l.telefone, email: l.email } },
    });
    started++;
  }
  return { matched: started };
}
