import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Wallet, TrendingUp, TrendingDown, Plus, Pencil, Trash2, Search,
  Filter, Repeat, AlertCircle, CheckCircle2, Clock,
  BarChart3, Gem, ClipboardList, Percent,
} from "lucide-react";
import { toast } from "sonner";
import {
  listLancamentos, upsertLancamento, deleteLancamento, type Lancamento,
  getFinanceiroRelatorio, getDRE,
} from "@/lib/financeiro.functions";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — MULTIUM" },
      { name: "description", content: "Lançamentos, receitas e gastos do negócio." },
    ],
  }),
  component: Financeiro,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const NUM = "font-sans tabular-nums tracking-tight font-semibold";

const CATEGORIAS: { value: string; label: string; emoji: string }[] = [
  { value: "ferramenta", label: "Ferramentas", emoji: "🛠" },
  { value: "plataforma", label: "Plataformas", emoji: "🖥" },
  { value: "salario", label: "Folha Pgto", emoji: "💼" },
  { value: "dev_saas", label: "Dev SaaS", emoji: "💻" },
  { value: "comissao_x1", label: "Comissão X1", emoji: "💰" },
  { value: "comissao_ht", label: "Comissão HT", emoji: "💎" },
  { value: "imposto", label: "Impostos", emoji: "🏛️" },
  { value: "infraestrutura", label: "Infraestrutura", emoji: "📦" },
  { value: "marketing", label: "Marketing", emoji: "🎯" },
  { value: "outros", label: "Outros", emoji: "📌" },
];
const CAT_MAP = new Map(CATEGORIAS.map((c) => [c.value, c]));

function todayISO() {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}
function yearMon(iso: string) {
  return iso ? iso.slice(0, 7) : "";
}

function Financeiro() {
  const fetchAll = useServerFn(listLancamentos);
  const upsertFn = useServerFn(upsertLancamento);
  const deleteFn = useServerFn(deleteLancamento);
  const qc = useQueryClient();

  const { data: all = [], isLoading } = useQuery({
    queryKey: ["financeiro"],
    queryFn: () => fetchAll(),
  });

  const [mes, setMes] = useState(() => todayISO().slice(0, 7));
  const [tipo, setTipo] = useState<"all" | "gasto" | "receita">("all");
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Lancamento | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<"lancamentos" | "relatorios" | "dre">("lancamentos");

  const rowsMes = useMemo(() => all.filter((r) => yearMon(r.data_ref) === mes), [all, mes]);

  const kpis = useMemo(() => {
    const g = rowsMes.filter((r) => r.tipo === "gasto");
    const r = rowsMes.filter((r) => r.tipo === "receita");
    const totalG = g.reduce((s, x) => s + (+x.valor || 0), 0);
    const totalR = r.reduce((s, x) => s + (+x.valor || 0), 0);
    const pendente = rowsMes
      .filter((x) => x.status === "pendente" || x.status === "atrasado")
      .reduce((s, x) => s + (+x.valor || 0), 0);
    const fixos = all
      .filter((x) => x.recorrente && x.tipo === "gasto")
      .reduce((s, x) => s + (+x.valor || 0), 0);
    return {
      gasto: totalG, gastoCount: g.length,
      receita: totalR, receitaCount: r.length,
      saldo: totalR - totalG,
      pendente, fixos,
    };
  }, [rowsMes, all]);

  const filtered = useMemo(() => {
    let rows = rowsMes;
    if (tipo !== "all") rows = rows.filter((r) => r.tipo === tipo);
    if (cat !== "all") rows = rows.filter((r) => r.categoria === cat);
    const term = q.trim().toLowerCase();
    if (term)
      rows = rows.filter(
        (r) =>
          (r.descricao || "").toLowerCase().includes(term) ||
          (r.responsavel || "").toLowerCase().includes(term),
      );
    return rows;
  }, [rowsMes, tipo, cat, q]);

  const meses = useMemo(() => {
    const set = new Set<string>();
    all.forEach((r) => set.add(yearMon(r.data_ref)));
    const cur = todayISO().slice(0, 7);
    set.add(cur);
    return Array.from(set).filter(Boolean).sort().reverse();
  }, [all]);

  const handleSave = async (payload: Partial<Lancamento>, id?: number) => {
    try {
      await upsertFn({
        data: {
          id,
          data: {
            tipo: payload.tipo!, categoria: payload.categoria!,
            descricao: payload.descricao!, valor: Number(payload.valor) || 0,
            data_ref: payload.data_ref!,
            data_vencimento: payload.data_vencimento || null,
            data_pagamento: payload.data_pagamento || null,
            recorrente: !!payload.recorrente,
            status: (payload.status as Lancamento["status"]) || "pendente",
            responsavel: payload.responsavel || null,
            obs: payload.obs || null,
          },
        },
      });
      await qc.invalidateQueries({ queryKey: ["financeiro"] });
      setModalOpen(false);
      setEditing(null);
      toast.success(id ? "Lançamento atualizado" : "Lançamento criado");
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || "tenta de novo"));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Apagar esse lançamento?")) return;
    try {
      await deleteFn({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["financeiro"] });
      toast.success("Lançamento removido");
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || "tenta de novo"));
    }
  };

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto max-w-7xl px-8 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.28em] text-accent">— Caixa</p>
            <h1 className="mt-2 font-display text-3xl leading-tight md:text-4xl">
              <em className="text-accent">Financeiro</em>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Receitas, gastos, recorrências. Tudo num lugar só.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              {meses.map((m) => (
                <option key={m} value={m}>
                  {new Date(m + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </option>
              ))}
            </select>
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" /> Novo lançamento
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-6 flex gap-1 border-b border-border">
          {[
            { id: "lancamentos", label: "Lançamentos", icon: ClipboardList },
            { id: "relatorios", label: "Relatórios", icon: BarChart3 },
            { id: "dre", label: "DRE — Lucro Líquido", icon: Gem },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition ${
                  active ? "text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
              </button>
            );
          })}
        </div>

        {tab === "lancamentos" && (<>
        {/* KPIs */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Receita do mês"
            value={BRL(kpis.receita)}
            sub={`${kpis.receitaCount} lançamentos`}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="emerald"
          />
          <KpiCard
            label="Gasto do mês"
            value={BRL(kpis.gasto)}
            sub={`${kpis.gastoCount} lançamentos`}
            icon={<TrendingDown className="h-4 w-4" />}
            tone="red"
          />
          <KpiCard
            label="Saldo"
            value={BRL(kpis.saldo)}
            sub={kpis.saldo >= 0 ? "no azul" : "no vermelho"}
            icon={<Wallet className="h-4 w-4" />}
            tone={kpis.saldo >= 0 ? "emerald" : "red"}
          />
          <KpiCard
            label="Custos fixos"
            value={BRL(kpis.fixos)}
            sub="recorrentes"
            icon={<Repeat className="h-4 w-4" />}
            tone="violet"
          />
        </div>

        {/* Filtros */}
        <div className="mt-6 rounded-2xl border border-border bg-card/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={tipo === "all"} onClick={() => setTipo("all")}>Todos</FilterChip>
            <FilterChip active={tipo === "gasto"} onClick={() => setTipo("gasto")} tone="red">
              Gastos
            </FilterChip>
            <FilterChip active={tipo === "receita"} onClick={() => setTipo("receita")} tone="emerald">
              Receitas
            </FilterChip>
            <span className="mx-2 h-5 w-px bg-border" />
            <FilterChip active={cat === "all"} onClick={() => setCat("all")}>
              <Filter className="mr-1 inline h-3 w-3" /> Categorias
            </FilterChip>
            {CATEGORIAS.map((c) => (
              <FilterChip key={c.value} active={cat === c.value} onClick={() => setCat(c.value)}>
                <span>{c.emoji}</span> <span>{c.label}</span>
              </FilterChip>
            ))}
            <div className="ml-auto relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..."
                className="w-64 rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card/40">
          <div className="grid grid-cols-[110px_1fr_140px_120px_130px_110px_70px] gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span>Data</span>
            <span>Descrição</span>
            <span>Categoria</span>
            <span>Responsável</span>
            <span className="text-right">Valor</span>
            <span>Status</span>
            <span></span>
          </div>
          {isLoading && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nenhum lançamento nesse filtro.
            </div>
          )}
          {filtered.map((r) => {
            const c = CAT_MAP.get(r.categoria);
            const isGasto = r.tipo === "gasto";
            return (
              <div
                key={r.id}
                className="group grid grid-cols-[110px_1fr_140px_120px_130px_110px_70px] items-center gap-3 border-b border-border/50 px-4 py-3 text-sm transition hover:bg-accent/5"
              >
                <span className="text-xs text-muted-foreground">
                  {new Date(r.data_ref + "T00:00:00").toLocaleDateString("pt-BR", {
                    day: "2-digit", month: "short",
                  })}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.descricao}</p>
                  {r.recorrente && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-widest text-violet-400">
                      <Repeat className="h-2.5 w-2.5" /> recorrente
                    </span>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 truncate rounded-md bg-muted/60 px-2 py-0.5 text-xs">
                  {c?.emoji} {c?.label ?? r.categoria}
                </span>
                <span className="truncate text-xs text-muted-foreground">{r.responsavel || "—"}</span>
                <span className={`text-right ${NUM} ${isGasto ? "text-red-400" : "text-emerald-400"}`}>
                  {isGasto ? "− " : "+ "}{BRL(+r.valor)}
                </span>
                <StatusBadge status={r.status} />
                <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => { setEditing(r); setModalOpen(true); }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-accent"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </>)}

        {tab === "relatorios" && <RelatoriosTab mes={mes} />}
        {tab === "dre" && <DreTab mes={mes} />}
      </div>

      {modalOpen && (
        <LancamentoModal
          initial={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </main>
  );
}

function KpiCard({
  label, value, sub, icon, tone,
}: {
  label: string; value: string; sub: string; icon: React.ReactNode;
  tone: "emerald" | "red" | "violet";
}) {
  const tones = {
    emerald: "text-emerald-400 border-emerald-400/20 bg-emerald-400/[0.04]",
    red: "text-red-400 border-red-400/20 bg-red-400/[0.04]",
    violet: "text-violet-400 border-violet-400/20 bg-violet-400/[0.04]",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-card/40 p-4 ${tones.split(" ").slice(1).join(" ")}`}>
      <div className="flex items-center justify-between">
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          {label}
        </p>
        <span className={tones.split(" ")[0]}>{icon}</span>
      </div>
      <p className={`mt-2 text-2xl ${NUM}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function FilterChip({
  active, onClick, children, tone,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
  tone?: "emerald" | "red";
}) {
  const activeCls = tone === "emerald"
    ? "bg-emerald-400 text-black"
    : tone === "red"
      ? "bg-red-400 text-black"
      : "bg-accent text-accent-foreground";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active ? activeCls : "border border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: Lancamento["status"] }) {
  const cfg = {
    pago: { label: "Pago", icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-400/10" },
    pendente: { label: "Pendente", icon: Clock, cls: "text-amber-400 bg-amber-400/10" },
    atrasado: { label: "Atrasado", icon: AlertCircle, cls: "text-red-400 bg-red-400/10" },
  }[status] || { label: status, icon: Clock, cls: "text-muted-foreground bg-muted/30" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[0.65rem] font-semibold ${cfg.cls}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

function LancamentoModal({
  initial, onClose, onSave,
}: {
  initial: Lancamento | null;
  onClose: () => void;
  onSave: (data: Partial<Lancamento>, id?: number) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Lancamento>>(() => initial ?? {
    tipo: "gasto", categoria: "outros", descricao: "", valor: 0,
    data_ref: todayISO(), status: "pendente", recorrente: false,
  });
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof Lancamento>(k: K, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao?.trim()) { toast.error("Descrição obrigatória"); return; }
    setSaving(true);
    await onSave(form, initial?.id);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-xl">
            {initial ? "Editar lançamento" : "Novo lançamento"}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-6">
          <Field label="Tipo">
            <select value={form.tipo} onChange={(e) => update("tipo", e.target.value)} className={inputCls}>
              <option value="gasto">Gasto</option>
              <option value="receita">Receita</option>
            </select>
          </Field>
          <Field label="Categoria">
            <select value={form.categoria} onChange={(e) => update("categoria", e.target.value)} className={inputCls}>
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Descrição" full>
            <input
              required maxLength={200} value={form.descricao || ""}
              onChange={(e) => update("descricao", e.target.value)}
              className={inputCls} placeholder="Ex: Mensalidade Cursor"
            />
          </Field>
          <Field label="Valor (R$)">
            <input
              required type="number" min="0" step="0.01"
              value={form.valor ?? 0}
              onChange={(e) => update("valor", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Data">
            <input
              required type="date" value={form.data_ref || todayISO()}
              onChange={(e) => update("data_ref", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Vencimento">
            <input
              type="date" value={form.data_vencimento || ""}
              onChange={(e) => update("data_vencimento", e.target.value || null)}
              className={inputCls}
            />
          </Field>
          <Field label="Pagamento">
            <input
              type="date" value={form.data_pagamento || ""}
              onChange={(e) => update("data_pagamento", e.target.value || null)}
              className={inputCls}
            />
          </Field>
          <Field label="Status">
            <select value={form.status || "pendente"} onChange={(e) => update("status", e.target.value)} className={inputCls}>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="atrasado">Atrasado</option>
            </select>
          </Field>
          <Field label="Responsável">
            <input
              maxLength={100} value={form.responsavel || ""}
              onChange={(e) => update("responsavel", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Observações" full>
            <textarea
              maxLength={500} rows={2} value={form.obs || ""}
              onChange={(e) => update("obs", e.target.value)}
              className={inputCls}
            />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox" checked={!!form.recorrente}
              onChange={(e) => update("recorrente", e.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            <Repeat className="h-3.5 w-3.5 text-violet-400" />
            Lançamento recorrente (custo fixo)
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button
            type="submit" disabled={saving}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Salvando..." : initial ? "Atualizar" : "Criar"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "col-span-2" : ""}`}>
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

// ============================================================
// TAB: RELATÓRIOS
// ============================================================
function RelatoriosTab({ mes }: { mes: string }) {
  const fetchRel = useServerFn(getFinanceiroRelatorio);
  const { data, isLoading } = useQuery({
    queryKey: ["financeiro-relatorio", mes],
    queryFn: () => fetchRel({ data: { mes } }),
  });

  if (isLoading || !data) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Carregando relatórios...</div>;
  }

  const maxTrend = Math.max(1, ...data.trend.map((t) => Math.max(t.receita, t.gasto)));

  return (
    <div className="mt-6 space-y-6">
      {/* Trend */}
      <div className="rounded-2xl border border-border bg-card/40 p-5">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="font-display text-lg">Evolução Mensal</h3>
            <p className="text-xs text-muted-foreground">Gastos vs Receitas — últimos 6 meses</p>
          </div>
          <div className="flex items-center gap-3 text-[0.65rem] uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-400" /> Receita</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-400" /> Gasto</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" /> Saldo</span>
          </div>
        </div>
        <div className="mt-6 flex items-end justify-between gap-3 h-56">
          {data.trend.map((t) => {
            const hR = (t.receita / maxTrend) * 100;
            const hG = (t.gasto / maxTrend) * 100;
            const positive = t.saldo >= 0;
            return (
              <div key={t.mes} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-full w-full items-end gap-1">
                  <div className="flex-1 rounded-t bg-gradient-to-t from-emerald-500/30 to-emerald-400 transition-all" style={{ height: `${hR}%` }} title={BRL(t.receita)} />
                  <div className="flex-1 rounded-t bg-gradient-to-t from-red-500/30 to-red-400 transition-all" style={{ height: `${hG}%` }} title={BRL(t.gasto)} />
                </div>
                <div className="w-full text-center">
                  <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                    {new Date(t.mes + "-01").toLocaleDateString("pt-BR", { month: "short" })}
                  </p>
                  <p className={`mt-0.5 font-mono text-[0.7rem] font-bold tabular-nums ${positive ? "text-emerald-400" : "text-red-400"}`}>
                    {positive ? "+" : ""}{BRL(t.saldo)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Breakdown */}
      <div className="rounded-2xl border border-border bg-card/40 p-5">
        <h3 className="font-display text-lg">Breakdown por Categoria</h3>
        <p className="text-xs text-muted-foreground">Distribuição dos gastos do mês selecionado</p>
        <div className="mt-5 space-y-3">
          {data.breakdown.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem gastos nesse mês.</p>
          )}
          {data.breakdown.map((b) => {
            const cat = CAT_MAP.get(b.categoria);
            return (
              <div key={b.categoria}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <span>{cat?.emoji}</span> {cat?.label ?? b.categoria}
                    <span className="text-[0.65rem] font-normal text-muted-foreground">· {b.count} lançamentos</span>
                  </span>
                  <span className={`font-mono tabular-nums font-bold text-red-400`}>
                    {BRL(b.total)} <span className="text-muted-foreground">({b.pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full rounded-full bg-gradient-to-r from-red-500/60 to-red-400" style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fixos */}
      <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.03] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg flex items-center gap-2">
              <Repeat className="h-4 w-4 text-violet-400" /> Gastos Fixos Recorrentes
            </h3>
            <p className="text-xs text-muted-foreground">Despesas mensais automáticas</p>
          </div>
          <p className="font-mono text-2xl font-black tabular-nums text-violet-400">{BRL(data.totalFixos)}</p>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.fixos.length === 0 && (
            <p className="col-span-2 py-6 text-center text-sm text-muted-foreground">
              Marca um lançamento como "recorrente" pra aparecer aqui.
            </p>
          )}
          {data.fixos.map((f) => {
            const cat = CAT_MAP.get(f.categoria);
            return (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{f.descricao}</p>
                  <p className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                    {cat?.emoji} {cat?.label ?? f.categoria}
                  </p>
                </div>
                <p className="font-mono text-sm font-bold tabular-nums text-violet-300">{BRL(f.valor)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB: DRE
// ============================================================
function DreTab({ mes }: { mes: string }) {
  const fetchDre = useServerFn(getDRE);
  const [from, setFrom] = useState(() => mes + "-01");
  const [to, setTo] = useState(() => todayISO());
  const [imposto, setImposto] = useState(0);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["financeiro-dre", from, to],
    queryFn: () => fetchDre({ data: { from, to } }),
  });

  const fatTotal = data?.fatTotal ?? 0;
  const fatCaio = data?.fatCaio ?? 0;
  const fatGu = (data?.fatGustavo ?? 0) * 0.5;
  const fatHt = data?.fatHt ?? 0;

  const custosBase =
    (data?.custos.devSaas.total ?? 0) +
    (data?.custos.folha.total ?? 0) +
    (data?.custos.comissaoX1.total ?? 0) +
    (data?.custos.comissaoHt.total ?? 0);
  const impostoManual = data?.custos.imposto.total ?? 0;
  const impostoPct = fatTotal * (imposto / 100);
  const totalImpostos = impostoManual + impostoPct;
  const custosTotal = custosBase + totalImpostos;
  const lucro = fatTotal - custosTotal;
  const margem = fatTotal > 0 ? (lucro / fatTotal) * 100 : 0;

  return (
    <div className="mt-6 space-y-6">
      {/* Período */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card/40 p-4">
        <Field label="De">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Até">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {isFetching ? "Calculando..." : "Calcular período"}
        </button>
      </div>

      {isLoading && <div className="py-20 text-center text-sm text-muted-foreground">Calculando DRE...</div>}

      {data && (
        <>
          {/* Faturamento */}
          <div className="rounded-2xl border-t-2 border-t-emerald-400 border border-border bg-card/40 p-6">
            <h2 className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-emerald-400">Entrada de Faturamento</h2>
            <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
              <FatBox label="Operação Caio (100%)" value={BRL(fatCaio)} />
              <FatBox label="Operação Gustavo (50%)" value={BRL(fatGu)} sub={`Bruto: ${BRL(data.fatGustavo)}`} />
              <FatBox label="High Ticket (100%)" value={BRL(fatHt)} />
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Faturamento Base Total</p>
              <p className="font-mono text-2xl font-black tabular-nums text-emerald-400">{BRL(fatTotal)}</p>
            </div>
          </div>

          {/* Custos operacionais + comissões */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <CustoBox
              title="Custos Operacionais" tone="violet"
              groups={[
                { label: "Construção SaaS (Dev)", total: data.custos.devSaas.total, itens: data.custos.devSaas.itens },
                { label: "Folha de Pagamento", total: data.custos.folha.total, itens: data.custos.folha.itens },
              ]}
            />
            <CustoBox
              title="Comissões Pagas" tone="amber"
              groups={[
                { label: "Vendedores X1", total: data.custos.comissaoX1.total, itens: data.custos.comissaoX1.itens },
                { label: "High Ticket", total: data.custos.comissaoHt.total, itens: data.custos.comissaoHt.itens },
              ]}
            />
          </div>

          {/* Impostos + Lucro */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-red-400/30 border-t-2 border-t-red-400 bg-red-400/[0.03] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-red-400">Impostos</h2>
                <div className="flex items-center gap-1">
                  <Percent className="h-3 w-3 text-muted-foreground" />
                  <input
                    type="number" min={0} step={0.1} value={imposto}
                    onChange={(e) => setImposto(Number(e.target.value) || 0)}
                    className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-right text-xs"
                    title="% sobre faturamento"
                  />
                </div>
              </div>
              <p className="mt-2 font-mono text-xl font-black tabular-nums text-white">{BRL(totalImpostos)}</p>
              <p className="text-[0.65rem] text-muted-foreground">
                Manual: {BRL(impostoManual)} + {imposto}%: {BRL(impostoPct)}
              </p>
            </div>

            <div className={`md:col-span-2 rounded-2xl border-t-2 p-6 ${lucro >= 0 ? "border-t-emerald-400 border-emerald-400/30 bg-emerald-400/[0.04]" : "border-t-red-400 border-red-400/30 bg-red-400/[0.04]"} border`}>
              <p className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-muted-foreground">
                {lucro >= 0 ? "Lucro Líquido" : "Prejuízo"}
              </p>
              <p className={`mt-2 font-mono text-4xl font-black tabular-nums ${lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {BRL(lucro)}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Faturamento {BRL(fatTotal)} − Custos {BRL(custosTotal)}
                </span>
                <span className={`font-mono font-bold tabular-nums ${lucro >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  Margem: {margem.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-black tabular-nums">{value}</p>
      {sub && <p className="text-[0.65rem] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function CustoBox({
  title, tone, groups,
}: {
  title: string;
  tone: "violet" | "amber";
  groups: { label: string; total: number; itens: { id: number; descricao: string; valor: number }[] }[];
}) {
  const cls = tone === "violet"
    ? "border-violet-400/30 border-t-violet-400 text-violet-400"
    : "border-amber-400/30 border-t-amber-400 text-amber-400";
  return (
    <div className={`rounded-2xl border border-t-2 bg-card/40 p-5 ${cls.split(" ").slice(0, 2).join(" ")}`}>
      <h2 className={`text-[0.65rem] font-black uppercase tracking-[0.3em] ${cls.split(" ")[2]}`}>{title}</h2>
      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <div key={g.label} className="border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between">
              <p className="text-[0.65rem] font-bold uppercase text-muted-foreground">{g.label}</p>
              <p className="font-mono font-black tabular-nums">{BRL(g.total)}</p>
            </div>
            <div className="mt-2 max-h-24 space-y-0.5 overflow-y-auto pr-1">
              {g.itens.length === 0 && <p className="text-[0.65rem] text-muted-foreground">Sem lançamentos</p>}
              {g.itens.map((it) => (
                <div key={it.id} className="flex items-center justify-between border-b border-border/30 py-1 text-[0.7rem]">
                  <span className="truncate text-muted-foreground" title={it.descricao}>{it.descricao}</span>
                  <span className="font-mono font-bold tabular-nums">{BRL(it.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
