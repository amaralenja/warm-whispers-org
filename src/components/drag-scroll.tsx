import { useRef, type ReactNode } from "react";

/**
 * Container com scroll horizontal arrastável (click + drag), tipo carrossel.
 * Ignora o drag se o alvo for um botão/link/input — assim os botões dentro
 * dos cards continuam clicáveis.
 */
export function DragScroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef({ down: false, moved: false, startX: 0, startLeft: 0 });

  function isInteractive(el: EventTarget | null) {
    if (!(el instanceof HTMLElement)) return false;
    return !!el.closest(
      'button, a, input, textarea, select, [role="button"], [data-no-drag]'
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      onMouseDown={(e) => {
        if (isInteractive(e.target)) return;
        const el = ref.current;
        if (!el) return;
        state.current = {
          down: true,
          moved: false,
          startX: e.pageX,
          startLeft: el.scrollLeft,
        };
      }}
      onMouseMove={(e) => {
        const s = state.current;
        if (!s.down) return;
        const el = ref.current;
        if (!el) return;
        const dx = e.pageX - s.startX;
        if (Math.abs(dx) > 4) s.moved = true;
        el.scrollLeft = s.startLeft - dx;
      }}
      onMouseUp={() => {
        state.current.down = false;
      }}
      onMouseLeave={() => {
        state.current.down = false;
      }}
      onClickCapture={(e) => {
        // Bloqueia o click se houve arrasto real
        if (state.current.moved) {
          e.stopPropagation();
          e.preventDefault();
          state.current.moved = false;
        }
      }}
    >
      {children}
    </div>
  );
}
