// Server-only flow engine. Safe to import from server routes/functions.
// Never import this from client modules.

const EVOHUB_BASE = "https://api.evohub.ai";
const API_TIMEOUT_MS = 15_000;

type Ctx = {
  runId: string;
  flowId: string;
  channelId: string;
  contactWaId: string;
  conversationId: string | null;
  db: any;
  variables: Record<string, any>;
  lastInput?: { text?: string | null; buttonId?: string | null; messageType?: string | null };
  vendor?: VendorRunContext | null;
};

type Node = { id: string; type: string; data: any };
type Edge = { id: string; source: string; target: string; sourceHandle?: string | null };
type VendorRunContext = { id: number; codigo: string };

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function vendorRpcArgs(vendor?: VendorRunContext | null) {
  const id = Number(vendor?.id);
  const codigo = String(vendor?.codigo ?? "").trim();
  return Number.isFinite(id) && id > 0 && codigo ? { _vendor_id: id, _codigo: codigo } : null;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("EvoHub demorou demais para responder");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBrWhatsappNumber(raw: string): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8) return `55${ddd}9${rest}`;
  }
  return digits;
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

async function resolveStageFromTags(db: any, tags: string[], operation?: unknown) {
  const tagNames = [...new Set(tags.map((t) => String(t ?? "").trim()).filter(Boolean))];
  if (tagNames.length === 0) return null;
  const { data: tagRows } = await db
    .from("crm_tags" as any)
    .select("nome,stage_id,operacao")
    .in("nome", tagNames);
  const rows = ((tagRows ?? []) as any[]).filter((r) => r?.stage_id);
  if (rows.length === 0) return null;
  const op = String(operation ?? "").trim();
  const match = op
    ? rows.find((r) => sameWorkspace(r?.operacao, op) || sameWorkspace(r?.operacao, "all")) ?? rows[0]
    : rows[0];
  return match?.stage_id ? String(match.stage_id) : null;
}

function interpolate(tpl: string, ctx: Ctx): string {
  if (!tpl) return tpl;
  return tpl
    .replace(/\{\{\s*contato\.telefone\s*\}\}/g, ctx.contactWaId)
    .replace(/\{\{\s*var\.([\w-]+)\s*\}\}/g, (_, k) => String(ctx.variables?.[k] ?? ""))
    .replace(/\{\{\s*input\.texto\s*\}\}/g, ctx.lastInput?.text ?? "");
}

async function fetchChannelToken(channelId: string, db: any): Promise<{ token: string; phoneNumberId: string }> {
  // 1) Prefer SECURITY DEFINER RPC — funciona mesmo sem service role (bypassa RLS).
  let local: any = null;
  try {
    const { data: rpcRows } = await db.rpc("load_wa_channel_credentials" as any, { _channel_id: String(channelId) });
    local = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  } catch {}

  if (!local) {
    const { data: localRow } = await db
      .from("wa_channels" as any)
      .select("id,token,phone_number_id,metadata")
      .eq("id", channelId)
      .maybeSingle();
    local = localRow as any;
  }

  const localToken = local?.token ? String(local.token) : "";
  const localPhoneNumberId = local?.phone_number_id
    ? String(local.phone_number_id)
    : local?.metadata?.meta_connection?.phone_number_id
      ? String(local.metadata.meta_connection.phone_number_id)
      : "";
  if (localToken && localPhoneNumberId) {
    return { token: localToken, phoneNumberId: localPhoneNumberId };
  }

  const res = await fetchWithTimeout(`${EVOHUB_BASE}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${process.env.EVOHUB_API_KEY}` },
  });
  if (!res.ok) throw new Error(`EvoHub HTTP ${res.status}`);
  const body = await res.json();
  const list: any[] = Array.isArray(body) ? body : body?.data ?? body?.channels ?? [];
  const ch = list.find((c) => c.id === channelId);
  if (!ch) throw new Error(`Canal ${channelId} não encontrado no EvoHub`);
  const phoneNumberId = ch?.metadata?.meta_connection?.phone_number_id ?? ch?.meta_connection?.phone_number_id ?? ch?.phone_number_id;
  if (!phoneNumberId) throw new Error("Canal sem phone_number_id");
  return { token: ch.token, phoneNumberId };
}

async function postMetaMessage(token: string, phoneNumberId: string, payload: any) {
  const res = await fetchWithTimeout(`${EVOHUB_BASE}/meta/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

async function persistWorkingToken(db: any, phoneNumberId: string, token: string, channelId?: string) {
  if (!db || !phoneNumberId || !token) return;
  try {
    // Persist on every local channel that shares this phone_number_id so future
    // sends use the verified token straight away (no probing).
    await db.from("wa_channels" as any).update({ token, synced_at: new Date().toISOString() })
      .eq("phone_number_id", phoneNumberId);
    if (channelId) {
      await db.from("wa_channels" as any).update({ token, synced_at: new Date().toISOString() })
        .eq("id", channelId);
    }
  } catch (e) {
    console.warn("[flow-engine] persistWorkingToken failed", e);
  }
}

async function findUsableMetaToken(phoneNumberId: string, preferredToken: string): Promise<string> {
  const res = await fetchWithTimeout(`${EVOHUB_BASE}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${process.env.EVOHUB_API_KEY}` },
  }).catch(() => null);
  if (!res || !res.ok) return preferredToken;
  const body = await res.json().catch(() => null);
  const list: any[] = Array.isArray(body) ? body : body?.data ?? body?.channels ?? [];
  for (const row of list) {
    const token = row?.token ? String(row.token) : "";
    if (!token || token === preferredToken) continue;
    const probe = await fetchWithTimeout(`${EVOHUB_BASE}/meta/${phoneNumberId}?fields=id`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (probe?.ok) return token;
  }
  return preferredToken;
}

export async function sendWA(channelId: string, to: string, body: any, db: any) {
  const { token, phoneNumberId } = await fetchChannelToken(channelId, db);
  const toNormalized = normalizeBrWhatsappNumber(to);
  const payload = { messaging_product: "whatsapp", to: toNormalized, ...body };

  let attempt = await postMetaMessage(token, phoneNumberId, payload);
  let workingToken = token;
  if (!attempt.ok) {
    const msg = attempt.json?.error?.message ?? attempt.json?.message ?? `HTTP ${attempt.status}`;
    const msgStr = typeof msg === "string" ? msg : JSON.stringify(msg);
    const canRetry = /INTERNAL|Meta token|Unsupported|OAuth|missing permissions|\b(400|401|500)\b/i.test(msgStr);
    if (canRetry) {
      const altToken = await findUsableMetaToken(phoneNumberId, token);
      if (altToken && altToken !== token) {
        attempt = await postMetaMessage(altToken, phoneNumberId, payload);
        if (attempt.ok) {
          workingToken = altToken;
          // Cacheia pra sempre: próximas mensagens já partem desse token.
          await persistWorkingToken(db, phoneNumberId, altToken, channelId);
        }
      }
    }
    if (!attempt.ok) throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  void workingToken;
  return { waMsgId: attempt.json?.messages?.[0]?.id ?? null, phoneNumberId, toNormalized };
}

// Monotonic counter so consecutive flow inserts always have strictly increasing created_at,
// even when the engine fires fast back-to-back messages.
let __flowMsgSeq = 0;
let __flowMsgLastMs = 0;
function nextFlowCreatedAt(): string {
  const now = Date.now();
  if (now <= __flowMsgLastMs) {
    __flowMsgSeq += 1;
  } else {
    __flowMsgLastMs = now;
    __flowMsgSeq = 0;
  }
  // Add seq ms to ensure strict ordering across rapid inserts.
  return new Date(__flowMsgLastMs + __flowMsgSeq).toISOString();
}

async function persistOutMessage(ctx: Ctx, type: string, body: any, waMsgId: string | null, phoneNumberId: string, toWaId?: string) {
  if (!ctx.conversationId) return;
  const textBody = body?.text?.body ?? body?.interactive?.body?.text ?? null;
  const mediaUrl = body?.image?.link ?? body?.video?.link ?? body?.audio?.link ?? body?.document?.link ?? null;
  const mediaFilename = body?.document?.filename ?? null;
  const caption = body?.image?.caption ?? body?.video?.caption ?? body?.document?.caption ?? null;
  const toNormalized = toWaId ?? normalizeBrWhatsappNumber(ctx.contactWaId);
  const preview = type === "text" ? String(textBody ?? "").slice(0, 120) : `[${type}]`;

  const rpcArgs = vendorRpcArgs(ctx.vendor);
  if (rpcArgs) {
    const { error } = await ctx.db.rpc("vendor_insert_wa_message" as any, {
      ...rpcArgs,
      _conversation_id: ctx.conversationId,
      _channel_id: ctx.channelId,
      _wa_message_id: waMsgId,
      _direction: "out",
      _msg_type: type,
      _text_body: textBody,
      _media_url: mediaUrl,
      _media_filename: mediaFilename,
      _caption: caption,
      _from_wa_id: phoneNumberId,
      _to_wa_id: toNormalized,
      _status: "sent",
      _raw: body,
    });
    if (error) throw new Error(error.message);
    await ctx.db.rpc("vendor_touch_wa_conversation" as any, {
      ...rpcArgs,
      _conversation_id: ctx.conversationId,
      _preview: preview,
      _direction: "out",
    });
    return;
  }

  const createdAt = nextFlowCreatedAt();
  await ctx.db.from("wa_messages" as any).insert({
    conversation_id: ctx.conversationId,
    channel_id: ctx.channelId,
    wa_message_id: waMsgId,
    direction: "out",
    msg_type: type,
    text_body: textBody,
    media_url: mediaUrl,
    media_filename: mediaFilename,
    caption,
    from_wa_id: phoneNumberId,
    to_wa_id: toNormalized,
    status: "sent",
    raw: body,
    created_at: createdAt,
  });
  await ctx.db.from("wa_conversations" as any).update({
    last_message_at: createdAt,
    last_message_preview: preview,
    last_message_direction: "out",
  }).eq("id", ctx.conversationId);
}


async function logExecution(db: any, runId: string, node: Node, status: string, output?: any, error?: string, started?: number, vendor?: VendorRunContext | null) {
  const rpcArgs = vendorRpcArgs(vendor);
  if (rpcArgs) {
    const { error: rpcError } = await db.rpc("vendor_insert_wa_flow_execution" as any, {
      ...rpcArgs,
      _run_id: runId,
      _node_id: node.id,
      _node_type: node.type,
      _status: status,
      _output: output ?? null,
      _error: error ?? null,
      _duration_ms: started ? Date.now() - started : null,
    });
    if (rpcError) throw new Error(rpcError.message);
    return;
  }
  await db.from("wa_flow_executions" as any).insert({
    run_id: runId,
    node_id: node.id,
    node_type: node.type,
    status,
    output: output ?? null,
    error: error ?? null,
    duration_ms: started ? Date.now() - started : null,
  });
}

async function createFlowRun(db: any, args: {
  flowId: string;
  conversationId: string | null;
  channelId: string;
  contactWaId: string;
  currentNodeId: string | null;
  triggerContext?: any;
  vendor?: VendorRunContext | null;
}) {
  const rpcArgs = vendorRpcArgs(args.vendor);
  if (rpcArgs) {
    const { data, error } = await db.rpc("vendor_create_wa_flow_run" as any, {
      ...rpcArgs,
      _flow_id: args.flowId,
      _conversation_id: args.conversationId,
      _channel_id: args.channelId,
      _contact_wa_id: args.contactWaId,
      _current_node_id: args.currentNodeId,
      _context: { trigger: args.triggerContext ?? {} },
    });
    const run = Array.isArray(data) ? data[0] : data;
    if (error || !run) throw new Error(error?.message ?? "Não foi possível criar a execução");
    return run as any;
  }

  const { data: run, error } = await db
    .from("wa_flow_runs" as any)
    .insert({
      flow_id: args.flowId,
      conversation_id: args.conversationId,
      channel_id: args.channelId,
      contact_wa_id: args.contactWaId,
      current_node_id: args.currentNodeId,
      status: "running",
      context: { trigger: args.triggerContext ?? {} },
    })
    .select("id")
    .single();
  if (error || !run) throw new Error(error?.message ?? "Não foi possível criar a execução");
  return run as any;
}

async function updateFlowRun(ctx: Ctx, patch: Record<string, any>) {
  const rpcArgs = vendorRpcArgs(ctx.vendor);
  if (rpcArgs) {
    const { data, error } = await ctx.db.rpc("vendor_update_wa_flow_run" as any, {
      ...rpcArgs,
      _run_id: ctx.runId,
      _patch: patch,
    });
    if (error) throw new Error(error.message);
    if (data === false) {
      if (await isFlowRunCancelled(ctx)) return;
      throw new Error("Execução não encontrada");
    }
    return;
  }
  const { data, error } = await ctx.db.rpc("update_wa_flow_run" as any, {
    _run_id: ctx.runId,
    _patch: patch,
  });
  if (error) throw new Error(error.message);
  if (data === false) {
    if (await isFlowRunCancelled(ctx)) return;
    throw new Error("Execução não encontrada");
  }
}

async function isFlowRunCancelled(ctx: Ctx): Promise<boolean> {
  const { data } = await ctx.db
    .from("wa_flow_runs" as any)
    .select("status")
    .eq("id", ctx.runId)
    .maybeSingle();
  return String((data as any)?.status ?? "") === "cancelled";
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

async function loadFlow(flowId: string, db: any) {
  // Prefer SECURITY DEFINER RPC to bypass RLS in vendor sessions
  try {
    const { data: rpcRows } = await db.rpc("load_wa_flow", { _flow_id: flowId });
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (row) return row as any;
  } catch {}
  let { data, error } = await db
    .from("wa_flows" as any)
    .select("*")
    .eq("id", flowId)
    .maybeSingle();
  if (!data) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await supabaseAdmin
        .from("wa_flows" as any)
        .select("*")
        .eq("id", flowId)
        .maybeSingle();
      data = res.data;
      error = res.error;
    } catch {}
  }
  if (error || !data) throw new Error(`Flow ${flowId} não encontrado`);
  return data as any;
}



async function executeFrom(ctx: Ctx, startNodeId: string) {
  const flow = await loadFlow(ctx.flowId, ctx.db);
  const nodes: Node[] = (flow.nodes as Node[]) ?? [];
  const edges: Edge[] = (flow.edges as Edge[]) ?? [];

  let currentId: string | null = startNodeId;
  let safety = 0;

  while (currentId && safety++ < 50) {
    if (await isFlowRunCancelled(ctx)) return;
    const node = nodes.find((n) => n.id === currentId);
    if (!node) {
      // Node não existe mais (fluxo editado). Não deixa o run preso em "running".
      await updateFlowRun(ctx, { status: "completed", waiting_for: null, expires_at: null });
      await logExecution(ctx.db, ctx.runId, { id: currentId, type: "missing", data: {} } as any, "error", null, `node ${currentId} não encontrado no fluxo`, Date.now(), ctx.vendor);
      return;
    }
    const started = Date.now();

    try {
      const result = await runNode(node, ctx);
      if (await isFlowRunCancelled(ctx)) return;

      // Update run pointer
      await updateFlowRun(ctx, {
        current_node_id: node.id,
        context: ctx.variables,
        status: result.pause ? "waiting" : "running",
        waiting_for: result.waitingFor ?? null,
        expires_at: result.expiresAt ?? null,
      });

      await logExecution(ctx.db, ctx.runId, node, "ok", result.log ?? null, undefined, started, ctx.vendor);

      if (result.pause) return;
      if (result.end) {
        await updateFlowRun(ctx, {
          status: "completed", waiting_for: null,
        });
        return;
      }
      currentId = nextNodeId(edges, node.id, result.handle);
    } catch (e: any) {
      await logExecution(ctx.db, ctx.runId, node, "error", null, String(e?.message ?? e), started, ctx.vendor);
      await updateFlowRun(ctx, {
        status: "failed", error: String(e?.message ?? e),
      });
      return;
    }
  }

  if (!currentId) {
    await updateFlowRun(ctx, {
      status: "completed", waiting_for: null,
    });
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
  // Última linha de defesa contra "mesmo após cancelar, ainda enviou".
  // Checa cancelamento imediatamente antes de qualquer nó de envio de mídia/texto.
  const isSendNode =
    node.type === "send_text" ||
    node.type === "send_image" ||
    node.type === "send_video" ||
    node.type === "send_audio" ||
    node.type === "send_document" ||
    node.type === "send_buttons";
  if (isSendNode && (await isFlowRunCancelled(ctx))) {
    return {};
  }
  switch (node.type) {

    case "trigger":
      return {};

    case "send_text": {
      const text = interpolate(String(node.data?.text ?? ""), ctx);
      if (!text) return {};
      const body = { type: "text", text: { body: text } };
      if (await isFlowRunCancelled(ctx)) return {};
      const { waMsgId, phoneNumberId, toNormalized } = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
      if (await isFlowRunCancelled(ctx)) return {};
      await persistOutMessage(ctx, "text", body, waMsgId, phoneNumberId, toNormalized);
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
      if (await isFlowRunCancelled(ctx)) return {};
      const { waMsgId, phoneNumberId, toNormalized } = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
      if (await isFlowRunCancelled(ctx)) return {};
      await persistOutMessage(ctx, mediaType, body, waMsgId, phoneNumberId, toNormalized);
      return { log: { url: finalUrl } };
    }



    case "send_buttons": {
      const text = interpolate(String(node.data?.text ?? ""), ctx);
      const all: Array<{ id: string; label: string; type?: string; url?: string }> = (node.data?.buttons ?? []).slice(0, 6);
      if (!text || all.length === 0) throw new Error("Texto e pelo menos 1 botão obrigatórios");
      const replies = all.filter((b) => (b.type ?? "reply") === "reply").slice(0, 3);
      const urls = all.filter((b) => b.type === "url" && b.url);

      // 1) Reply buttons (grouped, max 3) — single interactive button message.
      if (replies.length > 0) {
        const body = {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text },
            action: {
              buttons: replies.map((b) => ({
                type: "reply",
                reply: { id: b.id, title: (b.label || "Opção").slice(0, 20) },
              })),
            },
          },
        };
        if (await isFlowRunCancelled(ctx)) return {};
        const { waMsgId, phoneNumberId, toNormalized } = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
        if (await isFlowRunCancelled(ctx)) return {};
        await persistOutMessage(ctx, "interactive", body, waMsgId, phoneNumberId, toNormalized);
      }

      // 2) URL buttons — each one a separate cta_url interactive message.
      for (const b of urls) {
        const body = {
          type: "interactive",
          interactive: {
            type: "cta_url",
            body: { text: replies.length === 0 ? text : (b.label || text) },
            action: {
              name: "cta_url",
              parameters: { display_text: (b.label || "Abrir").slice(0, 20), url: interpolate(String(b.url ?? ""), ctx) },
            },
          },
        };
        if (await isFlowRunCancelled(ctx)) return {};
        const { waMsgId, phoneNumberId, toNormalized } = await sendWA(ctx.channelId, ctx.contactWaId, body, ctx.db);
        if (await isFlowRunCancelled(ctx)) return {};
        await persistOutMessage(ctx, "interactive", body, waMsgId, phoneNumberId, toNormalized);
      }

      // Pause waiting for button reply only if there are reply buttons.
      if (replies.length === 0) {
        return { log: { urls: urls.length } };
      }
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
      // Sempre pausa e delega ao worker de timer. Antes, delays ≤30s usavam
      // setTimeout inline — se o worker terminava (Cloudflare kill), a run ficava
      // em "running" no delay e podia ser reexecutada, enviando mensagens em duplicata.
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
      const { data: tagRows } = await ctx.db
        .from("crm_tags" as any).select("id,nome").in("id", allIds);
      const nameById = new Map<string, string>((tagRows ?? []).map((t: any) => [t.id, t.nome]));
      const addNames = addIds.map((id) => nameById.get(id)).filter(Boolean) as string[];
      const removeNames = removeIds.map((id) => nameById.get(id)).filter(Boolean) as string[];

      // Find matching CRM lead by phone (last 10-13 digits)
      const phone = String(ctx.contactWaId ?? "").replace(/\D/g, "");
      if (!phone) return { log: { skipped: "no phone" } };
      const tail = phone.slice(-10);
      const { data: leads } = await ctx.db
        .from("crm_leads" as any).select("id,tags,telefone,expert,status").ilike("telefone", `%${tail}%`).limit(5);

      for (const l of leads ?? []) {
        const cur: string[] = Array.isArray((l as any).tags) ? (l as any).tags : [];
        const next = new Set(cur);
        for (const n of addNames) next.add(n);
        for (const n of removeNames) next.delete(n);
        const tags = Array.from(next);
        const patch: Record<string, any> = { tags, updated_at: new Date().toISOString() };
        const autoStatus = await resolveStageFromTags(ctx.db, tags, (l as any).expert);
        if (autoStatus) patch.status = autoStatus;
        await ctx.db.from("crm_leads" as any).update(patch).eq("id", (l as any).id);
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
  db?: any;
  vendor?: VendorRunContext | null;
  queueOnly?: boolean;
}) {
  const db = args.db ?? await getAdminDb();
  const flow = await loadFlow(args.flowId, db);
  const nodes: Node[] = (flow.nodes as Node[]) ?? [];
  const edges: Edge[] = (flow.edges as Edge[]) ?? [];
  if (nodes.length === 0) throw new Error("Fluxo sem nós");

  // Idempotency guard: se já existe uma run ativa (queued/running/waiting)
  // pra mesma combinação flow + canal + contato, NÃO cria outra. Impede
  // duplicação de disparos por triggers concorrentes (auto + manual,
  // webhooks duplicados, retries do worker, etc.)
  {
    const contactNorm = normalizeBrWhatsappNumber(String(args.contactWaId ?? ""));
    const contactCandidates = Array.from(new Set([String(args.contactWaId ?? ""), contactNorm].filter(Boolean)));
    const { data: existingActive } = await db
      .from("wa_flow_runs" as any)
      .select("id, status, current_node_id, contact_wa_id")
      .eq("flow_id", args.flowId)
      .eq("channel_id", args.channelId)
      .in("contact_wa_id", contactCandidates)
      .in("status", ["queued", "running", "waiting"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingActive) {
      console.log("[flow-engine] duplicate dispatch skipped", {
        flowId: args.flowId, channelId: args.channelId, contactWaId: args.contactWaId,
        existingRunId: (existingActive as any).id, status: (existingActive as any).status,
      });
      return { runId: (existingActive as any).id, deduped: true };
    }
  }

  let entryId: string | null = flow.entry_node_id ?? null;
  if (!entryId) entryId = nodes.find((n) => n.type === "trigger")?.id ?? null;
  if (!entryId) {
    const targets = new Set(edges.map((e) => e.target));
    entryId = nodes.find((n) => !targets.has(n.id))?.id ?? nodes[0].id;
  }

  const entryNode = nodes.find((n) => n.id === entryId);
  const startId =
    entryNode?.type === "trigger" ? nextNodeId(edges, entryId!) : entryId;

  const run = await createFlowRun(db, {
    flowId: args.flowId,
    conversationId: args.conversationId,
    channelId: args.channelId,
    contactWaId: args.contactWaId,
    currentNodeId: startId ?? entryId,
    triggerContext: args.triggerContext,
    vendor: args.vendor,
  });

  // Non-blocking mode: mark as queued and let the background worker execute it.
  if (args.queueOnly) {
    const queueCtx: Ctx = {
      runId: String((run as any).id),
      flowId: args.flowId,
      channelId: args.channelId,
      contactWaId: args.contactWaId,
      conversationId: (run as any).conversation_id ?? args.conversationId,
      db,
      variables: { trigger: args.triggerContext ?? {} },
      vendor: args.vendor ?? null,
    };
    await updateFlowRun(queueCtx, { status: "queued", waiting_for: null, expires_at: null });
    return { runId: (run as any).id, queued: true };
  }

  const ctx: Ctx = {
    runId: (run as any).id,
    flowId: args.flowId,
    channelId: args.channelId,
    contactWaId: args.contactWaId,
    conversationId: (run as any).conversation_id ?? args.conversationId,
    db,
    variables: { trigger: args.triggerContext ?? {} },
    vendor: args.vendor ?? null,
  };

  if (!startId) {
    await updateFlowRun(ctx, { status: "completed" });
    return { runId: ctx.runId, completed: true, reason: "no_next_node" };
  }
  await executeFrom(ctx, startId);
  return { runId: ctx.runId };
}

// Background worker: claims up to `limit` queued runs and executes them in parallel.
export async function processQueuedFlowRuns(limit = 20) {
  const db = await getAdminDb();
  const { data: claimed, error } = await db.rpc("claim_queued_flow_runs" as any, { _limit: limit });
  if (error) throw new Error(error.message);
  const runs = Array.isArray(claimed) ? claimed : [];
  if (runs.length === 0) return { processed: 0, results: [] };

  const results = await Promise.allSettled(
    runs.map(async (run: any) => {
      const ctx: Ctx = {
        runId: String(run.id),
        flowId: String(run.flow_id),
        channelId: String(run.channel_id),
        contactWaId: String(run.contact_wa_id),
        conversationId: run.conversation_id ?? null,
        db,
        variables: { trigger: (run.context && (run.context as any).trigger) ?? {} },
        vendor: null,
      };
      const startId = run.current_node_id ? String(run.current_node_id) : null;
      if (!startId) {
        await updateFlowRun(ctx, { status: "completed" });
        return { runId: ctx.runId, completed: true };
      }
      try {
        await executeFrom(ctx, startId);
        return { runId: ctx.runId, ok: true };
      } catch (err: any) {
        await updateFlowRun(ctx, { status: "failed", error: String(err?.message ?? err) });
        return { runId: ctx.runId, error: String(err?.message ?? err) };
      }
    }),
  );

  return {
    processed: runs.length,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  };
}

// Wakes up flow runs paused on a `delay` node whose timer has expired.
// Advances to the next node and resumes execution.
export async function processExpiredTimerRuns(limit = 20) {
  const db = await getAdminDb();
  const { data: expired, error } = await db.rpc("claim_expired_timer_flow_runs" as any, { _limit: limit });
  if (error) throw new Error(error.message);
  const claimed = Array.isArray(expired) ? expired : [];
  if (claimed.length === 0) return { resumed: 0, results: [] };

  const results = await Promise.allSettled(
    claimed.map(async (run: any) => {
      const flow = await loadFlow(String(run.flow_id), db);
      const edges: Edge[] = (flow.edges as Edge[]) ?? [];
      const nextId = nextNodeId(edges, String(run.current_node_id));
      const ctx: Ctx = {
        runId: String(run.id),
        flowId: String(run.flow_id),
        channelId: String(run.channel_id),
        contactWaId: String(run.contact_wa_id),
        conversationId: run.conversation_id ?? null,
        db,
        variables: { trigger: (run.context && (run.context as any).trigger) ?? {} },
        vendor: null,
      };
      if (!nextId) {
        await updateFlowRun(ctx, { status: "completed" });
        return { runId: ctx.runId, completed: true };
      }
      try {
        // Move the pointer off the delay before executing the next node. If the
        // worker is interrupted while sending media, the run will not be
        // recovered as the same delay again and duplicate the message.
        await updateFlowRun(ctx, {
          status: "running",
          waiting_for: null,
          expires_at: null,
          current_node_id: nextId,
        });
        await executeFrom(ctx, nextId);
        return { runId: ctx.runId, ok: true };
      } catch (err: any) {
        await updateFlowRun(ctx, { status: "failed", error: String(err?.message ?? err) });
        return { runId: ctx.runId, error: String(err?.message ?? err) };
      }
    }),
  );

  return {
    resumed: claimed.length,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  };
}

// Recovers delay nodes that were left as `running` before the worker could mark
// them as queued/waiting. This prevents manual vendor triggers from staying stuck.
export async function processStaleRunningDelayRuns(olderThanSeconds = 90, limit = 20) {
  const db = await getAdminDb();
  const { data: stale, error } = await db.rpc("claim_stale_running_delay_flow_runs" as any, {
    _older_than_seconds: olderThanSeconds,
    _limit: limit,
  });
  if (error) throw new Error(error.message);
  const runs = Array.isArray(stale) ? stale : [];
  return {
    recovered: runs.length,
    results: runs.map((run: any) => ({
      runId: String(run.id),
      status: run.status,
      waitingFor: run.waiting_for,
      expiresAt: run.expires_at,
    })),
  };
}

// Clears flows that were waiting for a user reply/button and already expired.
// Timer delays are handled by processExpiredTimerRuns; do not cancel them here.
export async function processExpiredWaitingRuns(olderThanSeconds = 60, limit = 100) {
  const db = await getAdminDb();
  const { data: expired, error } = await db.rpc("cancel_expired_waiting_flow_runs" as any, {
    _older_than_seconds: olderThanSeconds,
    _limit: limit,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(expired) ? expired : [];
  return {
    cancelled: rows.length,
    results: rows.map((run: any) => ({
      runId: String(run.id),
      waitingFor: run.waiting_for,
      expiresAt: run.expires_at,
    })),
  };
}


export async function advanceWaitingRun(args: {
  conversationId: string;
  input: { text?: string | null; buttonId?: string | null; messageType?: string | null };
  db?: any;
}) {
  const db = args.db ?? await getAdminDb();
  // Find a waiting run for this conversation
  const { data: run } = await db
    .from("wa_flow_runs" as any)
    .select("*")
    .eq("conversation_id", args.conversationId)
    .eq("status", "waiting")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;

  const r = run as any;
  const flow = await loadFlow(r.flow_id, db);
  const edges: Edge[] = (flow.edges as Edge[]) ?? [];

  const ctx: Ctx = {
    runId: r.id,
    flowId: r.flow_id,
    channelId: r.channel_id,
    contactWaId: r.contact_wa_id,
    conversationId: r.conversation_id,
    db,
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
    await db.from("wa_flow_runs" as any).update({
      status: "completed", waiting_for: null,
    }).eq("id", r.id);
    return { runId: r.id, completed: true };
  }

  await db.from("wa_flow_runs" as any).update({
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
  db?: any;
}) {
  const db = args.db ?? await getAdminDb();
  // 1. Advance a waiting run if any
  const advanced = await advanceWaitingRun({
    conversationId: args.conversationId,
    input: { text: args.text, buttonId: args.buttonId, messageType: args.messageType ?? null },
    db,
  });
  if (advanced) return advanced;

  // 2. Look up active triggers
  const { data: triggers } = await db
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
        db,
        triggerContext: { tipo: trg.tipo, valor: trg.valor, input: args.text },
      });
    }
  }

  return null;
}

// Dispatch flows tied to "new_lead" trigger when a CRM lead is inserted.
export async function dispatchNewLead(args: { leadId: string; db?: any }) {
  const db = args.db ?? await getAdminDb();
  const { data: lead } = await db
    .from("crm_leads" as any).select("*").eq("id", args.leadId).maybeSingle();
  if (!lead) return { matched: 0, reason: "lead not found" };
  const l: any = lead;
  const phoneDigits = String(l.telefone ?? "").replace(/\D/g, "");
  if (!phoneDigits) return { matched: 0, reason: "no phone" };

  const { data: triggers } = await db
    .from("wa_flow_triggers" as any)
    .select("*, wa_flows!inner(id, ativo, entry_node_id, operacao_id)")
    .eq("ativo", true)
    .eq("tipo", "new_lead");

  let started = 0;
  const seenFlowChannel = new Set<string>();
  for (const trg of (triggers ?? []) as any[]) {
    if (!trg.wa_flows?.ativo) continue;
    const flowOp = trg.wa_flows?.operacao_id;
    if (flowOp && l.expert && String(flowOp) !== String(l.expert) && String(flowOp) !== String(l.operacao_id ?? "")) continue;
    if (!trg.channel_id) continue;
    // Dedupe múltiplos triggers apontando pro mesmo (flow, canal)
    const key = `${trg.flow_id}::${trg.channel_id}`;
    if (seenFlowChannel.has(key)) continue;
    seenFlowChannel.add(key);
    await runFlowAdmin({
      flowId: trg.flow_id,
      channelId: trg.channel_id,
      contactWaId: phoneDigits,
      conversationId: null,
      db,
      triggerContext: { tipo: "new_lead", lead: { id: l.id, nome: l.nome, telefone: l.telefone, email: l.email } },
    });
    started++;
  }
  return { matched: started };
}
