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
  resolveIncomingMedia,
  downloadIncomingMediaBase64,
} from "@/lib/whatsapp-chat.functions";

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
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-400" />;
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

  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<"image" | "video" | "document" | "audio">("image");
  const scrollRef = useRef<HTMLDivElement>(null);

  const opFilter = workspace.id === "all" ? undefined : workspace.id;

  const { data: convs = [] } = useQuery({
    queryKey: ["wa-conversations", opFilter ?? "all"],
    queryFn: () => listConvFn({ data: { operacaoId: opFilter } }),
    refetchInterval: 20000,
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
    const ext = file.name.split(".").pop() || "bin";
    const path = `${active.channel_id}/${active.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const up = await supabase.storage.from("wa-media").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (up.error) {
      toast.error("Upload falhou: " + up.error.message);
      return;
    }
    const signed = await supabase.storage.from("wa-media").createSignedUrl(path, 60 * 60 * 24);
    if (signed.error || !signed.data?.signedUrl) {
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
  }

  return (
    <div className="flex h-[calc(100vh-1rem)] bg-background">
      {/* Sidebar de conversas */}
      <aside className="w-[340px] border-r border-border flex flex-col">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-emerald-500" />
            <h2 className="font-semibold">Chat ao Vivo</h2>
            <Badge variant="outline" className="ml-auto text-xs">
              {workspace.id === "all" ? "Geral" : workspace.nome}
            </Badge>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contato ou mensagem"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma conversa ainda. Mensagens recebidas no WhatsApp conectado aparecem aqui.
            </div>
          ) : (
            filtered.map((c) => {
              const isActive = c.id === activeId;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 border-b border-border/50 text-left transition-colors ${isActive ? "bg-accent/10" : "hover:bg-accent/5"}`}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-emerald-500/15 text-emerald-500 text-sm font-semibold">
                      {initials(c.contact_name, c.contact_wa_id)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.contact_name || c.contact_wa_id}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                        {formatTime(c.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {c.last_message_preview ?? ""}
                      </span>
                      {c.unread_count > 0 && (
                        <Badge className="bg-emerald-500 text-white text-[10px] h-5 min-w-5 px-1.5">
                          {c.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Janela do chat */}
      <main className="flex-1 flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessagesSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Selecione uma conversa pra começar</p>
            </div>
          </div>
        ) : (
          <>
            <header className="px-4 py-3 border-b border-border flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-emerald-500/15 text-emerald-500 font-semibold">
                  {initials(active.contact_name, active.contact_wa_id)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{active.contact_name || active.contact_wa_id}</h3>
                <p className="text-xs text-muted-foreground">{active.contact_wa_id}</p>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2230%22%20height=%2230%22%3E%3Crect%20width=%2230%22%20height=%2230%22%20fill=%22%23111%22/%3E%3C/svg%3E')]"
            >
              {((messages as unknown as Msg[]) ?? []).map((m, i, arr) => {
                const prev = arr[i - 1];
                const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-xs bg-muted/50 px-3 py-1 rounded-full text-muted-foreground">
                          {formatDateLabel(m.created_at)}
                        </span>
                      </div>
                    )}
                    <MessageBubble msg={m} />
                  </div>
                );
              })}
            </div>

            <footer className="p-3 border-t border-border bg-card">
              <div className="flex items-end gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0">
                      <Paperclip className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => { setPendingType("image"); fileInputRef.current?.click(); }}>
                      <ImageIcon className="h-4 w-4 mr-2" /> Imagem
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setPendingType("video"); fileInputRef.current?.click(); }}>
                      <Video className="h-4 w-4 mr-2" /> Vídeo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setPendingType("audio"); fileInputRef.current?.click(); }}>
                      <Mic className="h-4 w-4 mr-2" /> Áudio
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setPendingType("document"); fileInputRef.current?.click(); }}>
                      <FileText className="h-4 w-4 mr-2" /> Documento
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
                  placeholder="Mensagem"
                  rows={1}
                  className="resize-none min-h-[40px] max-h-32"
                />
                <Button
                  size="icon"
                  className="bg-emerald-500 hover:bg-emerald-600 text-white shrink-0"
                  onClick={handleSendText}
                  disabled={!draft.trim() || sendMut.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isOut = msg.direction === "out";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
          isOut ? "bg-emerald-500/90 text-white" : "bg-card border border-border"
        }`}
      >
        <MediaContent msg={msg} />
        {msg.text_body && <p className="text-sm whitespace-pre-wrap break-words">{msg.text_body}</p>}
        {msg.caption && <p className="text-xs mt-1 opacity-90">{msg.caption}</p>}
        <div className={`flex items-center gap-1 justify-end mt-1 text-[10px] ${isOut ? "text-white/80" : "text-muted-foreground"}`}>
          <span>{formatTime(msg.created_at)}</span>
          {isOut && <StatusTick status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

function MediaContent({ msg }: { msg: Msg }) {
  if (msg.msg_type === "text") return null;
  // Outgoing: we have media_url already (signed Supabase URL)
  if (msg.direction === "out" && msg.media_url) {
    return <RenderMedia type={msg.msg_type} url={msg.media_url} mime={msg.media_mime} filename={msg.media_filename} />;
  }
  // Incoming: we have media_id, need to resolve via EvoHub
  if (msg.media_id) {
    return <IncomingMedia msg={msg} />;
  }
  return null;
}

function IncomingMedia({ msg }: { msg: Msg }) {
  const downloadFn = useServerFn(downloadIncomingMediaBase64);
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(msg.media_mime);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (url || loading || !msg.media_id) return;
    setLoading(true);
    try {
      const res = await downloadFn({ data: { channelId: msg.channel_id, mediaId: msg.media_id } });
      const dataUrl = `data:${res.mime};base64,${res.base64}`;
      setUrl(dataUrl);
      setMime(res.mime);
    } catch (e: any) {
      toast.error("Erro ao baixar mídia: " + (e?.message ?? ""));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Auto-load images/audio/stickers; documents on click
    if (msg.msg_type === "image" || msg.msg_type === "audio" || msg.msg_type === "sticker") {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.id]);

  if (!url && !loading && msg.msg_type === "document") {
    return (
      <button
        onClick={load}
        className="flex items-center gap-2 bg-background/30 rounded px-2 py-1.5 text-sm hover:bg-background/50"
      >
        <Download className="h-4 w-4" /> {msg.media_filename || "Baixar documento"}
      </button>
    );
  }

  if (loading) return <div className="text-xs opacity-70 py-2">Carregando mídia…</div>;
  if (!url) return null;
  return <RenderMedia type={msg.msg_type} url={url} mime={mime} filename={msg.media_filename} />;
}

function RenderMedia({
  type, url, mime, filename,
}: { type: string; url: string; mime: string | null; filename: string | null }) {
  if (type === "image" || type === "sticker") {
    return <img src={url} alt={filename ?? ""} className={`rounded mb-1 ${type === "sticker" ? "max-w-[120px]" : "max-w-full"}`} />;
  }
  if (type === "video") {
    return <video src={url} controls className="rounded mb-1 max-w-full" />;
  }
  if (type === "audio") {
    return <audio src={url} controls className="mb-1 w-full max-w-[260px]" />;
  }
  if (type === "document") {
    return (
      <a href={url} download={filename ?? "documento"} className="flex items-center gap-2 underline text-sm">
        <FileText className="h-4 w-4" /> {filename ?? "Documento"}
      </a>
    );
  }
  return null;
}
