import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: unknown | null };

function safeErrorText(error: unknown, fallback: string) {
  if (error == null) return fallback;
  if (typeof error === "string") return error || fallback;
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
  return String(error) || fallback;
}

function safeStackText(error: unknown) {
  if (error instanceof Error && error.stack) return error.stack;
  return safeErrorText(error, "Sem detalhes técnicos disponíveis.");
}

export class ChatErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    // Logamos com prefixo pra ficar fácil de achar no console em produção.
    console.error("[ChatErrorBoundary]", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full w-full items-center justify-center bg-chat-shell p-8 text-foreground">
        <div className="max-w-lg space-y-4 rounded-2xl border border-chat-line bg-chat-panel p-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-destructive/15 text-destructive">
            <span className="text-2xl" aria-hidden="true">⚠️</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Algo travou no Chat ao Vivo</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {safeErrorText(this.state.error, "Erro desconhecido")}
            </p>
          </div>
          <pre className="max-h-44 overflow-auto rounded-xl bg-background/40 p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
            {safeStackText(this.state.error)}
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
