import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsappAudioPlayerProps {
  url: string;
  outgoing?: boolean;
}

const SPEEDS = [1, 1.5, 2] as const;

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function WhatsappAudioPlayer({ url, outgoing }: WhatsappAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    audioRef.current = audio;

    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrent(audio.currentTime || 0);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onErr = () => {
      setError("Falha ao carregar áudio");
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
  }, [url]);

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
      setError(e?.message || "Falha ao reproduzir");
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

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-2 min-w-[260px] max-w-[320px]",
        outgoing
          ? "bg-emerald-600/30 border border-emerald-500/40"
          : "bg-background/40 border border-border/60",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition",
          outgoing
            ? "bg-emerald-500 text-white hover:bg-emerald-400"
            : "bg-foreground text-background hover:opacity-90",
        )}
        aria-label={playing ? "Pausar" : "Tocar"}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" fill="currentColor" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="relative h-1.5 rounded-full bg-foreground/15 overflow-hidden">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              outgoing ? "bg-emerald-300" : "bg-foreground/70",
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
        <div className="flex items-center justify-between mt-1 text-[10px] tabular-nums text-muted-foreground">
          <span>{formatTime(current)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        className={cn(
          "shrink-0 h-7 min-w-[36px] px-2 rounded-full text-[11px] font-semibold tabular-nums transition",
          outgoing
            ? "bg-emerald-500/40 text-white hover:bg-emerald-500/60"
            : "bg-foreground/10 text-foreground hover:bg-foreground/20",
        )}
        aria-label="Mudar velocidade"
      >
        {speed}x
      </button>
    </div>
  );
}
