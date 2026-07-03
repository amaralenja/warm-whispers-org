import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// ZapVoice backup importer
// Converts ZapVoice "funnels" into native flows (wa_flows).
// Each funnel becomes 1 flow with: trigger → (delay? → send_*)+
// ============================================================

type ZvItem = { id: string; [k: string]: any };
type ZvSeqItem = {
  id: string;
  funnelId?: string;
  itemId: string;
  type: "audio" | "media" | "document" | "message" | string;
  delayBeforeSend?: number;
};
type ZvFunnel = {
  id: string;
  name?: string;
  isFavorite?: boolean;
  itemsSequence?: ZvSeqItem[];
};

type Summary = {
  funnels: number;
  steps: number;
  uploads: number;
  errors: { funnel?: string; item?: string; message: string }[];
};

function mapBy<T extends { id?: string }>(arr: any): Map<string, T> {
  const m = new Map<string, T>();
  if (!Array.isArray(arr)) return m;
  for (const it of arr) {
    if (it && typeof it === "object" && it.id) m.set(String(it.id), it as T);
  }
  return m;
}

// Try to find a base64/data-url payload inside an arbitrary object.
function extractBase64(obj: any): { base64: string; mime?: string; filename?: string } | null {
  if (!obj || typeof obj !== "object") return null;
  const filename = obj.filename || obj.name || obj.fileName || undefined;
  const mime = obj.mimeType || obj.mimetype || obj.type || obj.contentType || undefined;

  const candidates = [
    obj.base64, obj.data, obj.dataUrl, obj.url, obj.content,
    obj.file, obj.buffer, obj.payload, obj.media, obj.audio, obj.document,
  ];
  for (const c of candidates) {
    if (typeof c !== "string" || c.length < 20) continue;
    if (c.startsWith("data:")) {
      const m = c.match(/^data:([^;]+);base64,(.+)$/);
      if (m) return { base64: m[2], mime: m[1] ?? mime, filename };
    }
    // Heuristic: long base64-looking string.
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(c) && c.length > 200) {
      return { base64: c.replace(/\s+/g, ""), mime, filename };
    }
  }
  // Nested search (one level).
  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    if (v && typeof v === "object") {
      const r = extractBase64(v);
      if (r) return { ...r, filename: r.filename ?? filename, mime: r.mime ?? mime };
    }
  }
  return null;
}

function extOf(mime?: string, filename?: string): string {
  if (filename && /\.[a-z0-9]{1,6}$/i.test(filename)) {
    return filename.match(/\.[a-z0-9]{1,6}$/i)![0].toLowerCase();
  }
  if (!mime) return ".bin";
  const map: Record<string, string> = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp",
    "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/ogg": ".ogg", "audio/wav": ".wav",
    "audio/webm": ".webm", "audio/m4a": ".m4a", "audio/mp4": ".m4a",
    "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
    "application/pdf": ".pdf",
  };
  return map[mime] ?? ".bin";
}

function zvTypeToNodeType(t: string): "send_text" | "send_image" | "send_video" | "send_audio" | "send_document" {
  switch (t) {
    case "message": return "send_text";
    case "audio": return "send_audio";
    case "document": return "send_document";
    case "media":
    default: return "send_image"; // refined later based on mime
  }
}

function vendorRpcArgs(context: any) {
  const id = Number(context?.vendor?.id);
  const codigo = String(context?.vendor?.codigo ?? "").trim();
  return Number.isFinite(id) && id > 0 && codigo ? { _vendor_id: id, _codigo: codigo } : null;
}

async function vendorAllowedWorkspaceIds(context: any, db: any): Promise<string[]> {
  const explicit = context?.vendor?.workspace_ids;
  if (Array.isArray(explicit) && explicit.length > 0) return explicit.map(String).filter(Boolean);
  const expert = context?.vendor?.expert ? String(context.vendor.expert).trim() : "";
  if (expert) return [expert];
  const rpcArgs = vendorRpcArgs(context);
  if (!rpcArgs) return [];
  const { data } = await db.rpc("vendor_allowed_workspace_ids" as any, rpcArgs);
  return Array.isArray(data) ? data.map(String).filter(Boolean) : [];
}

async function coerceVendorOperacaoId(context: any, db: any, operacaoId?: string | null): Promise<string | null> {
  if (!context?.vendor) return operacaoId ?? null;
  const allowed = await vendorAllowedWorkspaceIds(context, db);
  if (allowed.length === 0) throw new Error("Sessão de vendedor sem operação liberada");
  const desired = String(operacaoId ?? "").trim();
  if (!desired) return allowed[0];
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const ok = allowed.some((op) => norm(op) === norm(desired));
  if (!ok) throw new Error("Inautorizado: vendedor sem acesso a esta operação");
  return desired;
}

async function createVendorZapVoiceFlow(context: any, db: any, payload: any) {
  const rpcArgs = vendorRpcArgs(context);
  if (!rpcArgs) throw new Error("Sessão de vendedor inválida");
  const { error } = await db.rpc("vendor_create_wa_flow" as any, {
    ...rpcArgs,
    _nome: String(payload.nome ?? "").trim() || "Fluxo ZapVoice",
    _operacao_id: payload.operacao_id ?? null,
    _folder: null,
    _ativo: payload.ativo ?? true,
    _entry_node_id: payload.entry_node_id ?? null,
    _nodes: payload.nodes ?? [],
    _edges: payload.edges ?? [],
    _descricao: payload.descricao ?? null,
  });
  if (error) {
    console.error("[zapvoice-import] vendor_create_wa_flow failed", {
      vendorId: rpcArgs._vendor_id,
      nome: payload.nome,
      operacao_id: payload.operacao_id,
      error: error.message,
    });
    throw new Error(error.message);
  }
}

export const importZapVoiceBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    backup: any;
    operacao_id?: string | null;
    replace?: boolean;
    funnelIds?: string[] | null;
  }) => ({
    backup: d?.backup,
    operacao_id: d?.operacao_id ?? null,
    replace: !!d?.replace,
    funnelIds: Array.isArray(d?.funnelIds) ? d.funnelIds.map(String) : null,
  }))
  .handler(async ({ context, data }) => {
    const b = data.backup;
    if (!b || typeof b !== "object") throw new Error("Backup inválido.");
    if (!Array.isArray(b.funnels)) throw new Error("Backup inválido: 'funnels' precisa ser array.");
    if (!Array.isArray(b.objectsList)) throw new Error("Backup inválido: 'objectsList' precisa ser array.");
    for (const k of ["messages", "audios", "medias", "docs"]) {
      if (!Array.isArray((b as any)[k])) throw new Error(`Backup inválido: '${k}' precisa ser array.`);
    }

    const isVendor = Boolean((context as any)?.vendor);
    let db: any = context.supabase as any;
    if (isVendor) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      db = supabaseAdmin as any;
    }

    // Vendedor: garante que a operação escolhida está liberada pra ele
    // (evita "Inautorizado" enigmático no meio do loop e normaliza null → workspace default).
    const effectiveOperacaoId = await coerceVendorOperacaoId(context, db, data.operacao_id);

    const summary: Summary = { funnels: 0, steps: 0, uploads: 0, errors: [] };

    // Substituir: apaga só os fluxos importados deste usuário com prefixo [ZV]
    // (apenas no primeiro chunk — se funnelIds vier, NÃO apaga pra não destruir os já criados)
    if (data.replace && !data.funnelIds && !isVendor) {
      await db
        .from("wa_flows")
        .delete()
        .eq("created_by", context.userId)
        .ilike("nome", "[ZV]%");
    }

    // Filtra funis a processar (chunking)
    const allFunnels = b.funnels as ZvFunnel[];
    const funnelsToProcess = data.funnelIds
      ? allFunnels.filter((f) => data.funnelIds!.includes(String(f.id)))
      : allFunnels;
    (b as any).funnels = funnelsToProcess;

    const messagesById = mapBy<ZvItem>(b.messages);
    const audiosById = mapBy<ZvItem>(b.audios);
    const mediasById = mapBy<ZvItem>(b.medias);
    const docsById = mapBy<ZvItem>(b.docs);
    const objectsById = mapBy<ZvItem>(b.objectsList);

    // Cache uploads (same itemId may repeat across funnels)
    const uploadCache = new Map<string, { url: string; filename?: string; mime?: string }>();

    async function uploadMedia(itemId: string, kind: "audio" | "media" | "document"): Promise<{ url: string; filename?: string; mime?: string } | null> {
      if (uploadCache.has(itemId)) return uploadCache.get(itemId)!;
      const itemRef =
        kind === "audio" ? audiosById.get(itemId)
        : kind === "document" ? docsById.get(itemId)
        : mediasById.get(itemId);
      const obj = objectsById.get(itemId) ?? itemRef;
      const merged = { ...(itemRef ?? {}), ...(obj ?? {}) };
      const extracted = extractBase64(merged);
      if (!extracted) return null;

      let bytes: Uint8Array;
      try {
        const bin = typeof Buffer !== "undefined"
          ? Buffer.from(extracted.base64, "base64")
          : Uint8Array.from(atob(extracted.base64), (c) => c.charCodeAt(0));
        bytes = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
      } catch (e: any) {
        throw new Error(`base64 inválido: ${e?.message ?? e}`);
      }

      const ext = extOf(extracted.mime, extracted.filename);
      const path = `zapvoice/${context.userId}/${itemId}${ext}`;
      const { error: upErr } = await db.storage
        .from("wa-media")
        .upload(path, bytes, {
          contentType: extracted.mime ?? "application/octet-stream",
          upsert: true,
        });
      if (upErr) throw new Error(`upload falhou: ${upErr.message}`);

      // Signed URL com validade longa (10 anos)
      const { data: signed, error: signErr } = await db.storage
        .from("wa-media")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr || !signed?.signedUrl) throw new Error(`signed url falhou: ${signErr?.message ?? "?"}`);

      summary.uploads += 1;
      const result = { url: signed.signedUrl, filename: extracted.filename, mime: extracted.mime };
      uploadCache.set(itemId, result);
      return result;
    }

    for (const f of b.funnels as ZvFunnel[]) {
      try {
        const seq = Array.isArray(f.itemsSequence) ? f.itemsSequence : [];
        const nodes: any[] = [];
        const edges: any[] = [];
        let y = 60;
        const X = 180;
        const STEP_Y = 140;

        const triggerId = `n-trigger-${f.id}`;
        nodes.push({
          id: triggerId,
          type: "trigger",
          position: { x: X, y },
          data: { label: "Início" },
        });
        y += STEP_Y;
        let prevId = triggerId;

        for (let i = 0; i < seq.length; i++) {
          const s = seq[i];
          try {
            const delayMs = Number(s.delayBeforeSend ?? 0);
            if (delayMs > 0) {
              const delayId = `n-delay-${f.id}-${i}`;
              nodes.push({
                id: delayId,
                type: "delay",
                position: { x: X, y },
                data: { seconds: Math.max(1, Math.round(delayMs / 1000)) },
              });
              edges.push({ id: `e-${prevId}-${delayId}`, source: prevId, target: delayId });
              prevId = delayId;
              y += STEP_Y;
            }

            let nodeType: string = zvTypeToNodeType(s.type);
            let nodeData: any = {};

            if (s.type === "message") {
              const objMatch =
                b.objectsList?.find((o: any) => o?.id === s.itemId)
                ?? objectsById.get(s.itemId);
              const msgMeta = messagesById.get(s.itemId);

              let text: string | null = null;
              let brokenRef = false;

              if (!objMatch) {
                brokenRef = true;
              } else {
                const d = (objMatch as any)?.data;
                if (typeof d === "string" && d.length > 0 && !d.startsWith("data:")) {
                  text = d;
                }
              }

              if (text) {
                nodeData = { text };
              } else {
                nodeData = {
                  text: brokenRef
                    ? "ERRO: referência quebrada (objectsList sem id correspondente)"
                    : "ERRO: conteúdo não encontrado",
                  _debug: {
                    original_item_id: s.itemId,
                    original_sequence_id: s.id,
                    original_message_meta: msgMeta ?? null,
                    original_object_list_match: objMatch ?? null,
                  },
                };
                summary.errors.push({
                  funnel: f.name,
                  item: s.itemId,
                  message: brokenRef ? "referência quebrada em objectsList" : "object.data ausente ou inválido",
                });
              }
            } else {
              const kind = s.type === "audio" ? "audio" : s.type === "document" ? "document" : "media";
              const up = await uploadMedia(s.itemId, kind);
              if (!up) {
                summary.errors.push({ funnel: f.name, item: s.itemId, message: "mídia não encontrada no objectsList" });
                continue;
              }
              // refina tipo baseado no mime
              if (kind === "media") {
                if (up.mime?.startsWith("video/")) nodeType = "send_video";
                else if (up.mime?.startsWith("audio/")) nodeType = "send_audio";
                else nodeType = "send_image";
              }
              nodeData = { mediaUrl: up.url, filename: up.filename ?? "" };
            }

            const nodeId = `n-step-${f.id}-${i}`;
            nodes.push({
              id: nodeId,
              type: nodeType,
              position: { x: X, y },
              data: {
                ...nodeData,
                _zv: { sequenceId: s.id, itemId: s.itemId, type: s.type, delayMs: s.delayBeforeSend ?? 0 },
              },
            });
            edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId });
            prevId = nodeId;
            y += STEP_Y;
            summary.steps += 1;
          } catch (e: any) {
            summary.errors.push({ funnel: f.name, item: s.itemId, message: e?.message ?? String(e) });
          }
        }

        const nome = `[ZV] ${f.name ?? "Funil"}`.slice(0, 120);
        const flowPayload = {
          nome,
          operacao_id: data.operacao_id,
          ativo: true,
          entry_node_id: triggerId,
          nodes,
          edges,
          created_by: isVendor ? null : context.userId,
          descricao: `Importado do ZapVoice (id original: ${f.id})${f.isFavorite ? " · ⭐" : ""}`,
        };
        if (isVendor) {
          await createVendorZapVoiceFlow(context, db, flowPayload);
        } else {
          const { error: insErr } = await db.from("wa_flows").insert(flowPayload);
          if (insErr) throw new Error(insErr.message);
        }
        summary.funnels += 1;
      } catch (e: any) {
        summary.errors.push({ funnel: f.name ?? f.id, message: e?.message ?? String(e) });
      }
    }

    return summary;
  });
