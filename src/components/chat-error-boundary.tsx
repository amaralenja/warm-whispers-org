import { Component, Fragment, isValidElement, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: unknown | null; errorText: string; stackText: string };

function safeErrorText(error: unknown, fallback: string): string {
  try {
    if (error == null) return fallback;
    if (typeof error === "string") return error || fallback;
    if (typeof error === "number" || typeof error === "boolean") return String(error);
    if (error instanceof Error) return error.message || fallback;
    if (typeof error === "object") {
      const value = error as Record<string, unknown>;
      const message = value.message ?? value.error ?? value.reason;
      if (typeof message === "string" && message.trim()) return message;
      try {
        const json = JSON.stringify(value);
        return json && json !== "{}" ? json : fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function safeStackText(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.stack === "string" && error.stack) return error.stack;
  } catch {}
  return safeErrorText(error, "Sem detalhes técnicos disponíveis.");
}

function forceText(value: unknown, fallback: string): string {
  const text = safeErrorText(value, fallback);
  return typeof text === "string" ? text : fallback;
}

function isRenderableChild(value: unknown): value is ReactNode {
  if (value == null) return true;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return true;
  if (isValidElement(value)) return true;
  if (Array.isArray(value)) return value.every(isRenderableChild);
  return false;
}

function SafeChildren({ children }: { children: ReactNode }) {
  if (children == null) return null;
  if (Array.isArray(children)) {
    return (
      <>
        {children.map((child, index) => (
          isRenderableChild(child) ? <Fragment key={index}>{child}</Fragment> : null
        ))}
      </>
    );
  }
  if (isRenderableChild(children)) return <>{children}</>;
  return null;
}

export class ChatErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorText: "", stackText: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      error,
      errorText: safeErrorText(error, "Erro desconhecido"),
      stackText: safeStackText(error),
    };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    // Logamos com prefixo pra ficar fácil de achar no console em produção.
    console.error("[ChatErrorBoundary] render crash", {
      message: safeErrorText(error, "Erro desconhecido"),
      stack: safeStackText(error),
      componentStack: typeof info?.componentStack === "string" ? info.componentStack : "",
    });
  }

  reset = () => this.setState({ error: null, errorText: "", stackText: "" });

  render() {
    if (!this.state.error) return <SafeChildren>{this.props.children}</SafeChildren>;
    const errorText = forceText(this.state.errorText, "Erro desconhecido");
    const stackText = forceText(this.state.stackText, "Sem detalhes técnicos disponíveis.");
    return (
      <div className="flex h-full w-full items-center justify-center bg-chat-shell p-8 text-foreground">
        <div className="max-w-lg space-y-4 rounded-2xl border border-chat-line bg-chat-panel p-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-destructive/15 text-destructive">
            <span className="text-2xl" aria-hidden="true">⚠️</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Algo travou no Chat ao Vivo</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {errorText}
            </p>
          </div>
          <pre className="max-h-44 overflow-auto rounded-xl bg-background/40 p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
            {stackText}
          </pre>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-2xl border border-chat-line bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-chat-soft"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
}
