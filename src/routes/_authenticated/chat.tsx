import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  Mic,
  Search,
  Check,
  CheckCheck,
  Clock,
  MessagesSquare,
  Download,
  Smile,
  Zap,
  Radio,
  Headphones,
  Loader2,
  MoreVertical,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { getVendorSession } from "@/lib/vendor-session";
import {
  listConversations,
  listMessages,
  markConversationRead,
  sendWhatsappMessage,
  downloadIncomingMediaBase64,
  transferConversation,
  listVendorsForChannel,
  listWhatsappChannels,
  uploadWhatsappMedia,
} from "@/lib/whatsapp-chat.functions";
import { listFlows, listActiveFlowRuns, triggerFlowManually } from "@/lib/flow-engine.functions";
import { WhatsappAudioPlayer } from "@/components/whatsapp-audio-player";
import { WhatsappRecorder } from "@/components/whatsapp-recorder";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { ChatErrorBoundary } from "@/components/chat-error-boundary";

function ChatRoute() {
  return (
    <ChatErrorBoundary>
      <ChatPage />
    </ChatErrorBoundary>
  );
}

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatRoute,
});

type Conv = {
  id: string;
  channel_id: string;
  contact_wa_id: string;
  contact_name: string | null;
  operacao_id: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_direction: string | null;
  last_message_status: string | null;
  unread_count: number;
};

type Msg = {
  id: string;
  conversation_id: string;
  channel_id: string;
  wa_message_id: string | null;
  direction: "in" | "out";
  msg_type: string;
  text_body: string | null;
  media_id: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_filename: string | null;
  caption: string | null;
  status: string | null;
  raw: any;
  created_at: string;
};

type SendVars = {
  channelId: string;
  conversationId: string;
  to: string;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker";
  text?: string;
  mediaUrl?: string;
  filename?: string;
  caption?: string;
};

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const data = (value as any).data;
    const rows = (value as any).rows;
    const items = (value as any).items;
    if (Array.isArray(data)) return data as T[];
    if (Array.isArray(rows)) return rows as T[];
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

// Garante que renderizamos só string (algumas mensagens antigas guardaram objeto em text_body/caption).
function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const anyV = v as Record<string, unknown>;
    for (const key of ["body", "text", "message", "error", "name", "nome", "caption", "value", "id"]) {
      const candidate = anyV[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
      if (typeof candidate === "number" || typeof candidate === "boolean") return String(candidate);
    }
    try {
      const json = JSON.stringify(v);
      return json && json !== "{}" ? json : "";
    } catch {
      return "";
    }
  }
  return String(v);
}

function errorToText(error: unknown, fallback = "Erro inesperado"): string {
  const direct = toText((error as any)?.message ?? error);
  return direct || fallback;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function initials(name: unknown, fallback: unknown) {
  const n = (toText(name) || toText(fallback) || "?").trim();
  return n
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function toSafeDate(value: unknown) {
  const text = toText(value);
  const date = new Date(text || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatTime(iso: unknown) {
  const d = toSafeDate(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(iso: unknown) {
  const d = toSafeDate(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Hoje";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

function StatusTick({ status }: { status: string | null }) {
  if (status === "failed") return <span className="text-[10px] font-bold text-destructive">erro</span>;
  if (status === "pending") return <Clock className="h-3.5 w-3.5 text-white/70" />;
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 drop-shadow-sm" style={{ color: "#7ec8ff" }} strokeWidth={3} />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-white/90" strokeWidth={2.5} />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-white/90" strokeWidth={2.5} />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

function PreviewStatusTick({ status }: { status: string | null }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 shrink-0 drop-shadow-sm" style={{ color: "#7ec8ff" }} strokeWidth={3} />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 shrink-0 text-white/85" strokeWidth={2.5} />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 shrink-0 text-white/85" strokeWidth={2.5} />;
  return <Clock className="h-3.5 w-3.5 shrink-0 text-white/60" />;
}

function ChatPage() {
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const listConvFn = useServerFn(listConversations);
  const listMsgFn = useServerFn(listMessages);
  const markReadFn = useServerFn(markConversationRead);
  const sendFn = useServerFn(sendWhatsappMessage);
  const downloadMediaFn = useServerFn(downloadIncomingMediaBase64);
  const listChannelsFn = useServerFn(listWhatsappChannels);
  const uploadMediaFn = useServerFn(uploadWhatsappMedia);
  const listFlowsFn = useServerFn(listFlows);
  const triggerFlowFn = useServerFn(triggerFlowManually);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = imageInputRef; // legacy alias
  const [pendingType, setPendingType] = useState<"image" | "video" | "document" | "audio">("image");
  const [mediaCache, setMediaCache] = useState<Record<string, { url?: string; mime?: string; loading?: boolean; error?: string }>>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string; type: "image" | "video" | "document" } | null>(null);
  const [previewCaption, setPreviewCaption] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  const [vendorSessionTick, setVendorSessionTick] = useState(0);
  useEffect(() => {
    const refresh = () => setVendorSessionTick((v) => v + 1);
    window.addEventListener("storage", refresh);
    window.addEventListener("vendor-session-updated", refresh as EventListener);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("vendor-session-updated", refresh as EventListener);
    };
  }, []);

  // Se for sessão de vendedor, filtra só as conversas atribuídas/liberadas pra ele.
  const vendorSession = useMemo(() => getVendorSession(), [vendorSessionTick]);
  const vendorId = vendorSession?.id ?? null;
  // Vendedor já é filtrado pelos canais/operação permitidos no server function.
  // Não manda o workspace atual como filtro aqui porque muitas conversas antigas
  // estão sem operacao_id preenchido; isso fazia a Amanda ver o chat zerado.
  const opFilter = vendorSession ? undefined : workspace.id === "all" ? undefined : workspace.id;

  const { data: convs = [], error: convsError } = useQuery({
    queryKey: ["wa-conversations", opFilter ?? "all", vendorId ?? "admin"],
    queryFn: () => listConvFn({ data: { operacaoId: opFilter, vendorId } }),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  // Canais conectados (pra mostrar de qual número está sendo atendido cada lead)
  const { data: channels = [], error: channelsError } = useQuery({
    queryKey: ["wa-channels-display", vendorId ?? "admin"],
    queryFn: () => listChannelsFn(),
    staleTime: 60_000,
  });
  const channelList = useMemo(() => asArray<any>(channels), [channels]);
  const channelById = useMemo(() => {
    const m = new Map<string, { label: string; phone: string }>();
    for (const c of channelList) {
      const id = toText(c?.id);
      if (!id) continue;
      const phone = c?.display_phone_number ? `+${String(c.display_phone_number).replace(/\D/g, "")}` : "";
      const label = toText(c?.verified_name) || toText(c?.name) || phone || id;
      m.set(id, { label, phone });
    }
    return m;
  }, [channelList]);

  // Realtime: refresh conv list when new conversation/message lands
  useEffect(() => {
    const ch = supabase
      .channel("wa-conv-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages" }, (payload) => {
        const m = payload.new as any;
        qc.invalidateQueries({ queryKey: ["wa-conversations"] });
        qc.invalidateQueries({ queryKey: ["wa-messages", m.conversation_id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wa_messages" }, (payload) => {
        const m = payload.new as any;
        qc.invalidateQueries({ queryKey: ["wa-conversations"] });
        if (m?.conversation_id) qc.invalidateQueries({ queryKey: ["wa-messages", m.conversation_id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const conversationList = useMemo(() => asArray<Conv>(convs), [convs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = conversationList;
    if (!q) return list;
    return list.filter((c) =>
      toText(c.contact_name).toLowerCase().includes(q) ||
      toText(c.contact_wa_id).includes(q) ||
      toText(c.last_message_preview).toLowerCase().includes(q)
    );
  }, [conversationList, search]);

  const active = conversationList.find((c) => String(c.id) === activeId) ?? null;


  const { data: messages = [], error: messagesError } = useQuery({
    queryKey: ["wa-messages", activeId],
    queryFn: () => activeId ? listMsgFn({ data: { conversationId: activeId } }) : Promise.resolve([]),
    enabled: !!activeId,
    refetchInterval: activeId ? 3000 : false,
    refetchOnWindowFocus: true,
  });

  const messageList = useMemo(() => asArray<Msg>(messages), [messages]);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
      requestAnimationFrame(() => {
        const latest = scrollRef.current;
        if (latest) latest.scrollTop = latest.scrollHeight;
      });
    });
  }

  // Auto-scroll to bottom when messages change or conversation opens
  const messagesLen = messageList.length;
  useEffect(() => {
    scrollToBottom();
    const timer = window.setTimeout(scrollToBottom, 120);
    return () => {
      window.clearTimeout(timer);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesLen, activeId]);

  // Mark read when opening a conv (depend só em activeId + unread_count pra não loopar com a referência recalculada de `active`)
  const unreadForActive = active?.unread_count ?? 0;
  useEffect(() => {
    if (!activeId || unreadForActive <= 0) return;
    markReadFn({ data: { conversationId: activeId } }).then(() => {
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, unreadForActive]);

  const sendMut = useMutation({
    mutationFn: (vars: SendVars) => sendFn({ data: vars }),
    onMutate: async (vars) => {
      setSendError(null);
      await qc.cancelQueries({ queryKey: ["wa-messages", vars.conversationId] });
      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: Msg = {
        id: optimisticId,
        conversation_id: vars.conversationId,
        channel_id: vars.channelId,
        wa_message_id: null,
        direction: "out",
        msg_type: vars.type,
        text_body: vars.type === "text" ? vars.text ?? "" : null,
        media_id: null,
        media_url: vars.type !== "text" ? vars.mediaUrl ?? null : null,
        media_mime: null,
        media_filename: vars.filename ?? null,
        caption: vars.caption ?? null,
        status: "pending",
        raw: { optimistic: true },
        created_at: new Date().toISOString(),
      };
      qc.setQueryData(["wa-messages", vars.conversationId], (old: unknown) => [
        ...asArray<Msg>(old),
        optimistic,
      ]);
      window.setTimeout(scrollToBottom, 0);
      return { optimisticId, conversationId: vars.conversationId };
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["wa-messages", activeId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
    onError: (e: any, _vars, ctx) => {
      const msg = errorToText(e, "Erro ao enviar");
      setSendError(msg);
      toast.error(msg);
      if (ctx?.conversationId && ctx.optimisticId) {
        qc.setQueryData(["wa-messages", ctx.conversationId], (old: unknown) =>
          asArray<Msg>(old).map((m) =>
            m.id === ctx.optimisticId ? { ...m, status: "failed", raw: { error: msg } } : m,
          ),
        );
      }
      qc.invalidateQueries({ queryKey: ["wa-messages", activeId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
  });

  async function handleSendText() {
    if (!active || !draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    await sendMut.mutateAsync({
      channelId: active.channel_id,
      conversationId: active.id,
      to: active.contact_wa_id,
      type: "text",
      text,
    }).catch(() => undefined);
  }

  async function handleFileUpload(file: File, opts?: { type?: typeof pendingType; caption?: string }) {
    if (!active) return;
    const type = opts?.type ?? pendingType;
    const caption = opts?.caption ?? "";
    toast.loading("Enviando mídia…", { id: "wa-media-upload" });
    try {
      const uploaded = await uploadMediaFn({ data: {
        channelId: active.channel_id,
        conversationId: active.id,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        base64: await fileToBase64(file),
      }});
      sendMut.mutate({
        channelId: active.channel_id,
        conversationId: active.id,
        to: active.contact_wa_id,
        type,
        mediaUrl: uploaded.signedUrl,
        filename: file.name,
        caption: caption.trim() || undefined,
      });
    } catch (e: any) {
      toast.error(errorToText(e, "Upload falhou"));
    } finally {
      toast.dismiss("wa-media-upload");
    }
  }

  function openPreviewOrSend(file: File, typeOverride?: typeof pendingType) {
    const type = typeOverride ?? pendingType;
    if (type === "audio") {
      handleFileUpload(file, { type });
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ file, url, type });
    setPreviewCaption("");
  }

  function confirmPreviewSend() {
    if (!preview) return;
    handleFileUpload(preview.file, { type: preview.type, caption: previewCaption });
    URL.revokeObjectURL(preview.url);
    setPreview(null);
    setPreviewCaption("");
  }

  function cancelPreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setPreviewCaption("");
  }

  async function downloadMedia(msg: Msg) {
    if (!msg.media_id) throw new Error("Mídia sem ID");
    const res = await downloadMediaFn({ data: { channelId: msg.channel_id, mediaId: msg.media_id } });
    return {
      url: `data:${res.mime};base64,${res.base64}`,
      mime: res.mime,
    };
  }

  async function loadMedia(msg: Msg, opts?: { silent?: boolean }) {
    if (!msg.media_id) return;
    const cached = mediaCache[msg.id];
    if (cached?.url || cached?.loading) return;
    setMediaCache((prev) => ({ ...prev, [msg.id]: { ...prev[msg.id], loading: true, error: undefined } }));
    try {
      const res = await downloadMedia(msg);
      setMediaCache((prev) => ({ ...prev, [msg.id]: { url: res.url, mime: res.mime, loading: false } }));
    } catch (e: any) {
      const error = errorToText(e, "Não foi possível carregar a mídia");
      // Em mensagens recentes (webhook ainda processando), não mostra erro — só mantém loading silencioso
      if (opts?.silent) {
        setMediaCache((prev) => ({ ...prev, [msg.id]: { ...prev[msg.id], loading: false } }));
      } else {
        setMediaCache((prev) => ({ ...prev, [msg.id]: { ...prev[msg.id], loading: false, error } }));
        toast.error("Erro ao baixar mídia: " + error);
      }
    }
  }

  useEffect(() => {
    const list = messageList;
    const now = Date.now();
    for (const msg of list) {
      if (
        !msg.media_url &&
        msg.media_id &&
        (msg.msg_type === "image" || msg.msg_type === "audio" || msg.msg_type === "video" || msg.msg_type === "sticker") &&
        !mediaCache[msg.id]?.url &&
        !mediaCache[msg.id]?.loading &&
        !mediaCache[msg.id]?.error
      ) {
        // Aguarda 8s pra mensagens novas — webhook ainda pode estar baixando/uploadando
        const ageMs = now - toSafeDate(msg.created_at).getTime();
        if (ageMs < 8000) continue;
        loadMedia(msg, { silent: ageMs < 30000 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageList]);


  return (
    <div className="h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-chat-shell text-foreground">
      <div className="grid h-full min-h-0 grid-cols-[380px_minmax(0,1fr)] overflow-hidden bg-chat-thread">


        <aside className="flex min-h-0 flex-col border-r border-chat-line bg-chat-sidebar">
          <div className="shrink-0 border-b border-chat-line p-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-chat-soft text-chat-accent">
                  <MessagesSquare className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold tracking-normal">Chat ao Vivo</h2>
                  <p className="truncate text-xs text-muted-foreground">Conversas dos números conectados</p>
                </div>
              </div>
              <Badge variant="outline" className="h-8 rounded-full border-chat-line px-3 text-xs">
                {workspace.id === "all" ? "Geral" : workspace.nome}
              </Badge>
            </div>

            <div className="relative mt-5">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contato ou mensagem"
                className="h-12 rounded-2xl border-chat-line bg-chat-panel pl-11 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-chat-accent"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-fancy">
            {convsError || channelsError ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
                {errorToText(convsError ?? channelsError, "Falha ao carregar conversas do WhatsApp")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Nenhuma conversa ainda. Mensagens recebidas no WhatsApp conectado aparecem aqui.
              </div>
            ) : (
              <div>
                {filtered.map((c) => {
                  const contactWaId = toText(c.contact_wa_id);
                  const contactName = toText(c.contact_name);
                  const isActive = String(c.id) === activeId;
                  const preview = toText(c.last_message_preview);
                  return (
                    <div
                      key={String(c.id)}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveId(String(c.id))}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveId(String(c.id)); }}
                      className={`group relative w-full cursor-pointer border-b border-chat-line px-4 py-3.5 text-left transition-colors ${
                        isActive ? "bg-chat-soft" : "hover:bg-chat-panel"
                      }`}
                    >
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                        <Avatar className="h-12 w-12 shrink-0 rounded-full border border-chat-line">
                          <AvatarFallback className="rounded-full bg-chat-soft text-sm font-bold text-chat-accent">
                            {initials(contactName, contactWaId)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[15px] font-semibold tracking-normal">
                              {contactName || contactWaId}
                            </span>
                          </div>
                          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            {c.last_message_direction === "out" && (
                              <PreviewStatusTick status={c.last_message_status} />
                            )}
                            <span className="truncate">{preview || "Sem prévia"}</span>
                          </div>
                        </div>
                        <div className="flex h-12 shrink-0 flex-col items-end justify-between gap-1">
                          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                            {formatTime(c.last_message_at)}
                          </span>
                          {Number(c.unread_count ?? 0) > 0 ? (
                            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-chat-accent px-2 text-xs font-bold text-chat-accent-foreground">
                              {Number(c.unread_count ?? 0)}
                            </span>
                          ) : (
                            <span className={`h-2 w-2 rounded-full ${isActive ? "bg-chat-accent" : "bg-transparent"}`} />
                          )}
                        </div>
                      </div>
                      <div
                        className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <ConversationActionsMenu
                          conversationId={String(c.id)}
                          channelId={toText(c.channel_id)}
                          currentVendorId={(c as any).assigned_vendor_id ?? null}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-chat-thread">
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-chat-line bg-chat-panel text-chat-accent">
                  <Headphones className="h-9 w-9" />
                </div>
                <p className="text-lg font-semibold text-foreground">Selecione uma conversa</p>
                <p className="mt-1 text-sm">O histórico abre aqui com mídia, áudio e disparo de fluxo.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-chat-line bg-chat-panel/80 px-6 py-4 backdrop-blur">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar className="h-14 w-14 shrink-0 rounded-2xl border border-chat-line">
                    <AvatarFallback className="rounded-2xl bg-chat-soft text-base font-bold text-chat-accent">
                      {initials(active.contact_name, active.contact_wa_id)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="truncate text-lg font-semibold tracking-normal">
                        {toText(active.contact_name) || toText(active.contact_wa_id)}
                      </h3>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-chat-line bg-chat-soft px-2.5 py-1 text-[11px] font-medium text-chat-accent">
                        <Radio className="h-3 w-3" /> ativo
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{toText(active.contact_wa_id)}</p>
                    {(() => {
                      const ch = channelById.get(active.channel_id);
                      if (!ch) return null;
                      return (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          <span className="opacity-70">Atendido por:</span>{" "}
                          <span className="font-medium text-foreground">{ch.label}</span>
                          {ch.phone && ch.phone !== ch.label ? <span className="ml-1 opacity-70">({ch.phone})</span> : null}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </header>

              <ActiveFlowRuns conversationId={active.id} />
              <WindowCountdown lastInboundAt={
                [...messageList].reverse().find((m) => m.direction === "in")?.created_at ?? null
              } />




              <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-y-auto bg-chat-thread px-6 py-6 scrollbar-fancy"
              >
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
                  {messagesError ? (
                    <div className="my-8 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm font-semibold text-destructive">
                      {errorToText(messagesError, "Falha ao carregar mensagens desta conversa")}
                    </div>
                  ) : messageList.map((m, i, arr) => {
                    const prev = arr[i - 1];
                    const showDate = !prev || toSafeDate(prev.created_at).toDateString() !== toSafeDate(m.created_at).toDateString();
                    return (
                      <div key={String(m.id)}>
                        {showDate && (
                          <div className="my-5 flex justify-center">
                            <span className="rounded-full border border-chat-line bg-chat-panel px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                              {formatDateLabel(m.created_at)}
                            </span>
                          </div>
                        )}
                        <MessageBubble msg={m} mediaState={mediaCache[String(m.id)]} onLoadMedia={() => loadMedia(m)} onMediaSettled={scrollToBottom} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <footer className="shrink-0 border-t border-chat-line bg-chat-panel px-5 py-4">
                <div className="mx-auto flex max-w-5xl items-end gap-3 rounded-2xl border border-chat-line bg-chat-thread p-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-12 w-12 shrink-0 rounded-2xl text-muted-foreground hover:bg-chat-soft hover:text-chat-accent" aria-label="Emojis">
                        <Smile className="h-5 w-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" side="top" className="w-auto border-0 bg-transparent p-0 shadow-xl">
                      <EmojiPicker
                        onEmojiClick={(emoji) => setDraft((d) => d + emoji.emoji)}
                        theme={Theme.AUTO}
                        emojiStyle={EmojiStyle.NATIVE}
                        searchPlaceholder="Buscar emoji"
                        skinTonesDisabled
                        previewConfig={{ showPreview: false }}
                        height={400}
                        width={340}
                      />
                    </PopoverContent>
                  </Popover>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-12 w-12 shrink-0 rounded-2xl text-muted-foreground hover:bg-chat-soft hover:text-chat-accent">
                        <Paperclip className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52 rounded-2xl border-chat-line bg-popover">
                      <DropdownMenuItem onClick={() => { setPendingType("image"); imageInputRef.current?.click(); }}>
                        <ImageIcon className="mr-2 h-4 w-4" /> Imagem
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setPendingType("video"); videoInputRef.current?.click(); }}>
                        <Video className="mr-2 h-4 w-4" /> Vídeo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setPendingType("document"); docInputRef.current?.click(); }}>
                        <FileText className="mr-2 h-4 w-4" /> Documento
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <input ref={imageInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { openPreviewOrSend(f, "image"); } e.target.value = ""; }} />
                  <input ref={videoInputRef} type="file" className="hidden" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { openPreviewOrSend(f, "video"); } e.target.value = ""; }} />
                  <input ref={docInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { openPreviewOrSend(f, "document"); } e.target.value = ""; }} />
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendText();
                      }
                    }}
                    placeholder="Digite uma mensagem"
                    rows={1}
                    className="max-h-36 min-h-12 flex-1 resize-none border-0 bg-transparent px-1 py-3 text-[15px] shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0"
                  />
                  {sendError && (
                    <div className="max-w-72 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                      {toText(sendError)}
                    </div>
                  )}
                  {draft.trim() ? (
                    <Button
                      size="icon"
                      className="h-12 w-12 shrink-0 rounded-2xl bg-chat-accent text-chat-accent-foreground hover:bg-chat-accent/90"
                      onClick={handleSendText}
                      disabled={sendMut.isPending}
                    >
                      {sendMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    </Button>
                  ) : (
                    <WhatsappRecorder
                      disabled={sendMut.isPending}
                      onSend={(file: File) => handleFileUpload(file, { type: "audio" })}
                    />
                  )}
                </div>
                <FlowInlineBar
                  conversation={active}
                  listFlowsFn={listFlowsFn}
                  triggerFn={triggerFlowFn}
                />
              </footer>
            </>
          )}
        </main>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) cancelPreview(); }}>
          <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {preview?.type === "image" ? "Enviar imagem" : preview?.type === "video" ? "Enviar vídeo" : "Enviar documento"}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="flex max-h-[50vh] items-center justify-center overflow-hidden rounded-xl bg-muted/40">
                {preview.type === "image" ? (
                  <img src={preview.url} alt="preview" className="max-h-[50vh] w-auto object-contain" />
                ) : preview.type === "video" ? (
                  <video src={preview.url} controls className="max-h-[50vh] w-full" />
                ) : (
                  <div className="flex w-full items-center gap-3 p-4">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{preview.file.name}</p>
                      <p className="text-xs text-muted-foreground">{(preview.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                )}
              </div>
              {preview.type !== "document" || true ? (
                <Textarea
                  value={previewCaption}
                  onChange={(e) => setPreviewCaption(e.target.value)}
                  placeholder="Adicionar legenda (opcional)"
                  rows={2}
                  className="resize-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      confirmPreviewSend();
                    }
                  }}
                />
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={cancelPreview}>Cancelar</Button>
            <Button onClick={confirmPreviewSend} disabled={sendMut.isPending}>
              {sendMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type MediaState = { url?: string; mime?: string; loading?: boolean; error?: string };

function MessageBubble({ msg, mediaState, onLoadMedia, onMediaSettled }: { msg: Msg; mediaState?: MediaState; onLoadMedia: () => void; onMediaSettled?: () => void }) {
  const isOut = msg.direction === "out";
  const isInteractive = msg.msg_type === "interactive" || msg.msg_type === "button";
  const body = isInteractive ? "" : toText(msg.text_body);
  const caption = toText(msg.caption);

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(74%,760px)] overflow-hidden rounded-2xl border px-4 py-3 ${
          isOut
            ? "border-chat-accent/35 bg-chat-message-out text-chat-message-out-foreground rounded-br-lg"
            : "border-chat-line bg-chat-message-in text-foreground rounded-bl-lg"
        }`}
      >
        <MediaContent msg={msg} mediaState={mediaState} onLoadMedia={onLoadMedia} onMediaSettled={onMediaSettled} outgoing={isOut} />
        {body && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{body}</p>}
        {caption && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed opacity-90">{caption}</p>}
        <div className={`mt-2 flex items-center justify-end gap-1 text-[11px] font-medium tabular-nums ${isOut ? "opacity-75" : "text-muted-foreground"}`}>
          <span>{formatTime(msg.created_at)}</span>
          {isOut && <StatusTick status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

function MediaContent({ msg, mediaState, onLoadMedia, onMediaSettled, outgoing }: { msg: Msg; mediaState?: MediaState; onLoadMedia: () => void; onMediaSettled?: () => void; outgoing?: boolean }) {
  if (msg.msg_type === "text") return null;
  if (msg.msg_type === "interactive" || msg.msg_type === "button") {
    return <InteractiveContent msg={msg} outgoing={outgoing} />;
  }

  // Preferimos sempre media_url (já baixado pelo webhook e salvo no bucket wa-media).
  if (msg.media_url) {
    return <RenderMedia type={msg.msg_type} url={msg.media_url} mime={msg.media_mime} filename={msg.media_filename} outgoing={outgoing} onMediaSettled={onMediaSettled} />;
  }
  // Fallback: mensagens antigas que só têm media_id — baixa sob demanda via Meta proxy.
  if (msg.media_id) {
    if (mediaState?.error) {
      return <MediaPlaceholder type={msg.msg_type} filename={msg.media_filename} error={mediaState.error} onRetry={onLoadMedia} outgoing={outgoing} />;
    }
    if (mediaState?.url) {
      return <RenderMedia type={msg.msg_type} url={mediaState.url} mime={mediaState.mime ?? msg.media_mime} filename={msg.media_filename} outgoing={outgoing} onMediaSettled={onMediaSettled} />;
    }
    if (mediaState?.loading) {
      return <MediaPlaceholder type={msg.msg_type} filename={msg.media_filename} loading outgoing={outgoing} />;
    }
    if (msg.msg_type === "document") {
      return (
        <button
          type="button"
          onClick={onLoadMedia}
          className="mb-1 flex min-w-64 items-center gap-3 rounded-2xl border border-chat-line bg-background/25 px-4 py-3 text-sm font-medium transition hover:bg-background/40"
        >
          <Download className="h-5 w-5" /> {msg.media_filename || "Baixar documento"}
        </button>
      );
    }
    return <MediaPlaceholder type={msg.msg_type} filename={msg.media_filename} loading onRetry={onLoadMedia} outgoing={outgoing} />;
  }
  return <MediaPlaceholder type={msg.msg_type} filename={msg.media_filename} outgoing={outgoing} />;
}

function InteractiveContent({ msg, outgoing }: { msg: Msg; outgoing?: boolean }) {
  const raw: any = msg.raw ?? {};
  const interactive = raw.interactive ?? {};
  // Outbound: buttons we sent
  const sentButtons: Array<{ id: string; title: string }> = Array.isArray(interactive?.action?.buttons)
    ? interactive.action.buttons.map((b: any) => ({
        id: String(b?.reply?.id ?? b?.id ?? ""),
        title: String(b?.reply?.title ?? b?.title ?? ""),
      }))
    : [];
  const bodyText = toText(interactive?.body?.text ?? msg.text_body);
  // Outbound CTA URL
  const ctaUrl: { display_text?: string; url?: string } | null =
    interactive?.type === "cta_url" ? (interactive?.action?.parameters ?? null) : null;
  // Inbound: button_reply
  const reply = interactive?.button_reply ?? interactive?.list_reply ?? raw?.button ?? null;
  const replyText = reply ? toText(reply.title ?? reply.text ?? reply.payload) : "";

  if (ctaUrl?.url) {
    return (
      <div className="mb-1 space-y-2">
        {bodyText && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{bodyText}</p>}
        <a href={ctaUrl.url} target="_blank" rel="noreferrer"
          className={`block rounded-xl px-3 py-2 text-center text-sm font-semibold underline ${outgoing ? "bg-background/15 text-current" : "bg-chat-soft text-chat-accent"}`}>
          🔗 {ctaUrl.display_text || "Abrir link"}
        </a>
      </div>
    );
  }
  if (sentButtons.length > 0) {
    return (
      <div className="mb-1 space-y-2">
        {bodyText && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{bodyText}</p>}
        <div className="flex flex-col gap-1 border-t border-current/20 pt-2">
          {sentButtons.map((b, i) => (
            <div key={b.id || i} className={`rounded-xl px-3 py-2 text-center text-sm font-semibold ${outgoing ? "bg-background/15 text-current" : "bg-chat-soft text-chat-accent"}`}>
              {b.title || "Botão"}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (replyText) {
    return (
      <div className="mb-1 inline-flex items-center gap-2 rounded-xl border border-current/25 bg-background/10 px-3 py-1.5 text-xs font-semibold">
        ↩ {replyText}
      </div>
    );
  }
  return null;
}


function MediaPlaceholder({
  type,
  filename,
  loading,
  error,
  onRetry,
  outgoing,
}: {
  type: string;
  filename: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  outgoing?: boolean;
}) {
  const safeType = toText(type);
  const safeFilename = toText(filename);
  const icon = safeType === "image" || safeType === "sticker"
    ? <ImageIcon className="h-5 w-5" />
    : safeType === "video"
      ? <Video className="h-5 w-5" />
      : safeType === "audio"
        ? <Mic className="h-5 w-5" />
        : <FileText className="h-5 w-5" />;
  const label = safeType === "image" ? "Imagem"
    : safeType === "sticker" ? "Figurinha"
    : safeType === "video" ? "Vídeo"
    : safeType === "audio" ? "Áudio"
    : safeFilename || "Documento";

  return (
    <div className={`mb-1 min-w-[280px] rounded-2xl border p-4 text-sm ${outgoing ? "border-chat-accent/25 bg-background/10" : "border-chat-line bg-background/25"}`}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-chat-soft text-chat-accent">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{loading ? "Carregando mídia…" : label}</div>
          {loading && <div className="mt-0.5 text-xs opacity-70">Processando arquivo recebido</div>}
        </div>
      </div>
      {error && (
        <p className="mt-3 break-words rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {error.includes("Meta token")
            ? "O EvoHub recebeu a mídia, mas esse canal está sem token Meta ativo. Reabra/reconecte o número na EvoHub."
            : error}
        </p>
      )}
      {!loading && onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-full border border-chat-line px-3 py-1.5 text-xs font-semibold transition hover:bg-chat-soft">
          Tentar carregar
        </button>
      )}
    </div>
  );
}

function RenderMedia({
  type, url, mime, filename, outgoing, onMediaSettled,
}: { type: string; url: string; mime: string | null; filename: string | null; outgoing?: boolean; onMediaSettled?: () => void }) {
  const safeType = toText(type);
  const safeUrl = toText(url);
  const safeFilename = toText(filename);
  if (safeType === "image" || safeType === "sticker") {
    return (
      <img
        src={safeUrl}
        alt={safeFilename || (safeType === "sticker" ? "Figurinha recebida" : "Imagem recebida")}
        loading="lazy"
        onLoad={onMediaSettled}
        className={`mb-2 block rounded-2xl border border-chat-line object-contain ${safeType === "sticker" ? "max-h-44 max-w-44 bg-transparent p-2" : "max-h-[420px] max-w-full"}`}
      />
    );
  }
  if (safeType === "video") {
    return <video src={safeUrl} controls onLoadedMetadata={onMediaSettled} className="mb-2 max-h-[420px] max-w-full rounded-2xl border border-chat-line" />;
  }
  if (safeType === "audio") {
    return <WhatsappAudioPlayer url={safeUrl} outgoing={outgoing} />;
  }
  if (safeType === "document") {
    return (
      <a href={safeUrl} download={safeFilename || "documento"} className="mb-1 flex min-w-72 items-center gap-3 rounded-2xl border border-chat-line bg-background/25 px-4 py-3 text-sm font-semibold transition hover:bg-background/40">
        <FileText className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{safeFilename || "Documento"}</span>
        <Download className="h-4 w-4 shrink-0" />
      </a>
    );
  }
  return null;
}

function WindowCountdown({ lastInboundAt }: { lastInboundAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);
  if (!lastInboundAt) {
    return (
      <div className="shrink-0 border-b border-chat-line bg-chat-soft/40 px-6 py-2">
        <div className="mx-auto w-full max-w-5xl text-xs font-medium text-amber-500">
          ⚠️ Janela de 24h fechada — aguardando primeira mensagem do lead
        </div>
      </div>
    );
  }
  const closeAt = new Date(lastInboundAt).getTime() + 24 * 60 * 60 * 1000;
  const ms = closeAt - now;
  const open = ms > 0;
  const h = Math.max(0, Math.floor(ms / 3_600_000));
  const m = Math.max(0, Math.floor((ms % 3_600_000) / 60_000));
  const pct = Math.max(0, Math.min(100, (ms / (24 * 60 * 60 * 1000)) * 100));
  const tone = !open ? "text-red-500" : h < 2 ? "text-red-500" : h < 6 ? "text-amber-500" : "text-emerald-500";
  const bar = !open ? "bg-red-500" : h < 2 ? "bg-red-500" : h < 6 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="shrink-0 border-b border-chat-line bg-chat-soft/40 px-6 py-2">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
        <span className={`text-xs font-semibold ${tone}`}>
          {open ? `⏱️ Janela 24h: ${h}h ${m}m restantes` : "⛔ Janela 24h fechada"}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-chat-line">
          <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}


function ActiveFlowRuns({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const listActiveRunsFn = useServerFn(listActiveFlowRuns);
  const { data: runs = [] } = useQuery({
    queryKey: ["flow-runs-active", conversationId],
    queryFn: () => listActiveRunsFn({ data: { conversationId } }),
    refetchInterval: 4000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`flow-runs-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_flow_runs", filter: `conversation_id=eq.${conversationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["flow-runs-active", conversationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  if (!asArray<any>(runs).length) return null;

  return (
    <div className="shrink-0 border-b border-chat-line bg-chat-soft/40 px-6 py-2">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
        {asArray<any>(runs).map((r) => {
          const name = String(r.flow_nome ?? "Fluxo");
          const step = r.current_node_id ? String(r.current_node_id).slice(0, 8) : "início";
          const statusLabel =
            r.status === "queued" ? "na fila" : r.status === "waiting" ? `aguardando ${r.waiting_for ?? ""}` : "executando";
          return (
            <div
              key={String(r.id)}
              className="inline-flex items-center gap-2 rounded-full border border-chat-line bg-chat-panel px-3 py-1 text-xs"
            >
              <Loader2 className="h-3 w-3 animate-spin text-chat-accent" />
              <span className="font-semibold text-foreground">{name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{statusLabel}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-[10px] text-muted-foreground">etapa {step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FlowInlineBar({
  conversation,
  listFlowsFn,
  triggerFn,
}: {
  conversation: Conv;
  listFlowsFn: any;
  triggerFn: any;
}) {
  const [q, setQ] = useState("");
  const [firing, setFiring] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; nome: string } | null>(null);

  const { data: flows = [] } = useQuery({
    queryKey: ["flows-for-dispatch"],
    queryFn: () => listFlowsFn(),
    staleTime: 30_000,
  });

  const compatible = useMemo(() => {
    const op = conversation.operacao_id;
    const list = asArray<any>(flows).filter((f) => {
      if (f?.ativo === false) return false;
      if (!f.operacao_id) return true;
      if (!op) return true;
      return f.operacao_id === op;
    });
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((f) =>
      toText(f.nome).toLowerCase().includes(term) ||
      toText(f.folder).toLowerCase().includes(term)
    );
  }, [flows, conversation.operacao_id, q]);

  function fire(flowId: string) {
    setFiring(flowId);
    toast.success("Fluxo disparado, rodando em segundo plano");
    Promise.resolve(
      triggerFn({
        data: {
          flow_id: flowId,
          channel_id: conversation.channel_id,
          contact_wa_id: conversation.contact_wa_id,
          conversation_id: conversation.id,
        },
      }),
    )
      .catch((e: any) => toast.error(errorToText(e, "Erro ao disparar fluxo")))
      .finally(() => setFiring(null));
  }

  return (
    <div className="mx-auto mt-3 w-full max-w-5xl space-y-2">
      <div className="flex items-center gap-2 rounded-2xl border border-chat-line bg-chat-thread p-2">
        <div className="relative flex-1">
          <Zap className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-chat-accent" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar fluxo pelo nome ou pasta…"
            className="h-10 rounded-xl border-0 bg-transparent pl-9 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <span className="shrink-0 px-2 text-[11px] text-muted-foreground">
          {compatible.length} fluxo{compatible.length === 1 ? "" : "s"}
        </span>
      </div>
      {compatible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-chat-line bg-chat-panel/50 px-3 py-4 text-center text-xs text-muted-foreground">
          Nenhum fluxo encontrado
        </div>
      ) : (
        <div
          className="flex gap-2 overflow-x-auto scrollbar-fancy pb-2 cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            const el = e.currentTarget;
            const startX = e.pageX - el.offsetLeft;
            const startScroll = el.scrollLeft;
            const move = (ev: MouseEvent) => {
              el.scrollLeft = startScroll - (ev.pageX - el.offsetLeft - startX);
            };
            const up = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        >
          {compatible.map((f: any) => (
            <button
              key={String(f.id)}
              type="button"
              disabled={firing === f.id}
              onClick={() => setConfirm({ id: String(f.id), nome: toText(f.nome) || "Fluxo sem nome" })}
              className="group flex shrink-0 items-center gap-2 rounded-xl border border-chat-line bg-chat-panel px-3 py-2 text-left transition hover:border-chat-accent hover:bg-chat-soft disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5 shrink-0 text-chat-accent" />
              <div className="min-w-0 max-w-[200px]">
                <div className="truncate text-xs font-medium">{toText(f.nome) || "Fluxo sem nome"}</div>
                {f.folder && (
                  <div className="truncate text-[10px] text-muted-foreground">📁 {toText(f.folder)}</div>
                )}
              </div>
              {firing === f.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
            </button>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o: boolean) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disparar fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja disparar o fluxo <span className="font-semibold text-foreground">"{confirm?.nome}"</span> nesta conversa?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) fire(confirm.id);
                setConfirm(null);
              }}
            >
              Disparar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}



function FlowDispatcher({
  conversation,
  listFlowsFn,
  triggerFn,
}: {
  conversation: Conv;
  listFlowsFn: any;
  triggerFn: any;
}) {
  const [open, setOpen] = useState(false);
  const [firing, setFiring] = useState<string | null>(null);

  const { data: flows = [] } = useQuery({
    queryKey: ["flows-for-dispatch"],
    queryFn: () => listFlowsFn(),
    enabled: open,
  });

  const compatible = useMemo(() => {
    const op = conversation.operacao_id;
    return asArray<any>(flows).filter((f) => {
      if (f?.ativo === false) return false;
      // Coerente com a operação: fluxo sem operação roda em qualquer; com operação só na mesma
      if (!f.operacao_id) return true;
      if (!op) return true;
      return f.operacao_id === op;
    });
  }, [flows, conversation.operacao_id]);

  function fire(flowId: string) {
    setFiring(flowId);
    toast.success("Fluxo disparado, rodando em segundo plano");
    setOpen(false);
    // Fire-and-forget: não bloqueia a UI, usuário pode navegar pra outras conversas
    Promise.resolve(
      triggerFn({
        data: {
          flow_id: flowId,
          channel_id: conversation.channel_id,
          contact_wa_id: conversation.contact_wa_id,
          conversation_id: conversation.id,
        },
      }),
    )
      .catch((e: any) => {
        toast.error(errorToText(e, "Erro ao disparar fluxo"));
      })
      .finally(() => setFiring(null));
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-11 rounded-2xl border-chat-line bg-chat-thread px-4 font-semibold hover:bg-chat-soft">
          <Zap className="mr-2 h-4 w-4 text-chat-accent" />
          Disparar fluxo
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-2xl border-chat-line bg-popover p-2">
        {compatible.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            Nenhum fluxo ativo compatível com esta operação.
          </div>
        ) : (
          compatible.map((f: any) => (
            <DropdownMenuItem
              key={f.id}
              disabled={firing === f.id}
              onSelect={(e) => { e.preventDefault(); fire(f.id); }}
              className="flex items-start gap-3 rounded-xl p-3"
            >
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-chat-accent" />
              <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{toText(f.nome) || "Fluxo sem nome"}</div>
                {f.operacao_id && (
                    <div className="text-[10px] text-muted-foreground">Operação: {toText(f.operacao_id)}</div>
                )}
              </div>
              {firing === f.id && <span className="text-[10px] text-muted-foreground">…</span>}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConversationActionsMenu({
  conversationId,
  channelId,
  currentVendorId,
}: {
  conversationId: string;
  channelId: string;
  currentVendorId: number | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const listVendorsFn = useServerFn(listVendorsForChannel);
  const transferFn = useServerFn(transferConversation);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["chat-transfer-vendors", channelId],
    queryFn: () => listVendorsFn({ data: { channelId } }),
    enabled: open && !!channelId,
    staleTime: 30_000,
  });

  const transfer = async (vendorId: number | null) => {
    try {
      await transferFn({ data: { conversationId, vendorId } });
      toast.success(vendorId ? "Lead transferido" : "Lead liberado");
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    } catch (e: any) {
      toast.error(`Falha ao transferir: ${errorToText(e, "erro")}`);
    } finally {
      setOpen(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-full bg-chat-panel/90 text-muted-foreground hover:text-foreground"
          aria-label="Mais ações"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-2xl border-chat-line bg-popover">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <UserCog className="h-3.5 w-3.5" /> Transferir para
        </div>
        {isLoading ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Carregando…</div>
        ) : !Array.isArray(vendors) || vendors.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum vendedor vinculado a este canal.</div>
        ) : (
          (vendors as Array<{ id: number; nome: string }>).map((v) => (
            <DropdownMenuItem
              key={v.id}
              disabled={v.id === currentVendorId}
              onSelect={(e) => { e.preventDefault(); transfer(v.id); }}
              className="rounded-xl"
            >
              {toText(v.nome)}
              {v.id === currentVendorId && <span className="ml-auto text-[10px] text-muted-foreground">atual</span>}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); transfer(null); }}
          className="rounded-xl text-destructive focus:text-destructive"
        >
          Liberar (sem vendedor)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
