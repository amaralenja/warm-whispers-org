import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  onSend: (file: File) => void | Promise<void>;
  disabled?: boolean;
}

function pickMime(): string | undefined {
  const opts = [
    "audio/ogg;codecs=opus",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const m of opts) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function WhatsappRecorder({ onSend, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const [levels, setLevels] = useState<number[]>(Array(24).fill(4));
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => () => { cleanup(); }, []);

  function cleanup() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    recRef.current = null;
  }

  async function start() {
    if (disabled || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        cleanup();
        setRecording(false);
        setSeconds(0);
        if (cancelledRef.current) return;
        if (blob.size === 0) { toast.error("Áudio vazio"); return; }
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type });
        try {
          setSending(true);
          await onSend(file);
        } finally {
          setSending(false);
        }
      };
      rec.start(250);
      recRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);

      // wave levels
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      analyserRef.current = an;
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        const h = Math.min(28, 4 + rms * 80);
        setLevels((prev) => [...prev.slice(1), h]);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: any) {
      cleanup();
      if (err?.name === "NotAllowedError") toast.error("Permissão de microfone negada");
      else if (err?.name === "NotFoundError") toast.error("Nenhum microfone encontrado");
      else toast.error("Falha ao gravar: " + (err?.message || "erro"));
    }
  }

  function stopAndSend() {
    if (!recRef.current) return;
    cancelledRef.current = false;
    try { recRef.current.stop(); } catch {}
  }

  function cancel() {
    if (!recRef.current) {
      cleanup();
      setRecording(false);
      setSeconds(0);
      return;
    }
    cancelledRef.current = true;
    try { recRef.current.stop(); } catch {}
  }

  if (sending) {
    return (
      <Button variant="ghost" size="icon" disabled className="h-12 w-12 shrink-0 rounded-2xl">
        <Loader2 className="h-5 w-5 animate-spin" />
      </Button>
    );
  }

  if (!recording) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={start}
        disabled={disabled}
        className="h-12 w-12 shrink-0 rounded-2xl text-muted-foreground hover:bg-chat-soft hover:text-chat-accent"
        aria-label="Gravar áudio"
      >
        <Mic className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-chat-accent/30 bg-chat-soft/60 px-3 py-2">
      <button
        type="button"
        onClick={cancel}
        className="grid h-9 w-9 place-items-center rounded-full text-destructive hover:bg-destructive/10"
        aria-label="Cancelar"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
      <span className="tabular-nums text-xs font-semibold text-destructive">{fmt(seconds)}</span>
      <div className="flex h-7 items-center gap-[2px] px-2">
        {levels.map((h, i) => (
          <span key={i} className="w-[3px] rounded-full bg-chat-accent" style={{ height: Math.max(4, h) }} />
        ))}
      </div>
      <button
        type="button"
        onClick={stopAndSend}
        className="grid h-9 w-9 place-items-center rounded-full bg-chat-accent text-chat-accent-foreground hover:bg-chat-accent/90"
        aria-label="Enviar gravação"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
