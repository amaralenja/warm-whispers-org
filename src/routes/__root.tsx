import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Component, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display text-foreground">404</h1>
        <h2 className="mt-4 text-xl text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent(props?: { error?: Error; reset?: () => void }) {
  const safeError = props?.error ?? new Error("Erro desconhecido");
  console.error(props?.error);
  reportLovableError(safeError, { boundary: "tanstack_root_error_component" });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-display text-foreground">Essa página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado. Tenta de novo ou volta pro início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              props?.reset?.();
              window.location.reload();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MULTIUM" },
      { name: "description", content: "Plataforma MULTIUM" },
      { property: "og:title", content: "MULTIUM" },
      { name: "twitter:title", content: "MULTIUM" },
      { property: "og:description", content: "Plataforma MULTIUM" },
      { name: "twitter:description", content: "Plataforma MULTIUM" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6b6ea40e-600d-4694-af0d-a7853a298c8e/id-preview-d79c57d6--2e1a29ec-fac0-4ff7-b857-84de13f3b474.lovable.app-1782259073782.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6b6ea40e-600d-4694-af0d-a7853a298c8e/id-preview-d79c57d6--2e1a29ec-fac0-4ff7-b857-84de13f3b474.lovable.app-1782259073782.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell(props: { children?: ReactNode } | null) {
  const children = props?.children ?? null;
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <ShellBoundary fallback={null}>
          <Scripts />
        </ShellBoundary>
      </body>
    </html>
  );
}

class ShellBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    reportLovableError(error, { boundary: "root_shell" });
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const rootQueryClient = new QueryClient();

function RootComponent() {
  return (
    <QueryClientProvider client={rootQueryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
