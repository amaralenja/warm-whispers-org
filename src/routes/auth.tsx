import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoMultium from "@/assets/logo-multium.webp";
import VisibilityTwoTone from "@mui/icons-material/VisibilityTwoTone";
import VisibilityOffTwoTone from "@mui/icons-material/VisibilityOffTwoTone";
import EmailTwoTone from "@mui/icons-material/EmailTwoTone";
import LockTwoTone from "@mui/icons-material/LockTwoTone";
import VpnKeyTwoTone from "@mui/icons-material/VpnKeyTwoTone";
import ShieldTwoTone from "@mui/icons-material/ShieldTwoTone";
import BadgeTwoTone from "@mui/icons-material/BadgeTwoTone";
import GroupsTwoTone from "@mui/icons-material/GroupsTwoTone";
import ArrowForwardTwoTone from "@mui/icons-material/ArrowForwardTwoTone";
import AutoGraphTwoTone from "@mui/icons-material/AutoGraphTwoTone";
import ElectricBoltTwoTone from "@mui/icons-material/ElectricBoltTwoTone";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — MULTIUM" },
      { name: "description", content: "Acesse sua conta MULTIUM" },
    ],
    scripts: [
      {
        src: "https://rastre-web.vercel.app/loader.js",
        "data-site": "site_321gli8fici",
        async: true,
      },
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
  const [showPassword, setShowPassword] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const scriptId = "rastre-web-loader";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://rastre-web.vercel.app/loader.js";
      script.setAttribute("data-site", "site_321gli8fici");
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (role === "vendedor" || role === "ht") {
        const code = codigo.trim();
        if (!/^\d{6}$/.test(code)) throw new Error("Código deve ter 6 dígitos");
        if (role === "ht") {
          const { data: htData, error: htErr } = await supabase.rpc("login_ht_team_by_codigo", { _codigo: code });
          if (htErr) throw htErr;
          if (!htData) throw new Error("Código inválido ou inativo");
          localStorage.setItem("ht_team_session", JSON.stringify(htData));
          window.dispatchEvent(new Event("vendor-session-updated"));
          navigate({ to: "/ht-analytics" });
          return;
        }
        const { data: vData, error: vErr } = await supabase.rpc("login_vendedor_by_codigo", { _codigo: code });
        if (vErr) throw vErr;
        if (!vData) throw new Error("Código inválido ou inativo");
        localStorage.setItem("vendor_session", JSON.stringify(vData));
        window.dispatchEvent(new Event("vendor-session-updated"));
        navigate({ to: "/vendor" });
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
    <main className="relative min-h-screen overflow-hidden bg-[#090b0e] text-foreground flex items-center justify-center p-4 md:p-8">
      {/* Background Glows & Ambient Gradients */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-amber-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 right-10 h-[400px] w-[400px] rounded-full bg-amber-600/5 blur-[120px]" />

      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
        {/* Left Side — Brand Showcase & Hero */}
        <section className="hidden lg:flex lg:col-span-7 flex-col justify-center space-y-8 pr-6">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-1.5 backdrop-blur-md w-fit">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
              Plataforma Interna
            </span>
          </div>

          <div className="space-y-4">
            <h1 className="font-display text-5xl font-extrabold tracking-tight text-white xl:text-6xl leading-[1.1]">
              Onde decisões viram{" "}
              <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
                resultado.
              </span>
            </h1>
            <p className="max-w-lg text-base leading-relaxed text-amber-100/70">
              Centralize vendas, leads, financeiro e operação num só ecossistema inteligente. Pensado para times de alto rendimento.
            </p>
          </div>

          {/* Feature Badges */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/40 px-3.5 py-2 text-xs font-medium text-amber-200/80 backdrop-blur-sm">
              <ElectricBoltTwoTone className="!h-4 !w-4 text-amber-400" />
              <span>Operação X1</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/40 px-3.5 py-2 text-xs font-medium text-amber-200/80 backdrop-blur-sm">
              <AutoGraphTwoTone className="!h-4 !w-4 text-amber-400" />
              <span>High Ticket Analytics</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/40 px-3.5 py-2 text-xs font-medium text-amber-200/80 backdrop-blur-sm">
              <ShieldTwoTone className="!h-4 !w-4 text-amber-400" />
              <span>Gestão de Acessos</span>
            </div>
          </div>

          {/* Security & System Status Badge */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-card/40 p-4 backdrop-blur-xl max-w-md shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
                <ShieldTwoTone className="!h-5 !w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Ambiente Seguro</span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Acesso restrito a colaboradores e parceiros autorizados MULTIUM.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Side — Login Card */}
        <section className="w-full lg:col-span-5">
          <div className="relative overflow-hidden rounded-3xl border border-amber-500/20 bg-card/80 p-8 md:p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
            {/* Subtle Top Ambient Accent */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500/20 via-amber-400 to-amber-500/20" />

            {/* Logo */}
            <div className="mb-6 flex justify-center">
              <img
                src={logoMultium}
                alt="MULTIUM"
                className="h-12 w-auto object-contain drop-shadow-[0_0_25px_rgba(245,158,11,0.3)] transition-transform hover:scale-105"
              />
            </div>

            {/* Role Switcher Tabs */}
            <div className="mb-8 grid grid-cols-3 gap-1 rounded-xl border border-border/60 bg-background/60 p-1 backdrop-blur-md">
              {(["admin", "vendedor", "ht"] as const).map((r) => {
                const isActive = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRole(r);
                      setError(null);
                      setInfo(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[0.7rem] font-semibold uppercase tracking-wider transition-all duration-200 ${
                      isActive
                        ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                        : "text-muted-foreground hover:bg-amber-500/10 hover:text-foreground"
                    }`}
                  >
                    {r === "admin" && <ShieldTwoTone className="!h-3.5 !w-3.5" />}
                    {r === "vendedor" && <BadgeTwoTone className="!h-3.5 !w-3.5" />}
                    {r === "ht" && <GroupsTwoTone className="!h-3.5 !w-3.5" />}
                    <span>{r === "admin" ? "Admin" : r === "vendedor" ? "Vendedor" : "SDR/Closer"}</span>
                  </button>
                );
              })}
            </div>

            {/* Title & Subtitle */}
            <div className="mb-6 space-y-1">
              <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                {role === "vendedor"
                  ? "Painel do Vendedor"
                  : role === "ht"
                  ? "Portal SDR / Closer"
                  : mode === "signin"
                  ? "Bem-vindo de volta"
                  : "Criar conta"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {role === "vendedor" || role === "ht"
                  ? "Digite seu código de 6 dígitos para continuar."
                  : mode === "signin"
                  ? "Insira suas credenciais para acessar."
                  : "Preencha seus dados para solicitar cadastro."}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {role === "vendedor" || role === "ht" ? (
                <div className="space-y-2">
                  <label className="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Código de Acesso
                  </label>
                  <div className="relative flex items-center">
                    <div className="pointer-events-none absolute left-3.5 text-muted-foreground">
                      <VpnKeyTwoTone className="!h-5 !w-5 text-amber-400" />
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                      className="w-full rounded-xl border border-border/80 bg-background/70 py-3.5 pl-11 pr-4 font-mono text-xl tracking-[0.4em] text-white outline-none transition-all focus:border-amber-500 focus:bg-background focus:ring-2 focus:ring-amber-500/30"
                      placeholder="••••••"
                    />
                  </div>
                </div>
              ) : (
                <>
                  {/* Email Field */}
                  <div className="space-y-1.5">
                    <label className="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      E-mail
                    </label>
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute left-3.5 text-muted-foreground">
                        <EmailTwoTone className="!h-5 !w-5 text-amber-400/80" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-border/80 bg-background/70 py-3 pl-11 pr-4 text-sm text-white outline-none transition-all focus:border-amber-500 focus:bg-background focus:ring-2 focus:ring-amber-500/30 placeholder:text-muted-foreground/50"
                        placeholder="admin@multium.com"
                      />
                    </div>
                  </div>

                  {/* Password Field with Eye Toggle */}
                  <div className="space-y-1.5">
                    <label className="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Senha
                    </label>
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute left-3.5 text-muted-foreground">
                        <LockTwoTone className="!h-5 !w-5 text-amber-400/80" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-border/80 bg-background/70 py-3 pl-11 pr-11 text-sm text-white outline-none transition-all focus:border-amber-500 focus:bg-background focus:ring-2 focus:ring-amber-500/30 placeholder:text-muted-foreground/50"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3.5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-400"
                        aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                      >
                        {showPassword ? (
                          <VisibilityOffTwoTone className="!h-5 !w-5" />
                        ) : (
                          <VisibilityTwoTone className="!h-5 !w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Feedback messages */}
              {error && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive-foreground">
                  {error}
                </div>
              )}
              {info && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
                  {info}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-400 hover:shadow-amber-500/40 disabled:opacity-60 active:scale-[0.99]"
              >
                <span>
                  {loading
                    ? "Aguarde…"
                    : role === "vendedor"
                    ? "Entrar como vendedor"
                    : role === "ht"
                    ? "Entrar como SDR / Closer"
                    : mode === "signin"
                    ? "Entrar na plataforma"
                    : "Criar conta"}
                </span>
                {!loading && (
                  <ArrowForwardTwoTone className="!h-4 !w-4 transition-transform group-hover:translate-x-1" />
                )}
              </button>
            </form>

            {/* Footer Tag */}
            <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4 text-xs text-muted-foreground/60">
              <span className="text-[0.65rem] uppercase tracking-widest">Acesso Seguro</span>
              <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-amber-500/70">
                MULTIUM ©
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
