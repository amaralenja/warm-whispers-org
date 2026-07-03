import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  User,
  Reply,
  X,
  Tag,
  StickyNote,
  ArrowUpDown,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


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
  updateConversationTags,
  updateConversationNotes,
  reactToWhatsappMessage,
} from "@/lib/whatsapp-chat.functions";
import { listFlows, listActiveFlowRuns, triggerFlowManually, cancelFlowRun } from "@/lib/flow-engine.functions";
import { listCrmTags } from "@/lib/crm.functions";
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
  tags?: string[] | null;
  notes?: string | null;
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
  deleted_at?: string | null;
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
  contextWaMessageId?: string;
  replyPreview?: string;
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

// Paleta dark: cada letra tem sua cor pra diferenciar visualmente os contatos
const AVATAR_PALETTE: Record<string, { bg: string; text: string }> = {
  A: { bg: "linear-gradient(135deg,#7c2d12,#431407)", text: "#fdba74" }, // laranja
  B: { bg: "linear-gradient(135deg,#134e4a,#042f2e)", text: "#5eead4" }, // teal
  C: { bg: "linear-gradient(135deg,#1e3a8a,#0c1e4a)", text: "#93c5fd" }, // azul
  D: { bg: "linear-gradient(135deg,#4c1d95,#2e1065)", text: "#c4b5fd" }, // roxo
  E: { bg: "linear-gradient(135deg,#831843,#500724)", text: "#f9a8d4" }, // rosa
  F: { bg: "linear-gradient(135deg,#78350f,#451a03)", text: "#fcd34d" }, // âmbar
  G: { bg: "linear-gradient(135deg,#14532d,#052e16)", text: "#86efac" }, // verde
  H: { bg: "linear-gradient(135deg,#164e63,#083344)", text: "#67e8f9" }, // ciano
  I: { bg: "linear-gradient(135deg,#701a75,#4a044e)", text: "#f0abfc" }, // fúcsia
  J: { bg: "linear-gradient(135deg,#365314,#1a2e05)", text: "#bef264" }, // lime
  K: { bg: "linear-gradient(135deg,#7f1d1d,#450a0a)", text: "#fca5a5" }, // vermelho
  L: { bg: "linear-gradient(135deg,#1e40af,#172554)", text: "#bfdbfe" }, // indigo
  M: { bg: "linear-gradient(135deg,#9a3412,#7c2d12)", text: "#fdba74" }, // laranja escuro
  N: { bg: "linear-gradient(135deg,#0f766e,#134e4a)", text: "#99f6e4" }, // teal claro
  O: { bg: "linear-gradient(135deg,#6b21a8,#3b0764)", text: "#d8b4fe" }, // violeta
  P: { bg: "linear-gradient(135deg,#9d174d,#500724)", text: "#f9a8d4" }, // pink
  Q: { bg: "linear-gradient(135deg,#065f46,#022c22)", text: "#6ee7b7" }, // emerald
  R: { bg: "linear-gradient(135deg,#991b1b,#450a0a)", text: "#fca5a5" }, // rose
  S: { bg: "linear-gradient(135deg,#1e3a8a,#172554)", text: "#93c5fd" }, // sky
  T: { bg: "linear-gradient(135deg,#854d0e,#422006)", text: "#fde047" }, // yellow
  U: { bg: "linear-gradient(135deg,#3730a3,#1e1b4b)", text: "#a5b4fc" }, // indigo
  V: { bg: "linear-gradient(135deg,#166534,#052e16)", text: "#86efac" }, // green
  W: { bg: "linear-gradient(135deg,#155e75,#083344)", text: "#67e8f9" }, // cyan
  X: { bg: "linear-gradient(135deg,#86198f,#4a044e)", text: "#f0abfc" }, // magenta
  Y: { bg: "linear-gradient(135deg,#a16207,#422006)", text: "#fde047" }, // ouro
  Z: { bg: "linear-gradient(135deg,#0369a1,#0c4a6e)", text: "#7dd3fc" }, // azul claro
};
const AVATAR_DEFAULT = { bg: "linear-gradient(135deg,#1f2937,#0f172a)", text: "#cbd5e1" };

function avatarStyle(name?: unknown, fallback?: unknown): CSSProperties {
  const raw = `${toText(name)}|${toText(fallback)}`.trim().toUpperCase();
  if (!raw) return { background: AVATAR_DEFAULT.bg, color: AVATAR_DEFAULT.text };
  // Deterministic hash → pick a palette entry (A-Z)
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  const keys = Object.keys(AVATAR_PALETTE);
  const pick = AVATAR_PALETTE[keys[hash % keys.length]] ?? AVATAR_DEFAULT;
  return { background: pick.bg, color: pick.text };
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

function formatListStamp(iso: unknown) {
  const d = toSafeDate(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString("pt-BR", sameYear ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", year: "2-digit" });
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
  const { workspace, workspaces } = useWorkspace();
  const opBadgeFor = (opId: string | null | undefined) => {
    if (!opId) return null;
    const key = String(opId).toLowerCase();
    const ws = workspaces.find((w) => String(w.id).toLowerCase() === key && w.id !== "all");
    if (!ws) return null;
    return { nome: ws.nome, hex: ws.accent.hex };
  };

  const listConvFn = useServerFn(listConversations);
  const listMsgFn = useServerFn(listMessages);
  const markReadFn = useServerFn(markConversationRead);
  const sendFn = useServerFn(sendWhatsappMessage);
  const downloadMediaFn = useServerFn(downloadIncomingMediaBase64);
  const listChannelsFn = useServerFn(listWhatsappChannels);
  const uploadMediaFn = useServerFn(uploadWhatsappMedia);
  const listFlowsFn = useServerFn(listFlows);
  const triggerFlowFn = useServerFn(triggerFlowManually);
  const updateTagsFn = useServerFn(updateConversationTags);
  const updateNotesFn = useServerFn(updateConversationNotes);
  const reactFn = useServerFn(reactToWhatsappMessage);
  const listAllTagsFn = useServerFn(listCrmTags);
  const { data: allCrmTags = [] } = useQuery<any[]>({
    queryKey: ["chat", "crm-tags", "all"],
    queryFn: async () => {
      const res = await listAllTagsFn({ data: { operacao: "all" } });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 60_000,
  });
  const tagColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of (allCrmTags as any[])) {
      const nome = String(t?.nome ?? "").trim().toLowerCase();
      const cor = String(t?.cor ?? "");
      if (nome && cor) m.set(nome, cor);
    }
    return m;
  }, [allCrmTags]);
  const tagColorFor = (name: string) => tagColorMap.get(String(name || "").trim().toLowerCase()) || "";
  const activeFlowConvIds = useActiveFlowConversationIds();

  const handleReact = async (m: Msg, emoji: string) => {
    if (!active) return;
    // optimistic
    qc.setQueryData(["wa-messages", active.id], (old: unknown) =>
      asArray<Msg>(old).map((x) =>
        x.id === m.id
          ? { ...x, raw: { ...(x.raw as any || {}), reactions: { ...((x.raw as any)?.reactions || {}), mine: emoji || null } } }
          : x,
      ),
    );
    try {
      await reactFn({ data: { conversationId: String(active.id), messageId: String(m.id), emoji } });
    } catch (e: any) {
      toast.error(errorToText(e, "Falha ao reagir"));
      qc.invalidateQueries({ queryKey: ["wa-messages", active.id] });
    }
  };

  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<"all" | "unread" | "flow" | "assigned">("all");

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);

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

  const unreadTotal = useMemo(
    () => conversationList.reduce((acc, c) => acc + (Number((c as any).unread_count ?? 0) > 0 ? 1 : 0), 0),
    [conversationList],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = conversationList;
    if (listFilter === "unread") list = list.filter((c) => Number((c as any).unread_count ?? 0) > 0);
    else if (listFilter === "flow") list = list.filter((c) => activeFlowConvIds.has(String(c.id)));
    else if (listFilter === "assigned") list = list.filter((c) => (c as any).assigned_vendor_id != null);
    if (!q) return list;
    return list.filter((c) =>
      toText(c.contact_name).toLowerCase().includes(q) ||
      toText(c.contact_wa_id).includes(q) ||
      toText(c.last_message_preview).toLowerCase().includes(q)
    );
  }, [conversationList, search, listFilter, activeFlowConvIds]);


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
        raw: { optimistic: true, ...(vars.contextWaMessageId ? { context: { message_id: vars.contextWaMessageId }, reply_preview: vars.replyPreview } : {}) },
        created_at: new Date().toISOString(),
      };
      qc.setQueryData(["wa-messages", vars.conversationId], (old: unknown) => [
        ...asArray<Msg>(old),
        optimistic,
      ]);
      // Optimistically bump this conversation to the top of every cached list
      const nowIso = new Date().toISOString();
      const preview =
        vars.type === "text"
          ? (vars.text ?? "").slice(0, 140)
          : vars.type === "image"
          ? "📷 Imagem"
          : vars.type === "audio"
          ? "🎤 Áudio"
          : vars.type === "video"
          ? "🎬 Vídeo"
          : vars.type === "document"
          ? `📄 ${vars.filename ?? "Documento"}`
          : "Mensagem";
      qc.setQueriesData({ queryKey: ["wa-conversations"] }, (old: unknown) => {
        const arr = asArray<any>(old);
        if (arr.length === 0) return old;
        const idx = arr.findIndex((c) => c?.id === vars.conversationId);
        if (idx < 0) return old;
        const updated = {
          ...arr[idx],
          last_message_at: nowIso,
          last_message_preview: preview,
          last_message_direction: "out",
        };
        const next = arr.slice();
        next.splice(idx, 1);
        next.unshift(updated);
        return next;
      });
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

  function msgQuotePreview(m: Msg): string {
    if (m.text_body) return String(m.text_body).slice(0, 140);
    if (m.caption) return String(m.caption).slice(0, 140);
    switch (m.msg_type) {
      case "image": return "📷 Imagem";
      case "audio": return "🎤 Áudio";
      case "video": return "🎬 Vídeo";
      case "document": return `📄 ${m.media_filename || "Documento"}`;
      case "sticker": return "🎭 Figurinha";
      default: return "Mensagem";
    }
  }

  async function handleSendText() {
    if (!active || !draft.trim()) return;
    const text = draft.trim();
    const reply = replyTo;
    setDraft("");
    setReplyTo(null);
    await sendMut.mutateAsync({
      channelId: active.channel_id,
      conversationId: active.id,
      to: active.contact_wa_id,
      type: "text",
      text,
      contextWaMessageId: reply?.wa_message_id ?? undefined,
      replyPreview: reply ? msgQuotePreview(reply) : undefined,
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
    const res = await downloadMediaFn({ data: { channelId: msg.channel_id, conversationId: msg.conversation_id, mediaId: msg.media_id } });
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
                  <p className="truncate text-xs text-muted-foreground">
                    {unreadTotal > 0
                      ? `${unreadTotal} não visualizada${unreadTotal > 1 ? "s" : ""}`
                      : "Conversas dos números conectados"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadTotal > 0 ? (
                  <span
                    className="grid h-8 min-w-8 place-items-center rounded-full bg-chat-accent px-2 text-xs font-bold text-chat-accent-foreground"
                    title="Leads não visualizados"
                  >
                    {unreadTotal}
                  </span>
                ) : null}
                <Badge variant="outline" className="h-8 rounded-full border-chat-line px-3 text-xs">
                  {workspace.id === "all" ? "Geral" : workspace.nome}
                </Badge>
              </div>
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

            <div className="mt-3 flex flex-wrap gap-1.5">
              {([
                { id: "all", label: "Todos", count: conversationList.length },
                { id: "unread", label: "Não visualizados", count: unreadTotal },
                { id: "flow", label: "Com fluxo", count: activeFlowConvIds.size },
                { id: "assigned", label: "Atribuídos", count: conversationList.filter((c) => (c as any).assigned_vendor_id != null).length },
              ] as const).map((f) => {
                const active = listFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setListFilter(f.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? "border-chat-accent bg-chat-accent text-chat-accent-foreground"
                        : "border-chat-line bg-chat-panel text-muted-foreground hover:bg-chat-soft"
                    }`}
                  >
                    <span>{f.label}</span>
                    {f.count > 0 ? (
                      <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${active ? "bg-chat-accent-foreground/20" : "bg-chat-soft"}`}>
                        {f.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
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
                  const hasActiveFlow = activeFlowConvIds.has(String(c.id));
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
                          <AvatarFallback
                            className="rounded-full"
                            style={avatarStyle(contactName, contactWaId)}
                          >
                            <User className="h-6 w-6 opacity-80" />
                          </AvatarFallback>

                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[15px] font-semibold tracking-normal">
                              {contactName || contactWaId}
                            </span>
                            {(() => {
                              const b = opBadgeFor((c as any).operacao_id);
                              return b ? (
                                <span
                                  className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                  style={{ color: b.hex, borderColor: `${b.hex}55`, backgroundColor: `${b.hex}1a` }}
                                  title={`Operação: ${b.nome}`}
                                >
                                  {b.nome}
                                </span>
                              ) : null;
                            })()}
                            {hasActiveFlow ? (
                              <span
                                title="Fluxo sendo disparado"
                                className="relative inline-flex h-2.5 w-2.5 shrink-0"
                              >
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chat-accent opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-chat-accent" />
                              </span>
                            ) : null}
                          </div>

                          {(() => {
                            const tags = Array.isArray((c as any).tags) ? ((c as any).tags as string[]).filter(Boolean) : [];
                            if (tags.length === 0) return null;
                            const shown = tags.slice(0, 3);
                            const extra = tags.length - shown.length;
                            return (
                              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                                {shown.map((t) => {
                                  const cor = tagColorFor(t);
                                  const style: CSSProperties = cor
                                    ? { backgroundColor: `${cor}1a`, borderColor: `${cor}66`, color: cor }
                                    : {};
                                  return (
                                    <span key={t} style={style} className={`max-w-[110px] truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cor ? "" : "border-chat-accent/40 bg-chat-accent/10 text-chat-accent"}`}>
                                      {t}
                                    </span>
                                  );
                                })}
                                {extra > 0 ? (
                                  <span className="rounded-full border border-chat-line px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    +{extra}
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()}

                          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            {c.last_message_direction === "out" && (
                              <PreviewStatusTick status={c.last_message_status} />
                            )}
                            <span className="truncate">{preview || "Sem prévia"}</span>
                          </div>

                        </div>
                        <div className="flex h-12 shrink-0 flex-col items-end justify-between gap-1">
                          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                            {formatListStamp(c.last_message_at)}
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
                    <AvatarFallback
                      className="rounded-2xl"
                      style={avatarStyle(active.contact_name, active.contact_wa_id)}
                    >
                      <User className="h-7 w-7 opacity-80" />
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
                      {(() => {
                        const b = opBadgeFor((active as any).operacao_id);
                        return b ? (
                          <span
                            className="inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                            style={{ color: b.hex, borderColor: `${b.hex}66`, backgroundColor: `${b.hex}1f` }}
                            title={`Operação: ${b.nome}`}
                          >
                            {b.nome}
                          </span>
                        ) : null;
                      })()}

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
                <ConversationMetaControls
                  key={active.id}
                  conv={active}
                  onSaveTags={async (tags) => {
                    try {
                      await updateTagsFn({ data: { conversationId: active.id, tags } });
                      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
                      toast.success("Etiquetas atualizadas");
                    } catch (e) {
                      toast.error(errorToText(e, "Falha ao salvar etiquetas"));
                    }
                  }}
                  onSaveNotes={async (notes) => {
                    try {
                      await updateNotesFn({ data: { conversationId: active.id, notes } });
                      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
                      toast.success("Nota salva");
                    } catch (e) {
                      toast.error(errorToText(e, "Falha ao salvar nota"));
                    }
                  }}
                />
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
                    const ctxId = (m.raw as any)?.context?.message_id ?? null;
                    const quoted = ctxId ? messageList.find((x) => x.wa_message_id === ctxId) ?? null : null;
                    return (
                      <div key={String(m.id)}>
                        {showDate && (
                          <div className="my-5 flex justify-center">
                            <span className="rounded-full border border-chat-line bg-chat-panel px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                              {formatDateLabel(m.created_at)}
                            </span>
                          </div>
                        )}
                        <MessageBubble msg={m} mediaState={mediaCache[String(m.id)]} onLoadMedia={() => loadMedia(m)} onMediaSettled={scrollToBottom} onReply={(mm) => setReplyTo(mm)} onReact={(mm, emoji) => handleReact(mm, emoji)} quotedFrom={quoted} />
                      </div>
                    );
                  })}

                </div>
              </div>

              <footer className="shrink-0 border-t border-chat-line bg-chat-panel px-5 py-4">
                {replyTo && (
                  <div className="mx-auto mb-2 flex max-w-5xl items-center gap-3 rounded-xl border border-chat-line bg-chat-thread px-3 py-2">
                    <div className={`h-10 w-1 rounded-full ${replyTo.direction === "out" ? "bg-chat-accent" : "bg-emerald-400"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-chat-accent">
                        Respondendo a {replyTo.direction === "out" ? "você" : "cliente"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{msgQuotePreview(replyTo)}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:bg-chat-soft" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
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

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function MessageBubble({ msg, mediaState, onLoadMedia, onMediaSettled, onReply, onReact, quotedFrom }: { msg: Msg; mediaState?: MediaState; onLoadMedia: () => void; onMediaSettled?: () => void; onReply?: (m: Msg) => void; onReact?: (m: Msg, emoji: string) => void; quotedFrom?: Msg | null }) {
  const isOut = msg.direction === "out";
  const isInteractive = msg.msg_type === "interactive" || msg.msg_type === "button";
  const body = isInteractive ? "" : toText(msg.text_body);
  const caption = toText(msg.caption);
  const quotedPreview = toText((msg.raw as any)?.reply_preview);
  const quotedFromOut = quotedFrom ? quotedFrom.direction === "out" : undefined;
  const myReaction = toText((msg.raw as any)?.reactions?.mine);
  const theirReaction = toText((msg.raw as any)?.reactions?.theirs);

  const reactionBar = onReact ? (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 self-center rounded-full text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-chat-soft" aria-label="Reagir">
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={isOut ? "end" : "start"} side="top" className="w-auto rounded-full border-chat-line bg-popover p-1">
        <div className="flex items-center gap-1">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onReact(msg, myReaction === e ? "" : e)}
              className={`rounded-full px-2 py-1 text-xl transition hover:bg-chat-soft ${myReaction === e ? "bg-chat-soft" : ""}`}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  ) : null;

  const menu = onReply ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 self-center rounded-full text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-chat-soft" aria-label="Opções da mensagem">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isOut ? "end" : "start"} className="w-56 rounded-2xl border-chat-line bg-popover">
        {onReply && (
          <DropdownMenuItem onClick={() => onReply(msg)}>
            <Reply className="mr-2 h-4 w-4" /> Responder
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <div className={`group flex w-full ${isOut ? "justify-end" : "justify-start"}`}>
      <div className={`relative flex max-w-[min(80%,760px)] items-start gap-1 ${isOut ? "flex-row" : "flex-row"}`}>
        {isOut && (<>{menu}{reactionBar}</>)}
        <div className="relative min-w-0">
          <div
            className={`inline-block max-w-full overflow-hidden rounded-2xl border px-4 py-3 break-words ${
              isOut
                ? "border-chat-accent/35 bg-chat-message-out text-chat-message-out-foreground rounded-br-lg"
                : "border-chat-line bg-chat-message-in text-foreground rounded-bl-lg"
            }`}
          >
            {(quotedPreview || quotedFrom) && (
              <div className={`mb-2 rounded-lg border-l-4 px-3 py-2 text-xs ${quotedFromOut === false ? "border-chat-accent bg-black/20" : "border-emerald-400 bg-black/20"}`}>
                <div className="font-semibold opacity-80">
                  {quotedFrom ? (quotedFrom.direction === "out" ? "Você" : "Cliente") : "Mensagem"}
                </div>
                <div className="mt-0.5 truncate opacity-90">
                  {quotedPreview || (quotedFrom ? (quotedFrom.text_body || quotedFrom.caption || quotedFrom.msg_type) : "")}
                </div>
              </div>
            )}
            <MediaContent msg={msg} mediaState={mediaState} onLoadMedia={onLoadMedia} onMediaSettled={onMediaSettled} outgoing={isOut} />
            {body && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{body}</p>}
            {caption && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed opacity-90">{caption}</p>}
            <div className={`mt-2 flex items-center justify-end gap-1 text-[11px] font-medium tabular-nums ${isOut ? "opacity-75" : "text-muted-foreground"}`}>
              <span>{formatTime(msg.created_at)}</span>
              {isOut && <StatusTick status={msg.status} />}
            </div>
          </div>
          {(myReaction || theirReaction) && (
            <div className={`absolute -bottom-3 ${isOut ? "right-3" : "left-3"} flex gap-1`}>
              {theirReaction && (
                <span className="rounded-full border border-chat-line bg-chat-panel px-2 py-0.5 text-sm shadow">{theirReaction}</span>
              )}
              {myReaction && (
                <span className="rounded-full border border-chat-line bg-chat-panel px-2 py-0.5 text-sm shadow">{myReaction}</span>
              )}
            </div>
          )}
        </div>
        {!isOut && (<>{reactionBar}{menu}</>)}
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


function TimerCountdown({ expiresAt }: { expiresAt: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  if (!expiresAt) return null;
  const target = new Date(expiresAt).getTime();
  if (!Number.isFinite(target)) return null;
  const diff = Math.max(0, Math.floor((target - now) / 1000));
  const mm = Math.floor(diff / 60);
  const ss = diff % 60;
  const label = mm > 0 ? `${mm}m ${String(ss).padStart(2, "0")}s` : `${ss}s`;
  return (
    <span className="font-mono text-[10px] font-semibold text-chat-accent">
      {diff > 0 ? `⏱ ${label}` : "⏱ liberando…"}
    </span>
  );
}

function ActiveFlowRuns({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const listActiveRunsFn = useServerFn(listActiveFlowRuns);
  const cancelRunFn = useServerFn(cancelFlowRun);
  const { data: runs = [] } = useQuery({
    queryKey: ["flow-runs-active", conversationId],
    queryFn: () => listActiveRunsFn({ data: { conversationId } }),
    refetchInterval: 4000,
  });
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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

  async function handleCancel(runId: string) {
    if (!confirm("Parar este fluxo? O lead não vai receber as próximas mensagens.")) return;
    setCancellingId(runId);
    try {
      qc.setQueryData(["flow-runs-active", conversationId], (old: unknown) =>
        asArray<any>(old).filter((r) => String(r?.id) !== String(runId)),
      );
      const result = await cancelRunFn({ data: { runId, conversationId } });
      toast.success("Fluxo parado");
      if (Number((result as any)?.cancelled ?? 0) > 0) {
        qc.invalidateQueries({ queryKey: ["flow-runs-active", conversationId] });
        qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      } else {
        qc.setQueryData(["flow-runs-active", conversationId], []);
      }
    } catch (e: any) {
      qc.invalidateQueries({ queryKey: ["flow-runs-active", conversationId] });
      toast.error(e?.message ?? "Falha ao parar fluxo");
    } finally {
      setCancellingId(null);
    }
  }

  if (!asArray<any>(runs).length) return null;

  return (
    <div className="shrink-0 border-b border-chat-line bg-chat-soft/40 px-6 py-2">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
        {asArray<any>(runs).map((r) => {
          const name = String(r.flow_nome ?? "Fluxo");
          const step = r.current_node_id ? String(r.current_node_id).slice(0, 8) : "início";
          const isTimer = r.status === "waiting" && r.waiting_for === "timer";
          const statusLabel =
            r.status === "queued"
              ? "na fila"
              : r.status === "waiting"
                ? `aguardando ${r.waiting_for ?? ""}`
                : "executando";
          const runId = String(r.id);
          const isCancelling = cancellingId === runId;
          return (
            <div
              key={runId}
              className="inline-flex items-center gap-2 rounded-full border border-chat-line bg-chat-panel px-3 py-1 text-xs"
            >
              <Loader2 className="h-3 w-3 animate-spin text-chat-accent" />
              <span className="font-semibold text-foreground">{name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{statusLabel}</span>
              {isTimer && r.expires_at ? (
                <>
                  <span className="text-muted-foreground">·</span>
                  <TimerCountdown expiresAt={r.expires_at} />
                </>
              ) : null}
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-[10px] text-muted-foreground">etapa {step}</span>
              <button
                type="button"
                onClick={() => handleCancel(runId)}
                disabled={isCancelling}
                title="Parar fluxo"
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useActiveFlowConversationIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const { data } = await supabase
          .from("wa_flow_runs" as any)
          .select("conversation_id, status")
          .in("status", ["queued", "running", "waiting"])
          .limit(500);
        if (cancelled) return;
        const next = new Set<string>();
        for (const r of (data as any[]) ?? []) {
          if (r?.conversation_id) next.add(String(r.conversation_id));
        }
        setIds(next);
      } catch {
        // ignore — RLS may block for some roles
      }
    }
    refresh();
    const ch = supabase
      .channel("chat-list-active-flows")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_flow_runs" },
        () => refresh(),
      )
      .subscribe();
    const iv = setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      supabase.removeChannel(ch);
    };
  }, []);

  return ids;
}

function flowOrderStorageKey(vendorId: number | string | null | undefined, op: string | null | undefined) {
  const v = vendorId == null || vendorId === "" ? "admin" : String(vendorId);
  const o = op == null || op === "" ? "all" : String(op);
  return `chat:flow-order:${v}:${o}`;
}

function loadFlowOrder(vendorId: number | string | null | undefined, op: string | null | undefined): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(flowOrderStorageKey(vendorId, op));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveFlowOrder(vendorId: number | string | null | undefined, op: string | null | undefined, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(flowOrderStorageKey(vendorId, op), JSON.stringify(ids));
  } catch {}
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
  const [reorderOpen, setReorderOpen] = useState(false);
  const vendorSession = useMemo(() => getVendorSession(), []);
  const vendorKey = vendorSession?.id ?? "admin";
  const opKey = conversation.operacao_id ?? "all";

  const [orderIds, setOrderIds] = useState<string[]>(() => loadFlowOrder(vendorKey, opKey));

  useEffect(() => {
    setOrderIds(loadFlowOrder(vendorKey, opKey));
  }, [vendorKey, opKey]);

  const { data: flows = [] } = useQuery({
    queryKey: ["flows-for-dispatch"],
    queryFn: () => listFlowsFn(),
    staleTime: 30_000,
  });

  const compatibleAll = useMemo(() => {
    const op = conversation.operacao_id;
    return asArray<any>(flows).filter((f) => {
      if (f?.ativo === false) return false;
      if (!f.operacao_id) return true;
      if (!op) return true;
      return f.operacao_id === op;
    });
  }, [flows, conversation.operacao_id]);

  const sortedCompatible = useMemo(() => {
    const idx = new Map<string, number>();
    orderIds.forEach((id, i) => idx.set(id, i));
    return [...compatibleAll].sort((a, b) => {
      const ai = idx.has(String(a.id)) ? (idx.get(String(a.id)) as number) : Number.MAX_SAFE_INTEGER;
      const bi = idx.has(String(b.id)) ? (idx.get(String(b.id)) as number) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return toText(a.nome).localeCompare(toText(b.nome));
    });
  }, [compatibleAll, orderIds]);

  const compatible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return sortedCompatible;
    return sortedCompatible.filter((f) =>
      toText(f.nome).toLowerCase().includes(term) ||
      toText(f.folder).toLowerCase().includes(term)
    );
  }, [sortedCompatible, q]);

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

  function handleSaveOrder(newIds: string[]) {
    setOrderIds(newIds);
    saveFlowOrder(vendorKey, opKey, newIds);
    toast.success("Ordem dos fluxos salva");
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
        <span className="shrink-0 px-1 text-[11px] text-muted-foreground">
          {compatible.length} fluxo{compatible.length === 1 ? "" : "s"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setReorderOpen(true)}
          disabled={compatibleAll.length < 2}
          className="h-9 shrink-0 gap-1.5 rounded-xl border border-chat-line px-3 text-xs"
          title="Reordenar fluxos (só pra você)"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Ordenar
        </Button>
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
                {f.folder ? (
                  <div className="truncate text-[10px] text-muted-foreground">📁 {toText(f.folder)}</div>
                ) : null}
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
              Tem certeza que deseja disparar o fluxo <span className="font-semibold text-foreground">"{toText(confirm?.nome)}"</span> nesta conversa?
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

      <FlowReorderDialog
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        flows={sortedCompatible}
        onSave={handleSaveOrder}
      />
    </div>
  );
}

function FlowReorderDialog({
  open,
  onOpenChange,
  flows,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  flows: any[];
  onSave: (ids: string[]) => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setItems(flows.map((f) => ({ ...f, _id: String(f.id) })));
      setSearch("");
    }
  }, [open, flows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filteredIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items.map((f) => f._id);
    return items
      .filter((f) => toText(f.nome).toLowerCase().includes(term) || toText(f.folder).toLowerCase().includes(term))
      .map((f) => f._id);
  }, [items, search]);

  function move(fromId: string, toIndex: number) {
    setItems((prev) => {
      const from = prev.findIndex((f) => f._id === fromId);
      if (from < 0) return prev;
      const clamped = Math.max(0, Math.min(toIndex, prev.length - 1));
      return arrayMove(prev, from, clamped);
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const from = prev.findIndex((f) => f._id === String(active.id));
      const to = prev.findIndex((f) => f._id === String(over.id));
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  const visibleSet = new Set(filteredIds);
  const displayed = items.filter((f) => visibleSet.has(f._id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reordenar fluxos</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Arraste pela alça <GripVertical className="inline h-3 w-3" /> ou use os botões de posição. Essa ordem é só sua — não afeta outros atendentes.
          </p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fluxo…"
            className="h-9 rounded-xl"
          />
          <div className="max-h-[55vh] overflow-y-auto scrollbar-fancy rounded-xl border border-chat-line bg-chat-panel/40 p-2">
            {displayed.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Nenhum fluxo</div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={displayed.map((f) => f._id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-1">
                    {displayed.map((f, i) => (
                      <SortableFlowRow
                        key={f._id}
                        id={f._id}
                        index={items.findIndex((x) => x._id === f._id)}
                        total={items.length}
                        nome={toText(f.nome) || "Fluxo sem nome"}
                        folder={toText(f.folder)}
                        onTop={() => move(f._id, 0)}
                        onBottom={() => move(f._id, items.length - 1)}
                        onUp={() => {
                          const idx = items.findIndex((x) => x._id === f._id);
                          if (idx > 0) move(f._id, idx - 1);
                        }}
                        onDown={() => {
                          const idx = items.findIndex((x) => x._id === f._id);
                          if (idx < items.length - 1) move(f._id, idx + 1);
                        }}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              onSave(items.map((f) => f._id));
              onOpenChange(false);
            }}
          >
            Salvar ordem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableFlowRow({
  id,
  index,
  total,
  nome,
  folder,
  onTop,
  onBottom,
  onUp,
  onDown,
}: {
  id: string;
  index: number;
  total: number;
  nome: string;
  folder: string;
  onTop: () => void;
  onBottom: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-chat-line bg-chat-thread px-2 py-1.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-chat-soft active:cursor-grabbing"
        title="Arrastar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-8 shrink-0 text-center text-[10px] text-muted-foreground">#{index + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{nome}</div>
        {folder ? <div className="truncate text-[10px] text-muted-foreground">📁 {folder}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onTop} disabled={index === 0}>Topo</Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onUp} disabled={index === 0}>↑</Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onDown} disabled={index === total - 1}>↓</Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onBottom} disabled={index === total - 1}>Fim</Button>
      </div>
    </li>
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

function ConversationMetaControls({
  conv,
  onSaveTags,
  onSaveNotes,
}: {
  conv: Conv;
  onSaveTags: (tags: string[]) => Promise<void> | void;
  onSaveNotes: (notes: string) => Promise<void> | void;
}) {
  const initialTags = Array.isArray(conv.tags) ? conv.tags.filter(Boolean) : [];
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagSearch, setTagSearch] = useState("");
  const [notes, setNotes] = useState<string>(conv.notes ?? "");
  const [savingTags, setSavingTags] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const listTagsFn = useServerFn(listCrmTags);
  const operacao = (conv as any)?.operacao_id || "all";
  const { data: crmTags = [] } = useQuery<any[]>({
    queryKey: ["chat", "crm-tags", operacao],
    queryFn: async () => {
      const res = await listTagsFn({ data: { operacao } });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 60_000,
  });

  const toggleTag = async (name: string) => {
    const t = String(name || "").trim();
    if (!t) return;
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t].slice(0, 50);
    setTags(next);
    setSavingTags(true);
    try { await onSaveTags(next); } finally { setSavingTags(false); }
  };
  const removeTag = async (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    setSavingTags(true);
    try { await onSaveTags(next); } finally { setSavingTags(false); }
  };
  const saveNotes = async () => {
    setSavingNotes(true);
    try { await onSaveNotes(notes); } finally { setSavingNotes(false); }
  };

  const q = tagSearch.trim().toLowerCase();
  const filteredCrmTags = (crmTags || []).filter((t: any) => {
    const nome = String(t?.nome ?? "");
    return !q || nome.toLowerCase().includes(q);
  });

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-10 gap-2 rounded-full border border-chat-line px-3 text-xs">
            <Tag className="h-4 w-4" /> Etiquetas
            {tags.length > 0 ? (
              <span className="rounded-full bg-chat-accent/20 px-1.5 text-[10px] font-semibold text-chat-accent">{tags.length}</span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 border-chat-line bg-chat-panel p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etiquetas do contato</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tags.length === 0 ? (
              <span className="text-xs text-muted-foreground">Nenhuma etiqueta ainda.</span>
            ) : tags.map((t) => {
              const found = (crmTags as any[]).find((x: any) => String(x?.nome ?? "").toLowerCase() === t.toLowerCase());
              const cor = String(found?.cor ?? "");
              const style = cor ? { backgroundColor: `${cor}1a`, borderColor: `${cor}66`, color: cor } : undefined;
              return (
                <span key={t} style={style} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cor ? "" : "border-chat-accent/40 bg-chat-accent/10 text-chat-accent"}`}>
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                    aria-label={`Remover ${t}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
          <Input
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="Buscar etiqueta..."
            className="h-9 border-chat-line bg-chat-soft text-sm"
          />
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {filteredCrmTags.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Nenhuma etiqueta cadastrada. Crie etiquetas na aba CRM Leads X1.
              </div>
            ) : filteredCrmTags.map((t: any) => {
              const nome = String(t?.nome ?? "");
              const cor = String(t?.cor ?? "#3b82f6");
              const active = tags.includes(nome);
              return (
                <button
                  key={String(t?.id ?? nome)}
                  type="button"
                  onClick={() => void toggleTag(nome)}
                  disabled={savingTags}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${active ? "border-chat-accent/60 bg-chat-accent/10" : "border-chat-line hover:bg-chat-soft"}`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cor }} />
                  <span className="flex-1 truncate">{nome}</span>
                  {active ? <span className="text-[10px] font-semibold text-chat-accent">✓</span> : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>


      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-10 gap-2 rounded-full border border-chat-line px-3 text-xs">
            <StickyNote className="h-4 w-4" /> Nota
            {(conv.notes ?? "").trim().length > 0 ? (
              <span className="h-1.5 w-1.5 rounded-full bg-chat-accent" />
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 border-chat-line bg-chat-panel p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anotações internas</div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Escreva observações sobre este contato..."
            className="min-h-[140px] border-chat-line bg-chat-soft text-sm"
          />
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={saveNotes} disabled={savingNotes}>
              {savingNotes ? "Salvando..." : "Salvar nota"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

