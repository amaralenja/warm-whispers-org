import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoMultium from "@/assets/logo-multium.webp";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — MULTIUM" },
      { name: "description", content: "Acesse sua conta MULTIUM" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        setInfo("Conta criada. Verifique seu e-mail para confirmar.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background bg-grain">
      {/* Glow sutil no topo */}
      <div className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-3xl rounded-full opacity-30 blur-3xl"
           style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }} />

      <header className="relative z-10 flex items-center justify-between px-8 py-7">
        <img src={logoMultium.url} alt="MULTIUM" className="h-10 w-auto object-contain" />
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {mode === "signin" ? "Acesso" : "Cadastro"}
        </div>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-96px)] max-w-6xl grid-cols-1 items-center gap-16 px-8 lg:grid-cols-2">
        {/* Editorial side */}
        <section className="hidden lg:block">
          <p className="text-xs uppercase tracking-[0.25em] text-accent">— Plataforma interna</p>
          <h1 className="mt-6 font-display text-6xl leading-[1.05] text-balance text-foreground">
            Onde decisões viram <em className="text-accent">resultado</em>.
          </h1>
          <p className="mt-8 max-w-md text-base leading-relaxed text-muted-foreground">
            Centralize vendas, leads, financeiro e operação num só lugar.
            Pensado para times de alto rendimento.
          </p>

          <div className="mt-12 flex items-center gap-8 border-t border-border pt-8 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>Vendas</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>CRM</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>Financeiro</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>Operação</span>
          </div>
        </section>

        {/* Form */}
        <section className="w-full">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card/60 p-10 backdrop-blur-xl"
               style={{ boxShadow: "var(--shadow-elegant)" }}>
            <h2 className="font-display text-3xl text-foreground">
              {mode === "signin" ? "Bem-vindo de volta" : "Criar conta"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Entre com suas credenciais para continuar."
                : "Preencha os dados para começar."}
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full border-0 border-b border-border bg-transparent py-3 text-foreground outline-none transition-colors focus:border-accent"
                  placeholder="voce@multium.com"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full border-0 border-b border-border bg-transparent py-3 text-foreground outline-none transition-colors focus:border-accent"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                  {error}
                </p>
              )}
              {info && (
                <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-foreground">
                  {info}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative mt-2 inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-foreground px-6 py-3.5 text-sm font-medium text-background transition-all hover:bg-foreground/90 disabled:opacity-60"
                style={{ boxShadow: "var(--shadow-glow)" }}
              >
                {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
                <span className="ml-2 transition-transform group-hover:translate-x-1">→</span>
              </button>
            </form>

            <div className="mt-8 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setInfo(null);
                }}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {mode === "signin" ? "Criar uma conta" : "Já tenho conta"}
              </button>
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60">
                MULTIUM ©
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
