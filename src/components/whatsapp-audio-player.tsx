import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsappAudioPlayerProps {
  url?: unknown;
  outgoing?: boolean;
}

const SPEEDS = [1, 1.5, 2] as const;

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function safeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["message", "error", "body", "text", "url"]) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    try {
      const json = JSON.stringify(value);
      return json && json !== "{}" ? json : "";
    } catch {
      return "";
    }
  }
  return String(value);
}

export function WhatsappAudioPlayer(props: WhatsappAudioPlayerProps = {}) {
  const safeUrl = safeText(props?.url).trim();
  const outgoing = Boolean(props?.outgoing);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [error, setError] = useState<string>("");
  const setErrorSafe = (v: unknown) => setError(safeText(v));


  useEffect(() => {
    setPlaying(false);
    setLoading(false);
    setDuration(0);
    setCurrent(0);
    setError("");
    if (!safeUrl) {
      audioRef.current = null;
      return;
    }
    if (typeof Audio === "undefined") return;
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = safeUrl;
    audioRef.current = audio;

    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrent(audio.currentTime || 0);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onErr = () => {
      setErrorSafe("Falha ao carregar áudio");
      setLoading(false);
      setPlaying(false);
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onErr);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onErr);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audioRef.current = null;
    };
  }, [safeUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      setLoading(true);
      audio.playbackRate = speed;
      await audio.play();
      setPlaying(true);
    } catch (e: any) {
      setErrorSafe(safeText(e?.message ?? e) || "Falha ao reproduzir");
    } finally {
      setLoading(false);
    }
  }

  function cycleSpeed() {
    const idx = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  }

  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const v = Number(e.target.value);
    audio.currentTime = v;
    setCurrent(v);
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0;

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

  return (
    <div
      className={cn(
        "mb-2 flex min-w-[320px] max-w-[420px] items-center gap-4 rounded-[22px] border px-4 py-3",
        outgoing
          ? "border-chat-accent/30 bg-background/15"
          : "border-chat-line bg-background/25",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition",
          outgoing
            ? "bg-chat-accent text-chat-accent-foreground hover:bg-chat-accent/90"
            : "bg-chat-accent text-chat-accent-foreground hover:bg-chat-accent/90",
        )}
        aria-label={playing ? "Pausar" : "Tocar"}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : playing ? (
          <Pause className="h-5 w-5" fill="currentColor" />
        ) : (
          <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="mb-2 flex h-7 items-end gap-1" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, idx) => {
            const active = duration > 0 && (idx / 22) * 100 <= progress;
            const height = 8 + ((idx * 7) % 17);
            return (
              <span
                key={idx}
                className={cn("w-1.5 rounded-full transition-colors", active ? "bg-chat-accent" : "bg-foreground/18")}
                style={{ height }}
              />
            );
          })}
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-foreground/12">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full bg-chat-accent",
            )}
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={onSeek}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            aria-label="Buscar áudio"
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5" />
            {safeText(formatTime(current))}
          </span>
          <span>{safeText(formatTime(duration))}</span>
        </div>
        {error && <p className="text-[10px] text-destructive mt-0.5">{safeText(error)}</p>}
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        className={cn(
          "h-9 min-w-12 shrink-0 rounded-full px-3 text-xs font-bold tabular-nums transition",
          outgoing
            ? "bg-chat-accent/18 text-chat-accent hover:bg-chat-accent/28"
            : "bg-foreground/10 text-foreground hover:bg-foreground/20",
        )}
        aria-label="Mudar velocidade"
      >
        {safeText(speed)}x
      </button>
    </div>
  );
}
