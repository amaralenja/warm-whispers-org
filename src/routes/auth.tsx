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

type Role = "admin" | "vendedor" | "ht";

function AuthPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("admin");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (role === "vendedor") {
        const code = codigo.trim();
        if (!/^\d{6}$/.test(code)) throw new Error("Código deve ter 6 dígitos");
        // Tenta vendedor primeiro; se não achar, tenta SDR/Closer (HT)
        const { data: vData, error: vErr } = await supabase.rpc("login_vendedor_by_codigo", { _codigo: code });
        if (vErr) throw vErr;
        if (vData) {
          localStorage.setItem("vendor_session", JSON.stringify(vData));
          window.dispatchEvent(new Event("vendor-session-updated"));
          navigate({ to: "/vendor" });
          return;
        }
        const { data: htData, error: htErr } = await supabase.rpc("login_ht_team_by_codigo", { _codigo: code });
        if (htErr) throw htErr;
        if (!htData) throw new Error("Código inválido ou inativo");
        localStorage.setItem("ht_team_session", JSON.stringify(htData));
        window.dispatchEvent(new Event("vendor-session-updated"));
        navigate({ to: "/ht-analytics" });
        return;
      }
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
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-3xl rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
      />

      <header className="relative z-10 flex items-center justify-end px-8 py-7">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {role === "admin" ? (mode === "signin" ? "Acesso" : "Cadastro") : "Vendedor"}
        </div>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-96px)] max-w-6xl grid-cols-1 items-center gap-16 px-8 lg:grid-cols-2">
        <section className="hidden lg:block">
          <p className="text-xs uppercase tracking-[0.25em] text-accent">— Plataforma interna</p>
          <h1 className="mt-6 font-display text-6xl leading-[1.05] text-balance text-foreground">
            Onde decisões viram <em className="text-accent">resultado</em>.
          </h1>
          <p className="mt-8 max-w-md text-base leading-relaxed text-muted-foreground">
            Centralize vendas, leads, financeiro e operação num só lugar. Pensado para times de alto rendimento.
          </p>
        </section>

        <section className="w-full">
          <div
            className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card/60 p-10 backdrop-blur-xl"
            style={{ boxShadow: "var(--shadow-elegant)" }}
          >
            <div className="mb-6 flex justify-center">
              <img src={logoMultium} alt="MULTIUM" className="h-12 w-auto object-contain" />
            </div>

            {/* Toggle Admin / Vendedor */}
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-full border border-border bg-background/40 p-1">
              {(["admin", "vendedor"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRole(r);
                    setError(null);
                    setInfo(null);
                  }}
                  className={`rounded-full py-2 text-xs font-semibold uppercase tracking-wider transition-all ${
                    role === r
                      ? "bg-foreground text-background shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "admin" ? "Admin" : "Vendedor"}
                </button>
              ))}
            </div>

            <h2 className="font-display text-3xl text-foreground">
              {role === "vendedor"
                ? "Acesso do vendedor"
                : mode === "signin"
                ? "Bem-vindo de volta"
                : "Criar conta"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {role === "vendedor"
                ? "Digite seu código de 6 dígitos para entrar."
                : mode === "signin"
                ? "Entre com suas credenciais para continuar."
                : "Preencha os dados para começar."}
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {role === "vendedor" ? (
                <div>
                  <label className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Código de acesso
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                    className="mt-2 w-full border-0 border-b border-border bg-transparent py-3 text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none transition-colors focus:border-accent"
                    placeholder="••••••"
                  />
                </div>
              ) : (
                <>
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
                </>
              )}

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
                {loading
                  ? "Aguarde…"
                  : role === "vendedor"
                  ? "Entrar como vendedor"
                  : mode === "signin"
                  ? "Entrar"
                  : "Criar conta"}
                <span className="ml-2 transition-transform group-hover:translate-x-1">→</span>
              </button>
            </form>

            {role === "admin" && (
              <div className="mt-8 flex items-center justify-end text-sm">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60">
                  MULTIUM ©
                </span>
              </div>
            )}

          </div>
        </section>
      </div>
    </main>
  );
}
