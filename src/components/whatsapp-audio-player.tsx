import { Play, Pause, Loader2, Volume2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioPlayer, useCurrentConversationInfo, type AudioTrack } from "@/lib/audio-player-context";

interface WhatsappAudioPlayerProps {
  url?: unknown;
  mime?: string | null;
  outgoing?: boolean;
  trackId?: string | null;
  title?: string | null;
}

const SPEEDS = [1, 1.5, 2] as const;

function safeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return String(value); } catch { return ""; }
}

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function WhatsappAudioPlayer(props: WhatsappAudioPlayerProps = {}) {
  const safeUrl = safeText(props?.url).trim();
  const outgoing = Boolean(props?.outgoing);
  const trackId = safeText(props?.trackId) || safeUrl;
  const title = safeText(props?.title);
  const mime = safeText(props?.mime).trim() || null;
  const conv = useCurrentConversationInfo();
  const player = useAudioPlayer();

  if (!safeUrl) {
    return (
      <div
        className={cn(
          "mb-2 flex min-w-[280px] items-center gap-3 rounded-[22px] border px-4 py-3 text-sm text-muted-foreground",
          outgoing ? "border-chat-accent/30 bg-background/15" : "border-chat-line bg-background/25",
        )}
      >
        <Volume2 className="h-4 w-4" />
        Áudio indisponível
      </div>
    );
  }

  const isActive = player.isActive(trackId);
  const playing = isActive && player.playing;
  const loading = isActive && player.loading;
  const current = isActive ? player.current : 0;
  const duration = isActive ? player.duration : 0;
  const speed = isActive ? player.speed : 1;
  const error = isActive ? player.error : null;
  const progress = duration > 0 ? (current / duration) * 100 : 0;

  const track: AudioTrack = {
    id: trackId,
    url: safeUrl,
    mime: mime || undefined,
    title: title || conv?.title || "Áudio",
    subtitle: outgoing ? "Áudio enviado" : "Áudio recebido",
    conversationId: conv?.conversationId ?? null,
    phone: conv?.phone ?? null,
    outgoing,
  };

  const onToggle = () => {
    if (isActive) {
      if (playing) player.pause(); else player.resume();
    } else {
      void player.play(track);
    }
  };

  const cycleSpeed = () => {
    const list = SPEEDS;
    const idx = list.indexOf(speed as any);
    const next = list[(idx < 0 ? 0 : idx + 1) % list.length];
    player.setSpeed(next);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ext = mime?.includes("mp3") ? "mp3" : mime?.includes("m4a") ? "m4a" : mime?.includes("wav") ? "wav" : "ogg";
    const filename = `${title || conv?.title || "audio"}.${ext}`;
    try {
      const response = await fetch(safeUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch {
      const a = document.createElement("a");
      a.href = safeUrl;
      a.download = filename;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isActive) return;
    player.seek(Number(e.target.value));
  };

  return (
    <div
      className={cn(
        "mb-2 flex min-w-[320px] max-w-[420px] items-center gap-3 rounded-[22px] border px-4 py-3",
        outgoing ? "border-chat-accent/30 bg-background/15" : "border-chat-line bg-background/25",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-chat-accent text-chat-accent-foreground transition hover:bg-chat-accent/90"
        aria-label={playing ? "Pausar" : "Tocar"}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex h-7 items-end gap-1" aria-hidden="true">
          {Array.from({ length: 20 }).map((_, idx) => {
            const active = duration > 0 && (idx / 20) * 100 <= progress;
            const height = 8 + ((idx * 7) % 17);
            return (
              <span
                key={idx}
                className={cn("w-1.5 rounded-full transition-colors", active ? "bg-chat-accent" : "bg-foreground/20")}
                style={{ height }}
              />
            );
          })}
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-foreground/12">
          <div className="absolute inset-y-0 left-0 rounded-full bg-chat-accent" style={{ width: `${progress}%` }} />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={onSeek}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
            aria-label="Buscar áudio"
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5" />
            {formatTime(current)}
          </span>
          <span>{formatTime(duration)}</span>
        </div>
        {safeText(error) ? <p className="mt-0.5 text-[10px] text-destructive">{safeText(error)}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={cycleSpeed}
          className="h-8 min-w-10 rounded-full bg-chat-accent/18 px-2 text-[11px] font-bold tabular-nums text-chat-accent transition hover:bg-chat-accent/28"
          aria-label="Mudar velocidade"
          title="Velocidade"
        >
          {speed}x
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-muted-foreground transition hover:bg-chat-accent/20 hover:text-chat-accent"
          aria-label="Baixar áudio"
          title="Baixar áudio"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
