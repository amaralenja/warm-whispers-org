import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, Download, RotateCcw } from "lucide-react";

type Props = {
  src: string;
  alt?: string;
  onClose: () => void;
};

export function ImageLightbox({ src, alt, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") setScale((s) => Math.min(6, s + 0.25));
      else if (e.key === "-") setScale((s) => Math.max(1, s - 0.25));
      else if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function reset() {
    setScale(1);
    setTx(0);
    setTy(0);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    setScale((s) => Math.max(1, Math.min(6, s + delta * s)));
  }

  function onMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
  }
  function endDrag() {
    dragRef.current = null;
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), scale };
    } else if (e.touches.length === 1 && scale > 1) {
      dragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty };
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const next = Math.max(1, Math.min(6, pinchRef.current.scale * (dist / pinchRef.current.dist)));
      setScale(next);
    } else if (e.touches.length === 1 && dragRef.current) {
      setTx(dragRef.current.tx + (e.touches[0].clientX - dragRef.current.x));
      setTy(dragRef.current.ty + (e.touches[0].clientY - dragRef.current.y));
    }
  }
  function onTouchEnd() {
    pinchRef.current = null;
    dragRef.current = null;
  }

  function onDoubleClick() {
    if (scale === 1) setScale(2.5);
    else reset();
  }

  const node = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 rounded-full bg-black/60 p-1 text-white shadow-lg backdrop-blur">
        <button
          onClick={() => setScale((s) => Math.max(1, s - 0.5))}
          className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15"
          aria-label="Diminuir zoom"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center font-mono text-xs">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(6, s + 0.5))}
          className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15"
          aria-label="Aumentar zoom"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={reset}
          className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15"
          aria-label="Resetar"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <a
          href={src}
          download
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15"
          aria-label="Baixar"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Hint */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/70 backdrop-blur">
        Duplo clique para zoom · Scroll ou pinça · Esc para fechar
      </div>

      {/* Image */}
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
        style={{ cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "zoom-in" }}
      >
        <img
          src={src}
          alt={alt || "Imagem"}
          draggable={false}
          className="max-h-[92vh] max-w-[92vw] select-none object-contain shadow-2xl transition-transform duration-75"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
