import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Play, Pause, Loader2, X, MessageCircle, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AudioTrack = {
  id: string;                 // unique key (message id or url)
  url: string;
  title?: string;             // e.g. contact name
  subtitle?: string;          // e.g. "Áudio recebido"
  conversationId?: string | null;
  phone?: string | null;      // fallback so we can open the conversation via ?phone=
  outgoing?: boolean;
};

type PlayerState = {
  track: AudioTrack | null;
  playing: boolean;
  loading: boolean;
  current: number;
  duration: number;
  speed: number;
  error: string | null;
};

type Ctx = PlayerState & {
  play: (t: AudioTrack) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  toggle: (t?: AudioTrack) => Promise<void>;
  seek: (t: number) => void;
  setSpeed: (s: number) => void;
  close: () => void;
  isActive: (id: string) => boolean;
};

const AudioPlayerContext = createContext<Ctx | null>(null);

export function useAudioPlayer(): Ctx {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error("useAudioPlayer deve ser usado dentro de <AudioPlayerProvider>");
  return ctx;
}

const SPEEDS = [1, 1.5, 2] as const;

export function AudioPlayerProvider({ children }: { children?: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<AudioTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeedState] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  // Lazily create the singleton <audio> element (client-side only).
  const getAudio = useCallback((): HTMLAudioElement | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "metadata";
      a.addEventListener("timeupdate", () => setCurrent(a.currentTime || 0));
      a.addEventListener("durationchange", () => setDuration(a.duration || 0));
      a.addEventListener("loadedmetadata", () => setDuration(a.duration || 0));
      a.addEventListener("waiting", () => setLoading(true));
      a.addEventListener("playing", () => { setLoading(false); setPlaying(true); });
      a.addEventListener("pause", () => setPlaying(false));
      a.addEventListener("ended", () => { setPlaying(false); setCurrent(0); });
      a.addEventListener("error", () => { setError("Falha ao carregar áudio"); setLoading(false); setPlaying(false); });
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  const play = useCallback(async (t: AudioTrack) => {
    const a = getAudio();
    if (!a || !t?.url) return;
    setError(null);
    if (track?.id !== t.id || a.src !== t.url) {
      a.src = t.url;
      setCurrent(0);
      setDuration(0);
      setTrack(t);
    }
    a.playbackRate = speed;
    setLoading(true);
    try {
      await a.play();
      setPlaying(true);
    } catch (e: any) {
      setError(e?.message || "Falha ao reproduzir");
    } finally {
      setLoading(false);
    }
  }, [getAudio, speed, track?.id]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const resume = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    try { await a.play(); setPlaying(true); } catch (e: any) { setError(e?.message || "Falha ao reproduzir"); }
  }, []);

  const toggle = useCallback(async (t?: AudioTrack) => {
    if (t && (!track || track.id !== t.id)) return play(t);
    if (playing) pause(); else if (track) await resume();
  }, [play, pause, resume, playing, track]);

  const seek = useCallback((v: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = v;
    setCurrent(v);
  }, []);

  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  }, []);

  const close = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.src = ""; }
    setTrack(null);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setError(null);
  }, []);

  const isActive = useCallback((id: string) => track?.id === id, [track?.id]);

  const value = useMemo<Ctx>(() => ({
    track, playing, loading, current, duration, speed, error,
    play, pause, resume, toggle, seek, setSpeed, close, isActive,
  }), [track, playing, loading, current, duration, speed, error, play, pause, resume, toggle, seek, setSpeed, close, isActive]);

  return (
    <AudioPlayerContext.Provider value={value}>
      {children ?? null}
    </AudioPlayerContext.Provider>
  );
}

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Floating mini player. Only visible when there's an active track AND we're not on that conversation. */
export function FloatingAudioMiniPlayer() {
  const p = useAudioPlayer();
  const navigate = useNavigate();
  const [hideOnConv, setHideOnConv] = useState(false);

  // Hide when the current URL already shows this conversation (avoid duplicate UI in the bubble).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      try {
        const u = new URL(window.location.href);
        if (!u.pathname.startsWith("/chat")) { setHideOnConv(false); return; }
        const cid = u.searchParams.get("conversationId");
        const ph = u.searchParams.get("phone");
        if (!p.track) { setHideOnConv(false); return; }
        const match =
          (p.track.conversationId && cid && p.track.conversationId === cid) ||
          (p.track.phone && ph && p.track.phone.replace(/\D+/g, "") === ph.replace(/\D+/g, ""));
        setHideOnConv(Boolean(match));
      } catch { setHideOnConv(false); }
    };
    check();
    const id = window.setInterval(check, 800);
    return () => window.clearInterval(id);
  }, [p.track]);

  if (!p.track || hideOnConv) return null;

  const progress = p.duration > 0 ? (p.current / p.duration) * 100 : 0;

  const openConv = () => {
    if (p.track?.conversationId) {
      navigate({ to: "/chat", search: { conversationId: p.track.conversationId } as any });
    } else if (p.track?.phone) {
      navigate({ to: "/chat", search: { phone: p.track.phone } as any });
    }
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(p.speed as any);
    const next = SPEEDS[(idx < 0 ? 0 : idx + 1) % SPEEDS.length];
    p.setSpeed(next);
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur"
      role="dialog"
      aria-label="Player de áudio"
    >
      <button
        type="button"
        onClick={() => (p.playing ? p.pause() : p.resume())}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90"
        aria-label={p.playing ? "Pausar" : "Tocar"}
      >
        {p.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : p.playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={openConv}
        className="min-w-0 flex-1 text-left"
        aria-label="Abrir conversa"
      >
        <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
          <MessageCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{p.track.title || "Áudio"}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Volume2 className="h-3 w-3" />{formatTime(p.current)}</span>
          <span>{formatTime(p.duration)}</span>
        </div>
      </button>

      <button
        type="button"
        onClick={cycleSpeed}
        className="h-7 min-w-9 shrink-0 rounded-full bg-muted px-2 text-[11px] font-bold tabular-nums text-foreground hover:bg-muted/80"
        aria-label="Mudar velocidade"
      >
        {p.speed}x
      </button>

      <button
        type="button"
        onClick={p.close}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="Fechar player"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Optional context so <WhatsappAudioPlayer> knows which conversation it lives in. */
type ConvInfo = { conversationId?: string | null; phone?: string | null; title?: string | null };
const ConvContext = createContext<ConvInfo | null>(null);
export function CurrentConversationProvider({ value, children }: { value: ConvInfo; children?: ReactNode }) {
  return <ConvContext.Provider value={value}>{children ?? null}</ConvContext.Provider>;
}
export function useCurrentConversationInfo(): ConvInfo | null {
  return useContext(ConvContext);
}
