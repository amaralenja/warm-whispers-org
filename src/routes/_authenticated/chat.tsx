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
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import {
  listConversations,
  listMessages,
  markConversationRead,
  sendWhatsappMessage,
  downloadIncomingMediaBase64,
} from "@/lib/whatsapp-chat.functions";
import { listFlows, triggerFlowManually } from "@/lib/flow-engine.functions";
import { WhatsappAudioPlayer } from "@/components/whatsapp-audio-player";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
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

function initials(name: string | null | undefined, fallback: string) {
  const n = (name || fallback || "?").trim();
  return n
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Garante que renderizamos só string (algumas mensagens antigas guardaram objeto em text_body/caption).
function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const anyV = v as any;
    if (typeof anyV.body === "string") return anyV.body;
    if (typeof anyV.text === "string") return anyV.text;
    return "";
  }
  return String(v);
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Hoje";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

function StatusTick({ status }: { status: string | null }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-chat-accent" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

function ChatPage() {
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const listConvFn = useServerFn(listConversations);
  const listMsgFn = useServerFn(listMessages);
  const markReadFn = useServerFn(markConversationRead);
  const sendFn = useServerFn(sendWhatsappMessage);
  const downloadMediaFn = useServerFn(downloadIncomingMediaBase64);
  const listFlowsFn = useServerFn(listFlows);
  const triggerFlowFn = useServerFn(triggerFlowManually);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<"image" | "video" | "document" | "audio">("image");
  const [mediaCache, setMediaCache] = useState<Record<string, { url?: string; mime?: string; loading?: boolean; error?: string }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const opFilter = workspace.id === "all" ? undefined : workspace.id;

  const { data: convs = [] } = useQuery({
    queryKey: ["wa-conversations", opFilter ?? "all"],
    queryFn: () => listConvFn({ data: { operacaoId: opFilter } }),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

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
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (convs as unknown as Conv[]) ?? [];
    if (!q) return list;
    return list.filter((c) =>
      (c.contact_name ?? "").toLowerCase().includes(q) ||
      c.contact_wa_id.includes(q) ||
      (c.last_message_preview ?? "").toLowerCase().includes(q)
    );
  }, [convs, search]);

  const active = ((convs as unknown as Conv[]) ?? []).find((c) => c.id === activeId) ?? null;


  const { data: messages = [] } = useQuery({
    queryKey: ["wa-messages", activeId],
    queryFn: () => activeId ? listMsgFn({ data: { conversationId: activeId } }) : Promise.resolve([]),
    enabled: !!activeId,
    refetchInterval: activeId ? 3000 : false,
    refetchOnWindowFocus: true,
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  // Mark read when opening a conv
  useEffect(() => {
    if (!activeId) return;
    if (active && active.unread_count > 0) {
      markReadFn({ data: { conversationId: activeId } }).then(() => {
        qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      });
    }
  }, [activeId, active?.unread_count, markReadFn, qc, active]);

  const sendMut = useMutation({
    mutationFn: (vars: Parameters<typeof sendFn>[0]["data"]) => sendFn({ data: vars }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["wa-messages", activeId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao enviar"),
  });

  async function handleSendText() {
    if (!active || !draft.trim()) return;
    sendMut.mutate({
      channelId: active.channel_id,
      conversationId: active.id,
      to: active.contact_wa_id,
      type: "text",
      text: draft.trim(),
    });
  }

  async function handleFileUpload(file: File) {
    if (!active) return;
    toast.loading("Enviando mídia…", { id: "wa-media-upload" });
    const ext = file.name.split(".").pop() || "bin";
    const path = `${active.channel_id}/${active.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const up = await supabase.storage.from("wa-media").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (up.error) {
      toast.dismiss("wa-media-upload");
      toast.error("Upload falhou: " + up.error.message);
      return;
    }
    const signed = await supabase.storage.from("wa-media").createSignedUrl(path, 60 * 60 * 24);
    if (signed.error || !signed.data?.signedUrl) {
      toast.dismiss("wa-media-upload");
      toast.error("Erro ao gerar URL");
      return;
    }
    sendMut.mutate({
      channelId: active.channel_id,
      conversationId: active.id,
      to: active.contact_wa_id,
      type: pendingType,
      mediaUrl: signed.data.signedUrl,
      filename: file.name,
      caption: draft.trim() || undefined,
    });
    toast.dismiss("wa-media-upload");
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
      const error = e?.message ? String(e.message) : "Não foi possível carregar a mídia";
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
    const list = (messages as unknown as Msg[]) ?? [];
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
        const ageMs = now - new Date(msg.created_at as any).getTime();
        if (ageMs < 8000) continue;
        loadMedia(msg, { silent: ageMs < 30000 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);


  return (
    <div className="h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-chat-shell text-foreground">
      <div className="grid h-full min-h-0 grid-cols-[380px_minmax(0,1fr)] overflow-hidden border border-chat-line bg-chat-thread">

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
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Nenhuma conversa ainda. Mensagens recebidas no WhatsApp conectado aparecem aqui.
              </div>
            ) : (
              <div>
                {filtered.map((c) => {
                  const isActive = c.id === activeId;
                  const preview = toText(c.last_message_preview);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={`group w-full border-b border-chat-line px-4 py-3.5 text-left transition-colors ${
                        isActive
                          ? "bg-chat-soft"
                          : "hover:bg-chat-panel"
                      }`}
                    >
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                        <Avatar className="h-12 w-12 shrink-0 rounded-full border border-chat-line">
                          <AvatarFallback className="rounded-full bg-chat-soft text-sm font-bold text-chat-accent">
                            {initials(c.contact_name, c.contact_wa_id)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[15px] font-semibold tracking-normal">
                              {c.contact_name || c.contact_wa_id}
                            </span>
                          </div>
                          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            {c.last_message_direction === "out" && <CheckCheck className="h-3.5 w-3.5 shrink-0" />}
                            <span className="truncate">{preview || "Sem prévia"}</span>
                          </div>
                        </div>
                        <div className="flex h-12 shrink-0 flex-col items-end justify-between gap-1">
                          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                            {formatTime(c.last_message_at)}
                          </span>
                          {c.unread_count > 0 ? (
                            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-chat-accent px-2 text-xs font-bold text-chat-accent-foreground">
                              {c.unread_count}
                            </span>
                          ) : (
                            <span className={`h-2 w-2 rounded-full ${isActive ? "bg-chat-accent" : "bg-transparent"}`} />
                          )}
                        </div>
                      </div>
                    </button>
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
                        {active.contact_name || active.contact_wa_id}
                      </h3>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-chat-line bg-chat-soft px-2.5 py-1 text-[11px] font-medium text-chat-accent">
                        <Radio className="h-3 w-3" /> ativo
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{active.contact_wa_id}</p>
                  </div>
                </div>
                <FlowDispatcher
                  conversation={active}
                  listFlowsFn={listFlowsFn}
                  triggerFn={triggerFlowFn}
                />
              </header>

              <div
                ref={scrollRef}
                className="chat-thread-glow min-h-0 flex-1 overflow-y-auto px-6 py-6 scrollbar-fancy"
              >
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
                  {((messages as unknown as Msg[]) ?? []).map((m, i, arr) => {
                    const prev = arr[i - 1];
                    const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                    return (
                      <div key={m.id}>
                        {showDate && (
                          <div className="my-5 flex justify-center">
                            <span className="rounded-full border border-chat-line bg-chat-panel px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                              {formatDateLabel(m.created_at)}
                            </span>
                          </div>
                        )}
                        <MessageBubble msg={m} mediaState={mediaCache[m.id]} onLoadMedia={() => loadMedia(m)} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <footer className="shrink-0 border-t border-chat-line bg-chat-panel px-5 py-4">
                <div className="mx-auto flex max-w-5xl items-end gap-3 rounded-2xl border border-chat-line bg-chat-thread p-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-12 w-12 shrink-0 rounded-2xl text-muted-foreground hover:bg-chat-soft hover:text-chat-accent">
                        <Paperclip className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52 rounded-2xl border-chat-line bg-popover">
                      <DropdownMenuItem onClick={() => { setPendingType("image"); fileInputRef.current?.click(); }}>
                        <ImageIcon className="mr-2 h-4 w-4" /> Imagem
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setPendingType("video"); fileInputRef.current?.click(); }}>
                        <Video className="mr-2 h-4 w-4" /> Vídeo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setPendingType("audio"); fileInputRef.current?.click(); }}>
                        <Mic className="mr-2 h-4 w-4" /> Áudio
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setPendingType("document"); fileInputRef.current?.click(); }}>
                        <FileText className="mr-2 h-4 w-4" /> Documento
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={
                      pendingType === "image" ? "image/*"
                      : pendingType === "video" ? "video/*"
                      : pendingType === "audio" ? "audio/*"
                      : "*"
                    }
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      e.target.value = "";
                    }}
                  />
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
                  <Button variant="ghost" size="icon" className="h-12 w-12 shrink-0 rounded-2xl text-muted-foreground hover:bg-chat-soft hover:text-chat-accent">
                    <Smile className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-12 w-12 shrink-0 rounded-2xl bg-chat-accent text-chat-accent-foreground hover:bg-chat-accent/90"
                    onClick={handleSendText}
                    disabled={!draft.trim() || sendMut.isPending}
                  >
                    {sendMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

type MediaState = { url?: string; mime?: string; loading?: boolean; error?: string };

function MessageBubble({ msg, mediaState, onLoadMedia }: { msg: Msg; mediaState?: MediaState; onLoadMedia: () => void }) {
  const isOut = msg.direction === "out";
  const body = toText(msg.text_body);
  const caption = toText(msg.caption);
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(74%,760px)] overflow-hidden rounded-[24px] border px-4 py-3 shadow-[0_12px_28px_color-mix(in_oklab,var(--background)_32%,transparent)] ${
          isOut
            ? "border-chat-accent/35 bg-chat-message-out text-chat-message-out-foreground rounded-br-lg"
            : "border-chat-line bg-chat-message-in text-foreground rounded-bl-lg"
        }`}
      >
        <MediaContent msg={msg} mediaState={mediaState} onLoadMedia={onLoadMedia} outgoing={isOut} />
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

function MediaContent({ msg, mediaState, onLoadMedia, outgoing }: { msg: Msg; mediaState?: MediaState; onLoadMedia: () => void; outgoing?: boolean }) {
  if (msg.msg_type === "text") return null;
  // Preferimos sempre media_url (já baixado pelo webhook e salvo no bucket wa-media).
  if (msg.media_url) {
    return <RenderMedia type={msg.msg_type} url={msg.media_url} mime={msg.media_mime} filename={msg.media_filename} outgoing={outgoing} />;
  }
  // Fallback: mensagens antigas que só têm media_id — baixa sob demanda via Meta proxy.
  if (msg.media_id) {
    if (mediaState?.error) {
      return <MediaPlaceholder type={msg.msg_type} filename={msg.media_filename} error={mediaState.error} onRetry={onLoadMedia} outgoing={outgoing} />;
    }
    if (mediaState?.url) {
      return <RenderMedia type={msg.msg_type} url={mediaState.url} mime={mediaState.mime ?? msg.media_mime} filename={msg.media_filename} outgoing={outgoing} />;
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
  const icon = type === "image" || type === "sticker"
    ? <ImageIcon className="h-5 w-5" />
    : type === "video"
      ? <Video className="h-5 w-5" />
      : type === "audio"
        ? <Mic className="h-5 w-5" />
        : <FileText className="h-5 w-5" />;
  const label = type === "image" ? "Imagem"
    : type === "sticker" ? "Figurinha"
    : type === "video" ? "Vídeo"
    : type === "audio" ? "Áudio"
    : filename || "Documento";

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
  type, url, mime, filename, outgoing,
}: { type: string; url: string; mime: string | null; filename: string | null; outgoing?: boolean }) {
  if (type === "image" || type === "sticker") {
    return (
      <img
        src={url}
        alt={filename ?? (type === "sticker" ? "Figurinha recebida" : "Imagem recebida")}
        loading="lazy"
        className={`mb-2 block rounded-2xl border border-chat-line object-contain ${type === "sticker" ? "max-h-44 max-w-44 bg-transparent p-2" : "max-h-[420px] max-w-full"}`}
      />
    );
  }
  if (type === "video") {
    return <video src={url} controls className="mb-2 max-h-[420px] max-w-full rounded-2xl border border-chat-line" />;
  }
  if (type === "audio") {
    return <WhatsappAudioPlayer url={url} outgoing={outgoing} />;
  }
  if (type === "document") {
    return (
      <a href={url} download={filename ?? "documento"} className="mb-1 flex min-w-72 items-center gap-3 rounded-2xl border border-chat-line bg-background/25 px-4 py-3 text-sm font-semibold transition hover:bg-background/40">
        <FileText className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{filename ?? "Documento"}</span>
        <Download className="h-4 w-4 shrink-0" />
      </a>
    );
  }
  return null;
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
    return ((flows as any[]) ?? []).filter((f) => {
      if (f?.ativo === false) return false;
      // Coerente com a operação: fluxo sem operação roda em qualquer; com operação só na mesma
      if (!f.operacao_id) return true;
      if (!op) return false;
      return f.operacao_id === op;
    });
  }, [flows, conversation.operacao_id]);

  async function fire(flowId: string) {
    setFiring(flowId);
    try {
      await triggerFn({
        data: {
          flow_id: flowId,
          channel_id: conversation.channel_id,
          contact_wa_id: conversation.contact_wa_id,
          conversation_id: conversation.id,
        },
      });
      toast.success("Fluxo disparado");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao disparar fluxo");
    } finally {
      setFiring(null);
    }
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
                <div className="text-sm font-medium truncate">{f.nome}</div>
                {f.operacao_id && (
                  <div className="text-[10px] text-muted-foreground">Operação: {f.operacao_id}</div>
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
