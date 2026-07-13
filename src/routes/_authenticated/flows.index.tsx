import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Workflow, Plus, Trash2, Power, PowerOff, Pencil,
  Copy, Upload, Download, ClipboardCopy, FileJson, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listFlows, createFlow, deleteFlow, saveFlow,
  duplicateFlow, exportFlow, importFlow,
} from "@/lib/flow-engine.functions";
import { importZapVoiceBackup, uploadZapVoiceMedia } from "@/lib/zapvoice-import.functions";
import { useWorkspace } from "@/lib/workspace-context";

export const Route = createFileRoute("/_authenticated/flows/")({
  component: FlowsListPage,
});

function FlowsListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { workspace, workspaces } = useWorkspace();
  const listFn = useServerFn(listFlows);
  const createFn = useServerFn(createFlow);
  const deleteFlowFn = useServerFn(deleteFlow);
  const saveFn = useServerFn(saveFlow);
  const duplicateFn = useServerFn(duplicateFlow);
  const exportFn = useServerFn(exportFlow);
  const importFn = useServerFn(importFlow);
  const importZvFn = useServerFn(importZapVoiceBackup);
  const uploadZvMediaFn = useServerFn(uploadZapVoiceMedia);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [op, setOp] = useState<string>(workspace.id === "all" ? "" : workspace.id);
  const [folder, setFolder] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Import
  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importName, setImportName] = useState("");
  const [importOp, setImportOp] = useState<string>(workspace.id === "all" ? "" : workspace.id);

  // ZapVoice import
  const [zvOpen, setZvOpen] = useState(false);
  const [zvOp, setZvOp] = useState<string>(workspace.id === "all" ? "" : workspace.id);
  const [zvReplace, setZvReplace] = useState(false);
  const [zvFile, setZvFile] = useState<File | null>(null);
  const [zvSummary, setZvSummary] = useState<any>(null);
  const [zvLogs, setZvLogs] = useState<string[]>([]);

  useEffect(() => {
    const allowedOps = new Set(workspaces.filter((o) => o.id !== "all").map((o) => o.id));
    const preferred = workspace.id !== "all" ? workspace.id : "";
    if (preferred && (!op || !allowedOps.has(op))) setOp(preferred);
    if (preferred && (!importOp || !allowedOps.has(importOp))) setImportOp(preferred);
    if (preferred && (!zvOp || !allowedOps.has(zvOp))) setZvOp(preferred);
  }, [workspace.id, workspaces, op, importOp, zvOp]);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportCode, setExportCode] = useState("");
  const [exportFlowName, setExportFlowName] = useState("");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [dupConfirmOpen, setDupConfirmOpen] = useState(false);
  const [dupPreview, setDupPreview] = useState<{ keep: any; remove: any[] }[]>([]);
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const clearSel = () => setSelected(new Set());

  const { data: flows = [] } = useQuery({
    queryKey: ["wa-flows"],
    queryFn: () => listFn(),
  });

  const createMut = useMutation({
    mutationFn: (v: { nome: string; operacao_id: string | null; folder: string | null }) => createFn({ data: v }),
    onSuccess: (r: any) => {
      toast.success("Fluxo criado");
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
      setOpen(false);
      setName("");
      setFolder("");
      navigate({ to: "/flows/$flowId", params: { flowId: r.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar fluxo"),
  });

  const moveFolderMut = useMutation({
    mutationFn: (v: { id: string; folder: string | null }) => saveFn({ data: v }),
    onSuccess: () => {
      toast.success("Pasta atualizada");
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFlowFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Fluxo removido");
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
    },
  });

  const bulkDelMut = useMutation({
    mutationFn: async (ids: string[]) => {
      let ok = 0, fail = 0;
      for (const id of ids) {
        try { await deleteFlowFn({ data: { id } }); ok++; }
        catch (e) { console.error("[bulk-del] fail", id, e); fail++; }
      }
      return { ok, fail };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
      clearSel();
      setBulkConfirmOpen(false);
      if (r.fail === 0) toast.success(`${r.ok} fluxo${r.ok === 1 ? "" : "s"} removido${r.ok === 1 ? "" : "s"}`);
      else toast.warning(`${r.ok} removidos, ${r.fail} falharam`);
    },
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => saveFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-flows"] }),
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => duplicateFn({ data: { id } }),
    onSuccess: (r: any) => {
      toast.success(`Duplicado como "${r.nome}"`);
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao duplicar"),
  });

  const exportMut = useMutation({
    mutationFn: (id: string) => exportFn({ data: { id } }),
    onSuccess: (r: any) => {
      setExportCode(r.code);
      setExportFlowName(r.nome);
      setExportOpen(true);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao exportar"),
  });

  const importMut = useMutation({
    mutationFn: (v: { code: string; operacao_id: string | null; nome: string | null }) =>
      importFn({ data: v }),
    onSuccess: (r: any) => {
      toast.success(`Fluxo importado como "${r.nome}"`);
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
      setImportOpen(false);
      setImportCode("");
      setImportName("");
      navigate({ to: "/flows/$flowId", params: { flowId: r.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao importar"),
  });

  const [zvProgress, setZvProgress] = useState<string>("");

  const addZvLog = (message: string) => {
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setZvLogs((logs) => [...logs.slice(-79), `[${time}] ${message}`]);
  };

  const previewValue = (value: unknown) => {
    if (typeof value !== "string") return null;
    if (value.startsWith("data:")) return `${value.slice(0, 56)}… (${value.length} chars)`;
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 200) return `[base64 ${value.length} chars]`;
    if (/^https?:\/\//i.test(value)) return `${value.slice(0, 80)}… (${value.length} chars)`;
    return `${value.slice(0, 80)}${value.length > 80 ? "…" : ""} (${value.length} chars)`;
  };

  const parseDataUrl = (value: string): { base64: string; mime?: string } | null => {
    const match = value.match(/^data:([^;,]+)(?:;[^,]*)*;base64,(.+)$/s);
    if (!match) return null;
    return { base64: match[2], mime: match[1] };
  };

  const describeLocalSource = (bucket: string, item: any) => {
    if (!item || typeof item !== "object") return { bucket, found: false };
    return {
      bucket,
      found: true,
      id: item.id ?? null,
      itemId: item.itemId ?? item.data?.itemId ?? null,
      type: item.type ?? item.mimeType ?? item.mimetype ?? item.contentType ?? null,
      filename: item.filename ?? item.fileName ?? item.name ?? null,
      keys: Object.keys(item).slice(0, 35),
      stringFields: Object.entries(item)
        .filter(([, value]) => typeof value === "string")
        .slice(0, 14)
        .map(([key, value]) => ({ key, preview: previewValue(value) })),
      hasDataUrl: Object.values(item).some((value) => typeof value === "string" && value.startsWith("data:") && value.includes(";base64,")),
      hasBase64LikeString: Object.values(item).some((value) => typeof value === "string" && value.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(value)),
    };
  };

  async function runZvImport() {
    if (!zvFile) return toast.error("Selecione o arquivo .json");
    const t = toast.loading("Lendo arquivo…");
    setZvProgress("lendo");
    setZvLogs([]);
    addZvLog(`Lendo ${zvFile.name} (${(zvFile.size / 1024 / 1024).toFixed(2)} MB)`);
    let parsed: any;
    try {
      const raw = await zvFile.text();
      parsed = JSON.parse(raw);
      addZvLog("JSON carregado com sucesso");
    } catch (e: any) {
      console.error("[zv-import] parse fail", e);
      addZvLog(`Erro lendo JSON: ${e?.message ?? String(e)}`);
      setZvProgress("");
      return toast.error("JSON inválido: " + (e?.message ?? e), { id: t });
    }
    if (!Array.isArray(parsed?.funnels)) {
      setZvProgress("");
      addZvLog("Erro: JSON sem funnels[]");
      return toast.error("JSON sem 'funnels[]'", { id: t });
    }

    setZvSummary(null);
    const allFunnels: any[] = parsed.funnels;
    const total = allFunnels.length;
    addZvLog(`${total} funil(is) encontrados`);
    // Reduzido: 1 funil por request pra evitar "Request Entity Too Large".
    const CHUNK = 1;
    const acc: any = { funnels: 0, steps: 0, uploads: 0, errors: [] };

    // Index helpers para montar backup slim por chunk
    const byId = (arr: any) => {
      const m = new Map<string, any>();
      if (Array.isArray(arr)) for (const it of arr) if (it?.id) m.set(String(it.id), it);
      return m;
    };
    const messagesIdx = byId(parsed.messages);
    const audiosIdx = byId(parsed.audios);
    const mediasIdx = byId(parsed.medias);
    const docsIdx = byId(parsed.docs);
    const objectsIdx = byId(parsed.objectsList);
    const sequenceIdx = new Map<string, any>();

    const extOf = (mime?: string | null, filename?: string | null): string => {
      if (filename && /\.[a-z0-9]{1,6}$/i.test(filename)) return filename.match(/\.[a-z0-9]{1,6}$/i)![0].toLowerCase();
      const map: Record<string, string> = {
        "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp",
        "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/ogg": ".ogg", "audio/wav": ".wav",
        "audio/webm": ".webm", "audio/m4a": ".m4a", "audio/mp4": ".m4a",
        "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
        "application/pdf": ".pdf",
      };
      return mime ? (map[mime] ?? ".bin") : ".bin";
    };

    const safePathPart = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "item";

    const base64ToBlob = (base64: string, mime?: string | null) => {
      const clean = base64.replace(/\s+/g, "");
      const chunkSize = 64 * 1024;
      const chunks: BlobPart[] = [];
      for (let offset = 0; offset < clean.length; offset += chunkSize) {
        const slice = clean.slice(offset, offset + chunkSize);
        const binary = atob(slice);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        chunks.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      }
      return new Blob(chunks, { type: mime ?? "application/octet-stream" });
    };

    const isBigInlineFile = (value: unknown) => {
      if (typeof value !== "string" || value.length < 300) return false;
      if (value.startsWith("data:") && value.includes(";base64,")) return true;
      return value.length > 1500 && /^[A-Za-z0-9+/=\r\n]+$/.test(value);
    };

    const scrubPayload = (value: any): any => {
      if (isBigInlineFile(value)) return "[arquivo enviado ao Storage]";
      if (Array.isArray(value)) return value.map(scrubPayload);
      if (!value || typeof value !== "object") return value;
      const out: any = {};
      for (const [key, child] of Object.entries(value)) {
        out[key] = scrubPayload(child);
      }
      return out;
    };

    // --- Pre-upload: sobe base64 pesado (áudios/mídias/docs) uma vez só,
    // pra evitar "Request Entity Too Large" nos chunks.
    const extractB64 = (obj: any): { base64: string; mime?: string; filename?: string } | null => {
      if (!obj || typeof obj !== "object") return null;
      const filename = obj.filename || obj.name || obj.fileName || undefined;
      const mime = obj.mimeType || obj.mimetype || obj.type || obj.contentType || undefined;
      const cands = [obj.base64, obj.data, obj.dataUrl, obj.url, obj.content, obj.file, obj.buffer, obj.payload, obj.media, obj.audio, obj.document];
      for (const c of cands) {
        if (typeof c !== "string" || c.length < 20) continue;
        if (c.startsWith("data:")) {
          const parsedDataUrl = parseDataUrl(c);
          if (parsedDataUrl) return { base64: parsedDataUrl.base64, mime: parsedDataUrl.mime ?? mime, filename };
        }
        if (/^[A-Za-z0-9+/=\r\n]+$/.test(c) && c.length > 200) {
          return { base64: c.replace(/\s+/g, ""), mime, filename };
        }
      }
      for (const k of Object.keys(obj)) {
        const v = (obj as any)[k];
        if (v && typeof v === "object") {
          const r = extractB64(v);
          if (r) return { ...r, filename: r.filename ?? filename, mime: r.mime ?? mime };
        }
      }
      return null;
    };

    const preuploaded = new Map<string, { url: string; mime: string | null; filename: string | null }>();
    const getItemSources = (itemId: string) => [
      objectsIdx.get(itemId),
      audiosIdx.get(itemId),
      mediasIdx.get(itemId),
      docsIdx.get(itemId),
      messagesIdx.get(itemId),
      sequenceIdx.get(itemId),
    ].filter(Boolean);

    const localMediaDebug = (itemId: string) => {
      const byItemId = (bucket: string, arr: any) => Array.isArray(arr)
        ? arr
          .filter((item: any) => String(item?.itemId ?? item?.data?.itemId ?? "") === itemId)
          .slice(0, 5)
          .map((item: any) => describeLocalSource(`${bucket}[itemId]`, item))
        : [];
      return {
        itemId,
        directSources: [
          describeLocalSource("objectsList[id]", objectsIdx.get(itemId)),
          describeLocalSource("messages[id]", messagesIdx.get(itemId)),
          describeLocalSource("audios[id]", audiosIdx.get(itemId)),
          describeLocalSource("medias[id]", mediasIdx.get(itemId)),
          describeLocalSource("docs[id]", docsIdx.get(itemId)),
          describeLocalSource("itemsSequence", sequenceIdx.get(itemId)),
        ],
        itemIdMatchesWithDifferentId: [
          ...byItemId("objectsList", parsed.objectsList),
          ...byItemId("messages", parsed.messages),
          ...byItemId("audios", parsed.audios),
          ...byItemId("medias", parsed.medias),
          ...byItemId("docs", parsed.docs),
        ],
      };
    };

    const extractFromAnySource = (itemId: string) => {
      const sources = getItemSources(itemId);
      const merged = Object.assign({}, ...sources);
      let extracted = extractB64(merged);
      if (!extracted) {
        for (const source of sources) {
          extracted = extractB64(source);
          if (extracted) break;
        }
      }
      return extracted;
    };

    const allItemIds = new Set<string>();
    for (const f of allFunnels) {
      const seq = Array.isArray(f?.itemsSequence) ? f.itemsSequence : [];
      // Pre-upa TODO item que tiver base64, independente do tipo.
      for (const s of seq) if (s?.itemId) {
        const itemId = String(s.itemId);
        allItemIds.add(itemId);
        if (!sequenceIdx.has(itemId)) sequenceIdx.set(itemId, s);
      }
    }
    let mediaDone = 0;
    const mediaTotal = allItemIds.size;
    addZvLog(`${mediaTotal} item(ns) na fila de verificação de mídia`);
    if (mediaTotal > 0) toast.loading(`Enviando mídias 0 / ${mediaTotal}…`, { id: t });

    for (const itemId of allItemIds) {
      const ex = extractFromAnySource(itemId);
      if (!ex) {
        const dbg = localMediaDebug(itemId);
        const foundIn = dbg.directSources.filter((s: any) => s.found).map((s: any) => s.bucket);
        if (foundIn.length > 0 || dbg.itemIdMatchesWithDifferentId.length > 0) {
          console.warn("[zv-import] item sem base64/preupload no arquivo local", dbg);
          addZvLog(`Sem arquivo extraível ${itemId}: fontes=${foundIn.join(", ") || "nenhuma por id"}; itemIdMatches=${dbg.itemIdMatchesWithDifferentId.length}`);
        }
        mediaDone++;
        continue;
      }
      try {
        const ext = extOf(ex.mime ?? null, ex.filename ?? null);
        const blob = base64ToBlob(ex.base64, ex.mime ?? null);
        addZvLog(`Mídia detectada ${itemId}: mime=${ex.mime ?? "?"}, arquivo=${ex.filename ?? `${safePathPart(itemId)}${ext}`}, tamanho=${(blob.size / 1024 / 1024).toFixed(2)} MB`);
        const uploaded: any = await uploadZvMediaFn({
          data: {
            itemId,
            base64: ex.base64,
            mime: ex.mime ?? null,
            filename: ex.filename ?? `${safePathPart(itemId)}${ext}`,
          },
        });
        preuploaded.set(itemId, { url: uploaded.url, mime: uploaded.mime ?? ex.mime ?? null, filename: uploaded.filename ?? ex.filename ?? null });
        addZvLog(`Mídia enviada server-side: ${itemId} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
      } catch (upErr: any) {
        const dbg = localMediaDebug(itemId);
        console.error("[zv-import] preupload fail", { itemId, error: upErr, debug: dbg });
        addZvLog(`Falha ao enviar mídia ${itemId}: ${upErr?.message ?? String(upErr)} | debug=${JSON.stringify(dbg).slice(0, 900)}`);
      }
      mediaDone++;
      if (mediaDone % 3 === 0 || mediaDone === mediaTotal) {
        toast.loading(`Enviando mídias ${mediaDone} / ${mediaTotal}…`, { id: t });
        addZvLog(`Mídias verificadas: ${mediaDone} / ${mediaTotal}`);
      }
    }
    addZvLog(`${preuploaded.size} mídia(s) pré-enviadas para o Storage`);

    // Substitui itens no objectsList/etc por versão slim (sem base64)
    const slimItem = (itemId: string, orig: any) => {
      const pu = preuploaded.get(itemId);
      if (!pu) return orig; // sem base64 detectado, envia como estava
      return {
        id: itemId,
        filename: pu.filename ?? orig?.filename ?? orig?.name,
        mimeType: pu.mime ?? orig?.mimeType ?? orig?.mimetype,
        preuploaded_url: pu.url,
        preuploaded_mime: pu.mime,
        preuploaded_filename: pu.filename,
      };
    };

    const pickSlimItem = (itemId: string, idx: Map<string, any>, fallback?: any) => {
      const original = idx.get(itemId) ?? fallback;
      if (!original) return null;
      const pu = preuploaded.get(itemId);
      const item = slimItem(itemId, original);
      return pu ? scrubPayload(item) : item;
    };


    toast.loading(`Importando 0 / ${total} funis…`, { id: t });
    try {
      for (let i = 0; i < allFunnels.length; i += CHUNK) {
        const chunkFunnelsRaw = allFunnels.slice(i, i + CHUNK);
        const chunkFunnels = scrubPayload(chunkFunnelsRaw);
        const chunkIdx = Math.floor(i / CHUNK);
        setZvProgress(`${i} / ${total}`);
        toast.loading(`Importando ${i} / ${total} funis…`, { id: t });
        addZvLog(`Importando funil ${i + 1} de ${total}`);

        const itemIds = new Set<string>();
        for (const f of chunkFunnelsRaw) {
          const seq = Array.isArray(f?.itemsSequence) ? f.itemsSequence : [];
          for (const s of seq) if (s?.itemId) itemIds.add(String(s.itemId));
        }
        const pickSlim = (idx: Map<string, any>, type?: string) => {
          const out: any[] = [];
          for (const id of itemIds) {
            const fallback = type && sequenceIdx.get(id)?.type === type ? sequenceIdx.get(id) : undefined;
            const v = pickSlimItem(id, idx, fallback);
            if (v) out.push(v);
          }
          return out;
        };
        const slimBackup = {
          funnels: chunkFunnels,
          messages: pickSlim(messagesIdx),
          audios: pickSlim(audiosIdx, "audio"),
          medias: pickSlim(mediasIdx, "media"),
          docs: pickSlim(docsIdx, "document"),
          objectsList: pickSlim(objectsIdx),
        };
        addZvLog(`Payload do funil ${i + 1}: ${(JSON.stringify(slimBackup).length / 1024 / 1024).toFixed(2)} MB`);

        try {
          const r: any = await importZvFn({
            data: {
              backup: slimBackup,
              operacao_id: zvOp || null,
              replace: zvReplace && chunkIdx === 0,
              funnelIds: null,
            },
          });
          acc.funnels += r?.funnels ?? 0;
          acc.steps += r?.steps ?? 0;
          acc.uploads += r?.uploads ?? 0;
          if (Array.isArray(r?.errors)) acc.errors.push(...r.errors);
          if (Array.isArray(r?.errors) && r.errors.length > 0) {
            for (const err of r.errors.slice(0, 8)) {
              addZvLog(`Aviso servidor ${err?.item ?? "sem item"}: ${err?.message ?? "erro"}${err?.debug ? ` | debug=${JSON.stringify(err.debug).slice(0, 900)}` : ""}`);
            }
          }
          addZvLog(`Funil ${i + 1} importado: ${r?.funnels ?? 0} fluxo(s), ${r?.steps ?? 0} etapa(s)`);
        } catch (chunkErr: any) {
          console.error("[zv-import] chunk fail", { chunkIdx, error: chunkErr });
          addZvLog(`Erro no funil ${i + 1}: ${chunkErr?.message ?? String(chunkErr)}`);
          for (const f of chunkFunnelsRaw) {
            acc.errors.push({ funnel: f?.name ?? f?.id, message: chunkErr?.message ?? String(chunkErr) });
          }
        }
      }
      setZvSummary(acc);
      addZvLog(`Finalizado: ${acc.funnels} funil(is), ${acc.steps} etapa(s), ${acc.errors.length} erro(s)`);
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
      if (acc.funnels === 0) {
        const firstErr = acc.errors[0]?.message ?? "Nenhum funil foi importado";
        toast.error(`Falhou: ${firstErr}${acc.errors.length > 1 ? ` (+${acc.errors.length - 1} erros)` : ""}`, { id: t });
      } else if (acc.errors.length > 0) {
        toast.success(`Importado: ${acc.funnels} funis · ${acc.steps} etapas · ${acc.uploads} arquivos — ${acc.errors.length} avisos`, { id: t });
      } else {
        toast.success(`Importado: ${acc.funnels} funis · ${acc.steps} etapas · ${acc.uploads} arquivos`, { id: t });
      }
    } catch (e: any) {
      console.error("[zv-import] server fail", e);
      addZvLog(`Erro geral: ${e?.message ?? String(e)}`);
      toast.error(e?.message ?? "Erro ao importar ZapVoice", { id: t });
    } finally {
      setZvProgress("");
    }
  }





  // Fluxos sem operação são considerados "globais" e aparecem em qualquer workspace
  // (importante pra vendedor enxergar fluxos compartilhados).
  const scoped = (flows as any[]).filter((f) =>
    workspace.id === "all" ? true : (!f.operacao_id || f.operacao_id === workspace.id),
  );

  const q = search.trim().toLowerCase();
  const filtered = !q ? scoped : scoped.filter((f: any) => {
    const hay: string[] = [
      String(f?.nome ?? ""),
      String(f?.folder ?? ""),
      String(f?.operacao_id ?? ""),
    ];
    for (const t of (f?.wa_flow_triggers ?? [])) {
      const val = t?.valor == null ? "" : (typeof t.valor === "object" ? JSON.stringify(t.valor) : String(t.valor));
      hay.push(String(t?.tipo ?? ""), val);
    }
    return hay.some((s) => s.toLowerCase().includes(q));
  });

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportCode);
      toast.success("Código copiado!");
    } catch {
      toast.error("Não foi possível copiar — selecione e copie manualmente.");
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Workflow className="h-6 w-6 shrink-0 text-emerald-500" /> <span className="truncate">Fluxos</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Automações conectando blocos. Gatilhos: palavra-chave, nova conversa, etc.
          </p>
        </div>
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-auto">
          <Button variant="outline" size="sm" onClick={() => { setZvSummary(null); setZvOpen(true); }}>
            <FileJson className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Importar ZapVoice</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Importar código</span>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                <Plus className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Novo fluxo</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo fluxo</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Boas-vindas" />
                </div>
                <div className="space-y-1.5">
                  <Label>Operação (opcional)</Label>
                  <Select value={op} onValueChange={setOp}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {workspaces.filter((o) => o.id !== "all").map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Pasta (opcional)</Label>
                  <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Ex.: Onboarding, Recuperação..." />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!name.trim() || createMut.isPending}
                  onClick={() => createMut.mutate({ nome: name.trim(), operacao_id: op || null, folder: folder.trim() || null })}
                >Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Pesquisar fluxos por nome, pasta, operação ou gatilho..."
          className="pr-20"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/40 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={filtered.length > 0 && filtered.every((f: any) => selected.has(f.id))}
            onCheckedChange={(v) => {
              if (v) setSelected(new Set(filtered.map((f: any) => f.id)));
              else clearSel();
            }}
          />
          <span>
            {selected.size > 0
              ? `${selected.size} selecionado${selected.size === 1 ? "" : "s"}`
              : `Selecionar todos os ${filtered.length} filtrado${filtered.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" onClick={clearSel}>Limpar</Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const groups = new Map<string, any[]>();
              for (const f of filtered as any[]) {
                const key = `${String(f?.operacao_id ?? "")}::${String(f?.nome ?? "").trim().toLowerCase()}`;
                if (!key.endsWith("::")) {
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(f);
                }
              }
              const dups: { keep: any; remove: any[] }[] = [];
              for (const arr of groups.values()) {
                if (arr.length < 2) continue;
                // Mantém o mais completo (mais nós) e, em empate, o mais recente.
                const sorted = [...arr].sort((a, b) => {
                  const na = (a?.nodes?.length ?? 0);
                  const nb = (b?.nodes?.length ?? 0);
                  if (nb !== na) return nb - na;
                  const ua = String(a?.updated_at ?? a?.created_at ?? "");
                  const ub = String(b?.updated_at ?? b?.created_at ?? "");
                  return ub.localeCompare(ua);
                });
                dups.push({ keep: sorted[0], remove: sorted.slice(1) });
              }
              if (dups.length === 0) {
                toast.info("Nenhum fluxo duplicado encontrado.");
                return;
              }
              setDupPreview(dups);
              setDupConfirmOpen(true);
            }}
          >
            <Copy className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Apagar duplicados</span>
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selected.size === 0 || bulkDelMut.isPending}
            onClick={() => setBulkConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Apagar selecionados</span>
          </Button>
        </div>
      </div>



      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          Nenhum fluxo criado ainda. Clique em <strong>Novo fluxo</strong> ou <strong>Importar código</strong>.
        </div>
      ) : (
        <FlowsGrouped
          flows={filtered}
          showOp={workspace.id === "all"}
          workspaces={workspaces}
          renderCard={(f: any) => {
            const triggers = f.wa_flow_triggers ?? [];
            return (
              <div key={f.id} className={`border rounded-lg p-4 bg-card transition-colors ${selected.has(f.id) ? "border-emerald-500/70 ring-1 ring-emerald-500/40" : "border-border hover:border-emerald-500/40"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(f.id)}
                      onCheckedChange={() => toggleSel(f.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{f.nome}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(f.nodes?.length ?? 0)} nós · {(f.edges?.length ?? 0)} conexões
                      </p>
                    </div>
                  </div>
                  <Badge className={f.ativo ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                    {f.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {triggers.length === 0 && <Badge variant="outline" className="text-xs">Sem gatilho</Badge>}
                  {triggers.map((t: any) => {
                    const val = t?.valor == null ? "" : (typeof t.valor === "object" ? JSON.stringify(t.valor) : String(t.valor));
                    return (
                      <Badge key={t.id} variant="outline" className="text-xs">
                        {t.tipo === "keyword" ? `🔑 ${val}` : t.tipo === "new_conversation" ? "🆕 Nova conversa" : t.tipo === "any_message" ? "💬 Qualquer msg" : t.tipo === "new_lead" ? "👤 Novo lead" : "✋ Manual"}
                      </Badge>
                    );
                  })}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/flows/$flowId" params={{ flowId: f.id }}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                    </Link>
                  </Button>
                  <Button
                    size="sm" variant="outline" title="Mover para pasta"
                    onClick={() => {
                      const v = prompt("Nome da pasta (vazio = sem pasta):", f.folder ?? "");
                      if (v === null) return;
                      moveFolderMut.mutate({ id: f.id, folder: v.trim() || null });
                    }}
                  >
                    📁
                  </Button>
                  <Button
                    size="sm" variant="outline" title="Duplicar"
                    disabled={dupMut.isPending}
                    onClick={() => dupMut.mutate(f.id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm" variant="outline" title="Exportar código"
                    disabled={exportMut.isPending}
                    onClick={() => exportMut.mutate(f.id)}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm" variant="outline" title={f.ativo ? "Desativar" : "Ativar"}
                    onClick={() => toggleMut.mutate({ id: f.id, ativo: !f.ativo })}
                  >
                    {f.ativo ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm" variant="outline" title="Remover"
                    onClick={() => { if (confirm("Remover fluxo?")) delMut.mutate(f.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          }}
        />
      )}

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Importar fluxo</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Código do fluxo</Label>
              <Textarea
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                placeholder="Cole aqui o código que começa com FLOWV1:..."
                rows={6}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nome (opcional)</Label>
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Deixe em branco para usar o nome original"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Operação</Label>
              <Select value={importOp} onValueChange={setImportOp}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {workspaces.filter((o) => o.id !== "all").map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Se já existir um fluxo com esse nome, será criado como "cópia 1", "cópia 2"... automaticamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button
              disabled={!importCode.trim() || importMut.isPending}
              onClick={() => importMut.mutate({
                code: importCode.trim(),
                operacao_id: importOp || null,
                nome: importName.trim() || null,
              })}
            >
              <Upload className="h-4 w-4 mr-2" /> Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ZapVoice Import Dialog */}
      <Dialog open={zvOpen} onOpenChange={setZvOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-emerald-500" /> Importar backup do ZapVoice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Arquivo .json do ZapVoice</Label>
              <Input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  setZvFile(e.target.files?.[0] ?? null);
                  setZvSummary(null);
                  setZvLogs([]);
                }}
              />
              {zvFile && (
                <p className="text-[11px] text-muted-foreground">
                  {zvFile.name} · {(zvFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Operação (opcional)</Label>
              <Select value={zvOp} onValueChange={setZvOp}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {workspaces.filter((o) => o.id !== "all").map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={zvReplace} onCheckedChange={(v) => setZvReplace(!!v)} />
              Substituir importações anteriores do ZapVoice (apaga fluxos com prefixo [ZV])
            </label>
            <p className="text-xs text-muted-foreground">
              Cada funil vira um fluxo com gatilho manual. Mensagens viram nós de texto, mídias são enviadas para o Storage e linkadas no nó correspondente.
            </p>

            {zvSummary && (
              <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-md p-3 text-sm space-y-1">
                <div>✅ <strong>{zvSummary.funnels}</strong> funis · <strong>{zvSummary.steps}</strong> etapas · <strong>{zvSummary.uploads}</strong> arquivos</div>
                {zvSummary.errors?.length > 0 && (
                  <details className="text-xs text-amber-600 mt-1">
                    <summary>{zvSummary.errors.length} erro(s) — clique para ver</summary>
                    <ul className="mt-1 max-h-40 overflow-auto space-y-0.5 pl-3 list-disc">
                      {zvSummary.errors.slice(0, 60).map((e: any, i: number) => (
                        <li key={i}>
                          {e.funnel ? `[${e.funnel}] ` : ""}{e.item ? `${e.item}: ` : ""}{e.message}
                          {e.debug && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 text-[10px] text-muted-foreground">{JSON.stringify(e.debug, null, 2)}</pre>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {zvLogs.length > 0 && (
              <details open className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-foreground">Logs da importação</summary>
                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap leading-relaxed text-muted-foreground">
                  {zvLogs.join("\n")}
                </pre>
              </details>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZvOpen(false)}>Fechar</Button>
            <Button disabled={!zvFile || !!zvProgress} onClick={runZvImport}>
              {zvProgress
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando {zvProgress}…</>
                : <><Upload className="h-4 w-4 mr-2" /> Importar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Exportar "{exportFlowName}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Copie o código abaixo. Ele pode ser importado em outra operação ou conta.
            </p>
            <Textarea
              readOnly value={exportCode}
              rows={8} className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Fechar</Button>
            <Button onClick={copyExport}>
              <ClipboardCopy className="h-4 w-4 mr-2" /> Copiar código
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <Trash2 className="h-5 w-5" /> Apagar {selected.size} fluxo{selected.size === 1 ? "" : "s"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground pt-2">
            Essa ação não pode ser desfeita. Os fluxos selecionados e seus gatilhos serão removidos.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirmOpen(false)} disabled={bulkDelMut.isPending}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={bulkDelMut.isPending}
              onClick={() => bulkDelMut.mutate(Array.from(selected))}
            >
              {bulkDelMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Apagar {selected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate delete confirmation */}
      <Dialog open={dupConfirmOpen} onOpenChange={setDupConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <Copy className="h-5 w-5" /> Apagar fluxos duplicados?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2 text-sm">
            <p className="text-muted-foreground">
              Encontramos <strong>{dupPreview.reduce((a, g) => a + g.remove.length, 0)}</strong> fluxo(s) duplicado(s)
              em <strong>{dupPreview.length}</strong> grupo(s). Vamos manter apenas <strong>1 versão</strong> de cada
              (a com mais nós, ou a mais recente) e apagar as demais. Essa ação não pode ser desfeita.
            </p>
            <div className="max-h-72 overflow-auto rounded border border-border/60 divide-y divide-border/60">
              {dupPreview.map((g, i) => (
                <div key={i} className="p-2.5 text-xs space-y-1">
                  <div className="font-semibold truncate">{String(g.keep?.nome ?? "")}</div>
                  <div className="text-emerald-500">
                    ✔ Manter: {g.keep?.nodes?.length ?? 0} nós
                  </div>
                  <div className="text-red-500">
                    ✖ Apagar: {g.remove.length} cópia(s) — {g.remove.map((r) => `${r?.nodes?.length ?? 0} nós`).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupConfirmOpen(false)} disabled={bulkDelMut.isPending}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={bulkDelMut.isPending}
              onClick={() => {
                const ids = dupPreview.flatMap((g) => g.remove.map((r: any) => String(r.id)));
                bulkDelMut.mutate(ids);
                setDupConfirmOpen(false);
              }}
            >
              {bulkDelMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Apagar {dupPreview.reduce((a, g) => a + g.remove.length, 0)} duplicado(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}

function FlowsGrouped({
  flows,
  showOp,
  workspaces,
  renderCard,
}: {
  flows: any[];
  showOp: boolean;
  workspaces: { id: string; nome: string; accent?: { hex: string; text: string; ring: string; border: string; bg: string } }[];
  renderCard: (f: any) => any;
}) {
  const opsMap = new Map<string, Map<string, any[]>>();
  for (const f of flows) {
    const opId = String(f.operacao_id ?? "__sem_op__");
    const fld = (f.folder && String(f.folder).trim()) || "__sem_pasta__";
    if (!opsMap.has(opId)) opsMap.set(opId, new Map());
    const fm = opsMap.get(opId)!;
    if (!fm.has(fld)) fm.set(fld, []);
    fm.get(fld)!.push(f);
  }
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const opName = (id: string) => {
    if (id === "__sem_op__") return "Sem operação";
    const w = wsById.get(id);
    return String(w?.nome ?? id);
  };
  const opAccent = (id: string): { hex: string; text: string; ring: string; border: string; bg: string } => {
    const w = wsById.get(id);
    if (w?.accent) return w.accent as any;
    return { hex: "#64748b", text: "text-slate-400", ring: "ring-slate-500/40", border: "border-slate-500/30", bg: "bg-slate-500/10" };
  };

  const opEntries = Array.from(opsMap.entries()).sort((a, b) => opName(a[0]).localeCompare(opName(b[0])));

  return (
    <div className="space-y-6">
      {opEntries.map(([opId, foldersMap]) => {
        const isOperacao = opId !== "__sem_op__";
        const namedFolders = Array.from(foldersMap.entries())
          .filter(([k]) => k !== "__sem_pasta__")
          .sort((a, b) => a[0].localeCompare(b[0]));
        const semPasta = foldersMap.get("__sem_pasta__") ?? [];
        const totalFluxos = Array.from(foldersMap.values()).reduce((a, b) => a + b.length, 0);
        const c = opAccent(opId);
        const nomeOp = opName(opId);
        const initial = nomeOp.charAt(0).toUpperCase();

        return (
          <OperacaoSection
            key={opId}
            opId={opId}
            nomeOp={nomeOp}
            initial={initial}
            hex={c.hex}
            totalFluxos={totalFluxos}
            namedFolders={namedFolders}
            semPasta={semPasta}
            isOperacao={isOperacao}
            showOp={showOp}
            renderCard={renderCard}
          />
        );
      })}
    </div>
  );
}

function OperacaoSection({
  opId, nomeOp, initial, hex, totalFluxos, namedFolders, semPasta, isOperacao, showOp, renderCard,
}: {
  opId: string;
  nomeOp: string;
  initial: string;
  hex: string;
  totalFluxos: number;
  namedFolders: [string, any[]][];
  semPasta: any[];
  isOperacao: boolean;
  showOp: boolean;
  renderCard: (f: any) => any;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const gradient = `linear-gradient(135deg, ${hex}22 0%, ${hex}0a 45%, transparent 100%)`;

  return (
    <section
      className="rounded-2xl border overflow-hidden backdrop-blur-sm"
      style={{ borderColor: `${hex}55`, background: gradient }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 sm:px-7 py-5 sm:py-6 border-b text-left hover:bg-background/30 transition-colors"
        style={{ borderColor: `${hex}33`, backgroundColor: `${hex}14` }}
      >
        <div
          className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-2xl grid place-items-center font-bold text-white text-2xl sm:text-3xl"
          style={{ backgroundColor: hex, boxShadow: `0 6px 20px ${hex}66` }}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <h2
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight truncate leading-tight"
            style={{ color: hex }}
          >
            {nomeOp}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground truncate mt-1">
            {totalFluxos} fluxo{totalFluxos === 1 ? "" : "s"}
            {namedFolders.length > 0 && ` · ${namedFolders.length} pasta${namedFolders.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-sm font-bold tabular-nums"
            style={{ backgroundColor: `${hex}25`, color: hex, border: `1px solid ${hex}55` }}
          >
            {totalFluxos}
          </span>
          <span className="text-muted-foreground text-lg">{collapsed ? "▸" : "▾"}</span>
        </div>
      </button>


      {!collapsed && (
        <div className="p-4 sm:p-5 space-y-6">
          {semPasta.length > 0 && (
            <FolderBlock
              title={isOperacao ? "Diretos" : "Sem operação"}
              items={semPasta}
              hex={hex}
              renderCard={renderCard}
              showLabel={namedFolders.length > 0 || !isOperacao}
              icon={isOperacao ? "📌" : "📂"}
            />
          )}
          {namedFolders.map(([fld, items]) => (
            <FolderBlock
              key={fld}
              title={fld}
              items={items}
              hex={hex}
              renderCard={renderCard}
              showLabel
              icon="📁"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FolderBlock({
  title, items, hex, renderCard, showLabel, icon,
}: {
  title: string;
  items: any[];
  hex: string;
  renderCard: (f: any) => any;
  showLabel: boolean;
  icon: string;
}) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 3;
  const visible = showAll ? items : items.slice(0, LIMIT);
  const hidden = items.length - visible.length;

  return (
    <div className="space-y-3">
      {showLabel && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{open ? "▾" : "▸"}</span>
          <span>{icon} {title}</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
            style={{ backgroundColor: `${hex}20`, color: hex }}
          >
            {items.length}
          </span>
        </button>
      )}
      {open && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {visible.map((f: any) => renderCard(f))}
          </div>
          {items.length > LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm sm:text-base font-bold border-2 border-dashed hover:scale-[1.01] active:scale-[0.99] transition-transform"
              style={{
                color: hex,
                borderColor: `${hex}66`,
                backgroundColor: `${hex}12`,
              }}
            >
              {showAll
                ? "▲  Ver menos"
                : `▼  Ver mais ${hidden} fluxo${hidden === 1 ? "" : "s"}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}


