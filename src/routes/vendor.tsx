import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, User } from "lucide-react";
import logoMultium from "@/assets/logo-multium.webp";

export const Route = createFileRoute("/vendor")({
  ssr: false,
  head: () => ({ meta: [{ title: "Vendedor — MULTIUM" }] }),
  component: VendorPortal,
});

type VendorSession = {
  id: number;
  nome: string | null;
  utm: string | null;
  expert: string | null;
  foto_url: string | null;
  codigo: string | null;
};

function VendorPortal() {
  const navigate = useNavigate();
  const [v, setV] = useState<VendorSession | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("vendor_session");
    if (!raw) {
      navigate({ to: "/auth" });
      return;
    }
    try {
      setV(JSON.parse(raw));
    } catch {
      localStorage.removeItem("vendor_session");
      navigate({ to: "/auth" });
    }
  }, [navigate]);

  function logout() {
    localStorage.removeItem("vendor_session");
    navigate({ to: "/auth" });
  }

  if (!v) return null;

  const initials =
    (v.nome ?? "?")
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/40 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <img src={logoMultium} alt="MULTIUM" className="h-8 w-auto object-contain" />
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-500/15 via-card to-card p-8">
          <div className="flex items-center gap-5">
            {v.foto_url ? (
              <img
                src={v.foto_url}
                alt={v.nome ?? ""}
                className="h-20 w-20 rounded-full border-2 border-emerald-500/40 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-2xl font-bold text-white">
                {initials}
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">Bem-vindo</div>
              <h1 className="mt-1 font-display text-3xl font-bold">{v.nome ?? "Vendedor"}</h1>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                {v.utm && <span className="font-mono">{v.utm}</span>}
                {v.expert && <span>· {v.expert}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <User className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 font-display text-xl">Painel do vendedor em construção</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Em breve você verá aqui suas vendas, metas e ranking em tempo real.
          </p>
        </div>
      </div>
    </main>
  );
}
