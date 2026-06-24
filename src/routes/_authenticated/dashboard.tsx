import { createFileRoute, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/dashboard.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MULTIUM" }] }),
  component: Dashboard,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useRouteContext({ from: "/_authenticated" });
  const fetchStats = useServerFn(getDashboardStats);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-screen bg-background bg-grain">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl tracking-tight">MULTIUM</span>
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Dashboard</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <span className="text-muted-foreground">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Sair →
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-8 py-14">
        <div className="flex items-end justify-between border-b border-border pb-10">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-accent">— Visão geral</p>
            <h1 className="mt-4 font-display text-5xl leading-tight text-balance">
              Boa,{" "}
              <em className="text-accent">
                {user?.email?.split("@")[0]}
              </em>
              .
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Resumo da operação. Tudo atualizado em tempo real.
            </p>
          </div>
          <div className="hidden text-right text-xs uppercase tracking-[0.2em] text-muted-foreground md:block">
            {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Faturamento" value={isLoading ? "—" : BRL(data?.faturamento ?? 0)} hint="Bruto total" />
          <Kpi label="Líquido" value={isLoading ? "—" : BRL(data?.liquido ?? 0)} hint="Após plataforma" />
          <Kpi label="Ticket médio" value={isLoading ? "—" : BRL(data?.ticketMedio ?? 0)} hint={`${data?.totalVendas ?? 0} vendas`} />
          <Kpi label="Comissões" value={isLoading ? "—" : BRL(data?.comissoes ?? 0)} hint="Pagas aos closers" accent />
        </section>

        {/* Secundárias */}
        <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <MiniCard label="Leads" value={data?.totalLeads ?? 0} />
          <MiniCard label="Vendas HT" value={data?.htVendasCount ?? 0} />
          <MiniCard
            label="Saldo financeiro"
            value={data ? BRL(data.saldo) : "—"}
            tone={data && data.saldo >= 0 ? "positive" : "negative"}
          />
        </section>

        {/* Últimas vendas */}
        <section className="mt-14">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl">Últimas vendas</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {data?.ultimasVendas.length ?? 0} registros
            </span>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card/40">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-normal">Data</th>
                  <th className="px-6 py-4 font-normal">Produto</th>
                  <th className="px-6 py-4 font-normal">Closer</th>
                  <th className="px-6 py-4 font-normal">Status</th>
                  <th className="px-6 py-4 text-right font-normal">Valor</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">Carregando…</td></tr>
                )}
                {!isLoading && (data?.ultimasVendas.length ?? 0) === 0 && (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">Nenhuma venda registrada.</td></tr>
                )}
                {data?.ultimasVendas.map((v, i) => (
                  <tr key={i} className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/30">
                    <td className="px-6 py-4 text-muted-foreground">
                      {v.data ? new Date(v.data).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-6 py-4 text-foreground">{v.produto ?? "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{v.closer ?? "—"}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                        {v.status ?? "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-foreground">{BRL(v.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className="bg-background p-8 transition-colors hover:bg-card">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`mt-4 font-display text-4xl ${accent ? "text-accent" : "text-foreground"}`}>{value}</div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function MiniCard({ label, value, tone }: { label: string; value: string | number; tone?: "positive" | "negative" }) {
  const color = tone === "negative" ? "text-destructive" : tone === "positive" ? "text-[color:var(--success)]" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`mt-3 font-display text-3xl ${color}`}>{value}</div>
    </div>
  );
}
