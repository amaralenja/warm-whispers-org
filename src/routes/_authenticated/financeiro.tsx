import { useMemo, useState, useEffect, useRef } from "react";
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
  getFinanceiroRelatorio, getDRE, getRowsForMonth,
  listConfirmacoes, toggleConfirmacao, type Confirmacao,
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
  { value: "comissao", label: "Comissões", emoji: "💰" },
  { value: "comissao_x1", label: "Comissão X1", emoji: "💰" },
  { value: "comissao_ht", label: "Comissão HT", emoji: "💎" },
  { value: "imposto", label: "Impostos", emoji: "🏛️" },
  { value: "infraestrutura", label: "Infraestrutura", emoji: "📦" },
  { value: "marketing", label: "Marketing", emoji: "🎯" },
  { value: "outros", label: "Outros", emoji: "📌" },
];
const CAT_MAP = new Map(CATEGORIAS.map((c) => [c.value, c]));

function getCatMeta(key: string) {
  const normKey = String(key || "").toLowerCase().trim();
  if (CAT_MAP.has(normKey)) return CAT_MAP.get(normKey)!;
  if (normKey.includes("comiss")) return { value: normKey, label: "Comissão", emoji: "💰" };
  if (normKey.includes("infra") || normKey.includes("equip")) return { value: normKey, label: "Infraestrutura", emoji: "📦" };
  if (normKey.includes("salari") || normKey.includes("folha")) return { value: normKey, label: "Folha Pgto", emoji: "💼" };
  return { value: normKey, label: key || "Outros", emoji: "📌" };
}

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
  const fetchConf = useServerFn(listConfirmacoes);
  const toggleConf = useServerFn(toggleConfirmacao);
  const qc = useQueryClient();

  const { data: all = [], isLoading } = useQuery({
    queryKey: ["financeiro"],
    queryFn: () => fetchAll(),
  });

  const { data: confirmacoes = [] } = useQuery({
    queryKey: ["financeiro-confirmacoes"],
    queryFn: () => fetchConf(),
  });

  const [mes, setMes] = useState(() => todayISO().slice(0, 7));
  const [tipo, setTipo] = useState<"all" | "gasto" | "receita">("all");
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Lancamento | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<"lancamentos" | "relatorios" | "dre">("lancamentos");
  const [recorrencia, setRecorrencia] = useState<"all" | "recorrente" | "avulso">("all");

  const rowsMes = useMemo(() => getRowsForMonth(all, mes, confirmacoes), [all, mes, confirmacoes]);

  const kpis = useMemo(() => {
    const gastos = rowsMes.filter((r) => r.tipo === "gasto");
    const receitas = rowsMes.filter((r) => r.tipo === "receita");
    const totalReceita = receitas.reduce((s, x) => s + (+x.valor || 0), 0);
    const totalGasto = gastos.reduce((s, x) => s + (+x.valor || 0), 0);

    const gastosRealizados = gastos.filter((r) => r.status === "pago");
    const totalGastoRealizado = gastosRealizados.reduce((s, x) => s + (+x.valor || 0), 0);

    const gastosPendentes = gastos.filter((r) => r.status === "pendente" || r.status === "atrasado");
    const totalPendente = gastosPendentes.reduce((s, x) => s + (+x.valor || 0), 0);

    const fixos = all
      .filter((x) => x.recorrente && x.tipo === "gasto")
      .reduce((s, x) => s + (+x.valor || 0), 0);

    return {
      gasto: totalGastoRealizado, gastoCount: gastosRealizados.length,
      receita: totalReceita, receitaCount: receitas.length,
      saldo: totalReceita - totalGastoRealizado,
      pendente: totalPendente, pendenteCount: gastosPendentes.length,
      fixos,
    };
  }, [rowsMes, all]);

  const handleToggleConf = async (lancamentoId: number, mesStr: string) => {
    try {
      await toggleConf({ data: { lancamento_id: lancamentoId, mes: mesStr } });
      await qc.invalidateQueries({ queryKey: ["financeiro-confirmacoes"] });
      await qc.invalidateQueries({ queryKey: ["financeiro"] });
    } catch (e: any) {
      toast.error("Erro ao confirmar: " + (e?.message || "tenta de novo"));
    }
  };

  const filtered = useMemo(() => {
    let rows = rowsMes;
    if (tipo !== "all") rows = rows.filter((r) => r.tipo === tipo);
    if (cat !== "all") rows = rows.filter((r) => r.categoria === cat);
    if (recorrencia === "recorrente") rows = rows.filter((r) => r.recorrente);
    if (recorrencia === "avulso") rows = rows.filter((r) => !r.recorrente);
    const term = q.trim().toLowerCase();
    if (term)
      rows = rows.filter(
        (r) =>
          (r.descricao || "").toLowerCase().includes(term) ||
          (r.responsavel || "").toLowerCase().includes(term),
      );
    return rows;
  }, [rowsMes, tipo, cat, recorrencia, q]);

  const recorrentes = useMemo(() => filtered.filter((r) => r.recorrente), [filtered]);
  const avulsos = useMemo(() => filtered.filter((r) => !r.recorrente), [filtered]);

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
      await qc.invalidateQueries({ queryKey: ["financeiro-confirmacoes"] });
      toast.success("Lançamento removido");
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || "tenta de novo"));
    }
  };

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto max-w-7xl px-8 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border/60 pb-6">
          <div>
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.28em] text-accent">— Caixa</p>
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
              className="rounded-xl border border-border bg-card/60 px-3.5 py-2.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {meses.map((m) => (
                <option key={m} value={m}>
                  {new Date(m + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </option>
              ))}
            </select>
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground shadow-md transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" /> Novo lançamento
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-6 flex gap-1 border-b border-border/60">
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
                className={`relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition ${
                  active ? "text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
              </button>
            );
          })}
        </div>

        {tab === "lancamentos" && (<>
        {/* KPIs */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label="Receita do mês"
            value={BRL(kpis.receita)}
            sub={`${kpis.receitaCount} lançamentos`}
            icon={<TrendingUp className="h-4 w-4" />}
            trend="up"
          />
          <KpiCard
            label="Gasto realizado"
            value={BRL(kpis.gasto)}
            sub={`${kpis.gastoCount} confirmados`}
            icon={<TrendingDown className="h-4 w-4" />}
            trend="down"
          />
          <KpiCard
            label="Saldo"
            value={BRL(kpis.saldo)}
            sub={kpis.saldo >= 0 ? "no azul" : "negativo"}
            icon={<Wallet className="h-4 w-4" />}
            trend={kpis.saldo >= 0 ? "up" : "down"}
          />
          <KpiCard
            label="Custos fixos"
            value={BRL(kpis.fixos)}
            sub={`${all.filter((x) => x.recorrente && x.tipo === "gasto").length} recorrentes`}
            icon={<Repeat className="h-4 w-4" />}
            trend="neutral"
          />
          {kpis.pendente > 0 && (
            <KpiCard
              label="A confirmar"
              value={BRL(kpis.pendente)}
              sub={`${kpis.pendenteCount} não confirmados`}
              icon={<AlertCircle className="h-4 w-4" />}
              trend="warning"
            />
          )}
        </div>

        {/* Filtros */}
        <div className="mt-6 rounded-2xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={tipo === "all"} onClick={() => setTipo("all")}>Todos</FilterChip>
            <FilterChip active={tipo === "gasto"} onClick={() => setTipo("gasto")} tone="red">
              Gastos
            </FilterChip>
            <FilterChip active={tipo === "receita"} onClick={() => setTipo("receita")} tone="emerald">
              Receitas
            </FilterChip>
            <span className="mx-1 h-5 w-px bg-border hidden sm:block" />
            <FilterChip active={recorrencia === "all"} onClick={() => setRecorrencia("all")}>
              Todos (fixo+avulso)
            </FilterChip>
            <FilterChip active={recorrencia === "recorrente"} onClick={() => setRecorrencia("recorrente")} tone="violet">
              <Repeat className="mr-0.5 h-3 w-3" /> Fixos
            </FilterChip>
            <FilterChip active={recorrencia === "avulso"} onClick={() => setRecorrencia("avulso")}>
              Avulsos
            </FilterChip>
            <span className="mx-1 h-5 w-px bg-border hidden sm:block" />
            <FilterChip active={cat === "all"} onClick={() => setCat("all")}>
              <Filter className="mr-1 inline h-3 w-3" /> Categorias
            </FilterChip>
            {CATEGORIAS.map((c) => (
              <FilterChip key={c.value} active={cat === c.value} onClick={() => setCat(c.value)}>
                <span>{c.emoji}</span> <span>{c.label}</span>
              </FilterChip>
            ))}
            <div className="ml-auto relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..."
                className="w-56 rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          <div className="mt-3 sm:hidden relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar lançamento..."
              className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {/* Tabela — Desktop */}
        <div className="mt-4 hidden md:block overflow-hidden rounded-2xl border border-border bg-card/40 shadow-sm">
          <div className="grid grid-cols-[100px_1fr_140px_110px_120px_100px_70px] gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
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
          {recorrencia === "all" && recorrentes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 bg-violet-500/[0.06] border-b border-violet-500/20 px-4 py-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-violet-400">
                <Repeat className="h-3 w-3" />
                Recorrentes ({recorrentes.length})
                <span className="ml-auto flex items-center gap-3 text-[0.55rem]">
                  <span className="text-emerald-400">{recorrentes.filter((r) => r.status === "pago").length} pagos</span>
                  <span className="text-amber-400">{recorrentes.filter((r) => r.status === "pendente").length} pendentes</span>
                  <span className="text-red-400">{recorrentes.filter((r) => r.status === "atrasado").length} atrasados</span>
                  <span className="font-mono text-xs tabular-nums text-violet-300">{BRL(recorrentes.reduce((s, x) => s + (+x.valor || 0), 0))}</span>
                </span>
              </div>
              {recorrentes.map((r) => (
                <LancamentoRow key={r.id} r={r} onEdit={(r) => { setEditing(r); setModalOpen(true); }} onDelete={handleDelete} onToggleConf={handleToggleConf} mes={mes} />
              ))}
            </div>
          )}
          {recorrencia === "all" && avulsos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 bg-muted/20 border-b border-border px-4 py-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Avulsos ({avulsos.length})
                <span className="ml-auto font-mono text-xs tabular-nums">{BRL(avulsos.reduce((s, x) => s + (+x.valor || 0), 0))}</span>
              </div>
              {avulsos.map((r) => (
                <LancamentoRow key={r.id} r={r} onEdit={(r) => { setEditing(r); setModalOpen(true); }} onDelete={handleDelete} onToggleConf={handleToggleConf} mes={mes} />
              ))}
            </div>
          )}
          {recorrencia !== "all" && filtered.map((r) => (
            <LancamentoRow key={r.id} r={r} onEdit={(r) => { setEditing(r); setModalOpen(true); }} onDelete={handleDelete} onToggleConf={handleToggleConf} mes={mes} />
          ))}
        </div>

        {/* Cards — Mobile */}
        <div className="mt-4 md:hidden space-y-3">
          {isLoading && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nenhum lançamento nesse filtro.
            </div>
          )}
          {recorrencia === "all" && recorrentes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-violet-400">
                <Repeat className="h-3 w-3" />
                Recorrentes ({recorrentes.length})
                <span className="ml-auto font-mono text-xs tabular-nums">{BRL(recorrentes.reduce((s, x) => s + (+x.valor || 0), 0))}</span>
              </div>
              {recorrentes.map((r) => (
                <LancamentoCard key={r.id} r={r} onEdit={(r) => { setEditing(r); setModalOpen(true); }} onDelete={handleDelete} onToggleConf={handleToggleConf} mes={mes} />
              ))}
            </div>
          )}
          {recorrencia === "all" && avulsos.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Avulsos ({avulsos.length})
                <span className="ml-auto font-mono text-xs tabular-nums">{BRL(avulsos.reduce((s, x) => s + (+x.valor || 0), 0))}</span>
              </div>
              {avulsos.map((r) => (
                <LancamentoCard key={r.id} r={r} onEdit={(r) => { setEditing(r); setModalOpen(true); }} onDelete={handleDelete} onToggleConf={handleToggleConf} mes={mes} />
              ))}
            </div>
          )}
          {recorrencia !== "all" && filtered.map((r) => (
            <LancamentoCard key={r.id} r={r} onEdit={(r) => { setEditing(r); setModalOpen(true); }} onDelete={handleDelete} onToggleConf={handleToggleConf} mes={mes} />
          ))}
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

function LancamentoRow({
  r, onEdit, onDelete, onToggleConf, mes,
}: {
  r: Lancamento;
  onEdit: (r: Lancamento) => void;
  onDelete: (id: number) => void;
  onToggleConf?: (lancamentoId: number, mes: string) => void;
  mes?: string;
}) {
  const c = CAT_MAP.get(r.categoria);
  const isGasto = r.tipo === "gasto";
  const isRecurrent = r.recorrente;
  const isConfirmed = r.status === "pago";
  const isOverdue = r.status === "atrasado";
  return (
    <div className={`group grid grid-cols-[100px_1fr_140px_110px_120px_100px_70px] items-center gap-3 border-b border-border/50 px-4 py-3 text-sm transition hover:bg-accent/[0.04] ${
      isOverdue ? "bg-red-500/[0.04]" : ""
    }`}>
      <span className="text-xs text-muted-foreground">
        {new Date(r.data_ref + "T00:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit", month: "short",
        })}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {isRecurrent && onToggleConf && mes && (
            <button
              onClick={() => onToggleConf(r.id, mes)}
              className={`shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
                isConfirmed
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : isOverdue
                    ? "border-red-400 bg-red-400/10 hover:bg-red-400/20"
                    : "border-amber-400 bg-amber-400/10 hover:bg-amber-400/20"
              }`}
              title={isConfirmed ? "Pago — clique para desmarcar" : "Marcar como pago"}
            >
              {isConfirmed && <CheckCircle2 className="h-3 w-3" />}
            </button>
          )}
          <p className={`truncate font-semibold ${isOverdue ? "text-red-400" : ""}`}>{r.descricao}</p>
        </div>
        {isRecurrent && (
          <span className={`mt-0.5 inline-flex items-center gap-1 text-[0.55rem] uppercase tracking-widest ${
            isConfirmed ? "text-emerald-400" : isOverdue ? "text-red-400" : "text-violet-400"
          }`}>
            <Repeat className="h-2.5 w-2.5" />
            {isConfirmed ? "pago" : isOverdue ? "atrasado" : "recorrente"}
          </span>
        )}
      </div>
      <span className="inline-flex items-center gap-1 truncate rounded-md bg-muted/50 px-2 py-0.5 text-xs">
        {c?.emoji} {c?.label ?? r.categoria}
      </span>
      <span className="truncate text-xs text-muted-foreground">{r.responsavel || "—"}</span>
      <span className={`text-right ${NUM} ${isGasto ? "text-red-400" : "text-emerald-400"}`}>
        {isGasto ? "− " : "+ "}{BRL(+r.valor)}
      </span>
      <StatusBadge status={r.status} />
      <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={() => onEdit(r)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-accent"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(r.id)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function LancamentoCard({
  r, onEdit, onDelete, onToggleConf, mes,
}: {
  r: Lancamento;
  onEdit: (r: Lancamento) => void;
  onDelete: (id: number) => void;
  onToggleConf?: (lancamentoId: number, mes: string) => void;
  mes?: string;
}) {
  const c = CAT_MAP.get(r.categoria);
  const isGasto = r.tipo === "gasto";
  const isRecurrent = r.recorrente;
  const isConfirmed = r.status === "pago";
  const isOverdue = r.status === "atrasado";
  return (
    <div className={`rounded-xl border p-3.5 transition-colors ${
      isOverdue
        ? "border-red-500/30 bg-red-500/[0.06]"
        : isConfirmed && isRecurrent
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : isRecurrent
            ? "border-violet-500/20 bg-violet-500/[0.04]"
            : "border-border bg-card/60"
    } hover:border-accent/30`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isRecurrent && onToggleConf && mes && (
              <button
                onClick={() => onToggleConf(r.id, mes)}
                className={`shrink-0 h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                  isConfirmed
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : isOverdue
                      ? "border-red-400 bg-red-400/10"
                      : "border-amber-400 bg-amber-400/10"
                }`}
                title={isConfirmed ? "Pago — clique para desmarcar" : "Marcar como pago"}
              >
                {isConfirmed && <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
            )}
            <p className={`truncate text-sm font-bold ${isOverdue ? "text-red-400" : ""}`}>{r.descricao}</p>
            {isRecurrent && (
              <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-widest ${
                isConfirmed
                  ? "bg-emerald-500/15 text-emerald-400"
                  : isOverdue
                    ? "bg-red-500/15 text-red-400"
                    : "bg-violet-500/15 text-violet-400"
              }`}>
                <Repeat className="h-2 w-2" />
                {isConfirmed ? "pago" : isOverdue ? "atrasado" : "fixo"}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5">
              {c?.emoji} {c?.label ?? r.categoria}
            </span>
            {r.responsavel && <span>{r.responsavel}</span>}
            <span>{new Date(r.data_ref + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-base ${NUM} ${isGasto ? "text-red-400" : "text-emerald-400"}`}>
            {isGasto ? "− " : "+ "}{BRL(+r.valor)}
          </span>
          <StatusBadge status={r.status} />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-1 border-t border-border/40 pt-2 opacity-60 transition-opacity focus-within:opacity-100 hover:opacity-100">
        <button
          onClick={() => onEdit(r)}
          className="rounded-md px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent/10 hover:text-accent transition-colors"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(r.id)}
          className="rounded-md px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          Apagar
        </button>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, icon, trend,
}: {
  label: string; value: string; sub: string; icon: React.ReactNode;
  trend: "up" | "down" | "neutral" | "warning";
}) {
  const tones = {
    up: { icon: "text-emerald-400", border: "border-emerald-500/25", bg: "from-emerald-500/[0.08] to-transparent" },
    down: { icon: "text-red-400", border: "border-red-500/25", bg: "from-red-500/[0.08] to-transparent" },
    neutral: { icon: "text-violet-400", border: "border-violet-500/25", bg: "from-violet-500/[0.08] to-transparent" },
    warning: { icon: "text-amber-400", border: "border-amber-500/25", bg: "from-amber-500/[0.08] to-transparent" },
  }[trend];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${tones.bg} ${tones.border} p-5 shadow-sm`}>
      <div className="flex items-center justify-between">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">
          {label}
        </p>
        <span className={tones.icon}>{icon}</span>
      </div>
      <p className={`mt-3 text-2xl ${NUM}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function FilterChip({
  active, onClick, children, tone,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
  tone?: "emerald" | "red" | "violet";
}) {
  const activeCls = tone === "emerald"
    ? "bg-emerald-400 text-black"
    : tone === "red"
      ? "bg-red-400 text-black"
      : tone === "violet"
        ? "bg-violet-400 text-black"
        : "bg-accent text-accent-foreground";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active ? activeCls : "border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-secondary/50"
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

function CustomDatePicker({
  value, onChange, required, label,
}: {
  value: string; onChange: (v: string) => void; required?: boolean; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthName = viewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const prev = () => setViewDate(new Date(year, month - 1, 1));
  const next = () => setViewDate(new Date(year, month + 1, 1));

  const selectDay = (d: number) => {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onChange(iso);
    setOpen(false);
  };

  const display = value
    ? new Date(value + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : "Selecionar...";

  return (
    <div className="relative">
      <label className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground block mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-left text-sm font-medium flex items-center justify-between hover:border-accent/50 transition-colors"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{display}</span>
        <span className="text-muted-foreground text-xs">📅</span>
      </button>
      {open && (
        <div className="absolute z-[60] mt-1.5 w-full rounded-xl border border-border bg-card shadow-2xl p-3 animate-in fade-in duration-100">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prev} className="rounded-lg px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary transition-colors">←</button>
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">{monthName}</span>
            <button type="button" onClick={next} className="rounded-lg px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary transition-colors">→</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[0.55rem] font-bold text-muted-foreground mb-1">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <span key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = iso === value;
              const isToday = iso === todayISO();
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`h-7 w-full rounded-lg text-[0.7rem] font-semibold transition-all ${
                    isSelected
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : isToday
                        ? "bg-accent/15 text-accent font-bold"
                        : "text-foreground hover:bg-secondary"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomSelect({
  value, onChange, options, label,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; emoji?: string }[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground block mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-left text-sm font-medium flex items-center justify-between hover:border-accent/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {selected?.emoji && <span>{selected.emoji}</span>}
          <span>{selected?.label ?? value}</span>
        </span>
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="absolute z-[60] mt-1.5 w-full rounded-xl border border-border bg-card shadow-2xl py-1 animate-in fade-in duration-100">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3.5 py-2 text-sm text-left transition-colors ${
                o.value === value
                  ? "bg-accent/10 text-accent font-semibold"
                  : "text-foreground hover:bg-secondary/60"
              }`}
            >
              {o.emoji && <span>{o.emoji}</span>}
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LancamentoModal({
  initial,
  onClose,
  onSave,
}: {
  initial: Lancamento | null;
  onClose: () => void;
  onSave: (payload: Partial<Lancamento>, id?: number) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Lancamento>>(() => {
    if (initial) return { ...initial };
    return {
      tipo: "gasto",
      categoria: "ferramenta",
      descricao: "",
      valor: undefined,
      data_ref: todayISO(),
      status: "pago",
      recorrente: false,
    };
  });

  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (key: keyof Lancamento, val: any) =>
    setForm((f) => ({ ...f, [key]: val }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao?.trim()) { toast.error("Descrição obrigatória"); return; }
    if (form.valor == null || isNaN(Number(form.valor)) || Number(form.valor) <= 0) {
      toast.error("Informe um valor válido maior que R$ 0");
      return;
    }
    setSaving(true);
    try {
      await onSave(form, initial?.id);
    } finally {
      setSaving(false);
    }
  };

  const isGasto = form.tipo === "gasto";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all"
      >
        {/* Header com Seletor Principal */}
        <div className="border-b border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold">
              {initial ? "Editar Lançamento" : "Novo Lançamento"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/60 p-1">
            <button
              type="button"
              onClick={() => update("tipo", "gasto")}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all ${
                isGasto
                  ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TrendingDown className="h-3.5 w-3.5" />
              💸 Gasto (Saída)
            </button>
            <button
              type="button"
              onClick={() => update("tipo", "receita")}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all ${
                !isGasto
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              💰 Receita (Entrada)
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {/* Valor Principal (Destaque Grande) */}
          <div>
            <label className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground block mb-1">
              Valor (R$)
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-base font-bold text-muted-foreground">R$</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0,00"
                value={form.valor != null ? form.valor : ""}
                onChange={(e) => update("valor", parseFloat(e.target.value) || 0)}
                className={`w-full rounded-xl border border-border bg-background pl-11 pr-4 py-2.5 text-2xl font-black tabular-nums tracking-tight focus:outline-none focus:ring-2 ${
                  isGasto ? "focus:border-rose-500 focus:ring-rose-500/20 text-rose-400" : "focus:border-emerald-500 focus:ring-emerald-500/20 text-emerald-400"
                }`}
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground block mb-1">
              Descrição
            </label>
            <input
              required
              maxLength={200}
              value={form.descricao || ""}
              onChange={(e) => update("descricao", e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder={isGasto ? "Ex: Servidor OpenAI, Gestor de Tráfego, Aluguel" : "Ex: Venda Consultoria, Aporte, Reembolso"}
            />
          </div>

          {/* Categorias em Seleção Rápida */}
          <div>
            <label className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground block mb-1.5">
              Categoria
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIAS.map((c) => {
                const active = form.categoria === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => update("categoria", c.value)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all border ${
                      active
                        ? "bg-accent text-accent-foreground border-accent shadow-sm"
                        : "bg-secondary/40 text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Data & Status */}
          <div className="grid grid-cols-2 gap-3">
            <CustomDatePicker
              value={form.data_ref || todayISO()}
              onChange={(v) => update("data_ref", v)}
              required
              label="Data de Referência"
            />
            <CustomSelect
              value={form.status || "pago"}
              onChange={(v) => {
                update("status", v);
                if (v === "pago" && !form.data_pagamento) update("data_pagamento", todayISO());
              }}
              label="Status"
              options={[
                { value: "pago", label: "Pago (Concluído)", emoji: "✅" },
                { value: "pendente", label: "Pendente", emoji: "⏳" },
                { value: "atrasado", label: "Atrasado", emoji: "🔴" },
              ]}
            />
          </div>

          {/* Recorrência — diferente para gasto vs receita */}
          {isGasto ? (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-violet-500/20 text-violet-300">
                    <Repeat className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">Custo Fixo Mensal</p>
                    <p className="text-[0.65rem] text-muted-foreground">Repete todo mês como despesa no financeiro e dashboard</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => update("recorrente", !form.recorrente)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.recorrente ? "bg-violet-500" : "bg-muted"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.recorrente ? "translate-x-5" : ""}`} />
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                    <Repeat className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">Receita Recorrente</p>
                    <p className="text-[0.65rem] text-muted-foreground">Repete todo mês como entrada no financeiro</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => update("recorrente", !form.recorrente)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.recorrente ? "bg-emerald-500" : "bg-muted"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.recorrente ? "translate-x-5" : ""}`} />
                </button>
              </div>
            </div>
          )}

          {/* Opções Avançadas */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              {showAdvanced ? "▲ Ocultar detalhes" : "▼ Adicionar responsável, vencimento ou notas..."}
            </button>
            {showAdvanced && (
              <div className="mt-3 grid grid-cols-2 gap-3 animate-in fade-in duration-150">
                <CustomDatePicker
                  value={form.data_vencimento || ""}
                  onChange={(v) => update("data_vencimento", v || null)}
                  label="Vencimento"
                />
                <div>
                  <label className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground block mb-1">
                    Responsável
                  </label>
                  <input
                    maxLength={100}
                    placeholder="Ex: Caio, Gustavo, Jessica"
                    value={form.responsavel || ""}
                    onChange={(e) => update("responsavel", e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent transition-colors placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground block mb-1">
                    Observações
                  </label>
                  <textarea
                    maxLength={500}
                    rows={2}
                    placeholder="Detalhes adicionais..."
                    value={form.obs || ""}
                    onChange={(e) => update("obs", e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent transition-colors placeholder:text-muted-foreground/50 resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`rounded-xl px-6 py-2.5 text-xs font-bold text-white shadow-lg transition-all disabled:opacity-50 ${
              isGasto ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
            }`}
          >
            {saving ? "Salvando..." : initial ? "Salvar Alterações" : isGasto ? "Registrar Gasto" : "Registrar Receita"}
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
    return <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">Carregando relatórios financeiros...</div>;
  }

  const maxTrend = Math.max(1, ...data.trend.map((t) => Math.max(t.receita, t.gasto)));

  return (
    <div className="mt-6 space-y-6">
      {/* Evolução Mensal */}
      <div className="rounded-2xl border border-border bg-card/60 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <h3 className="font-display text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              Evolução Mensal
            </h3>
            <p className="text-xs text-muted-foreground">Receitas Brutas (Vendas + Entradas) vs Gastos Totais acumulados</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-400 shadow-sm shadow-emerald-500/20" /> Receita</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-500 shadow-sm shadow-rose-500/20" /> Gasto</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-accent" /> Lucro Liquido</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-6 gap-2 sm:gap-4 h-64 items-end pt-4">
          {data.trend.map((t) => {
            const hR = t.receita > 0 ? Math.max(6, (t.receita / maxTrend) * 100) : 0;
            const hG = t.gasto > 0 ? Math.max(6, (t.gasto / maxTrend) * 100) : 0;
            const positive = t.saldo >= 0;
            const mesNome = new Date(t.mes + "-01T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

            return (
              <div key={t.mes} className="flex flex-col items-center justify-end h-full gap-2 group">
                <div className="w-full flex items-end justify-center gap-1 h-full px-1">
                  {/* Barra de Receita */}
                  <div
                    className="w-1/2 rounded-t-lg bg-gradient-to-t from-emerald-600/40 to-emerald-400 group-hover:brightness-125 transition-all duration-300 relative"
                    style={{ height: `${hR}%` }}
                    title={`Receita (${t.mes}): ${BRL(t.receita)}`}
                  />
                  {/* Barra de Gasto */}
                  <div
                    className="w-1/2 rounded-t-lg bg-gradient-to-t from-rose-600/40 to-rose-400 group-hover:brightness-125 transition-all duration-300 relative"
                    style={{ height: `${hG}%` }}
                    title={`Gasto (${t.mes}): ${BRL(t.gasto)}`}
                  />
                </div>
                <div className="w-full text-center border-t border-border/50 pt-2">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                    {mesNome}
                  </p>
                  <p className={`mt-0.5 text-xs font-extrabold tabular-nums ${positive ? "text-emerald-400" : "text-rose-400"}`}>
                    {positive ? "+" : ""}{BRL(t.saldo)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Breakdown por Categoria */}
      <div className="rounded-2xl border border-border bg-card/60 p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div>
            <h3 className="font-display text-xl font-bold">Breakdown por Categoria</h3>
            <p className="text-xs text-muted-foreground">Distribuição dos custos e saídas do mês selecionado</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {data.breakdown.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground bg-secondary/20 rounded-xl">
              Nenhum gasto ou custo registrado para este mês.
            </div>
          ) : (
            data.breakdown.map((b) => {
              const cat = getCatMeta(b.categoria);
              return (
                <div key={b.categoria} className="group">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2 font-bold text-foreground">
                      <span className="p-1 rounded bg-secondary/60 text-base">{cat.emoji}</span>
                      <span>{cat.label}</span>
                      <span className="text-xs font-normal text-muted-foreground">· {b.count} {b.count === 1 ? "lançamento" : "lançamentos"}</span>
                    </span>
                    <span className="font-mono tabular-nums font-extrabold text-rose-400">
                      {BRL(b.total)} <span className="text-xs text-muted-foreground font-normal">({b.pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60 p-0.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-300 group-hover:brightness-110"
                      style={{ width: `${Math.max(2, b.pct)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Gastos Fixos Recorrentes */}
      <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-card/50 to-transparent p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-violet-500/20 pb-4">
          <div>
            <h3 className="font-display text-xl font-bold flex items-center gap-2 text-violet-300">
              <Repeat className="h-5 w-5 text-violet-400" /> Gastos Fixos Recorrentes
            </h3>
            <p className="text-xs text-muted-foreground">Despesas mensais repetidas automaticamente no financeiro e no dashboard</p>
          </div>
          <div className="text-right">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-violet-400/80 block">Total Fixo Mensal</span>
            <p className="font-mono text-2xl font-black tabular-nums text-violet-300">{BRL(data.totalFixos)}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.fixos.length === 0 ? (
            <div className="col-span-2 py-8 text-center text-sm text-muted-foreground bg-secondary/20 rounded-xl">
              Nenhum gasto fixo cadastrado. Marque o checkbox "Lançamento Recorrente" ao criar um gasto para listá-lo aqui.
            </div>
          ) : (
            data.fixos.map((f) => {
              const cat = getCatMeta(f.categoria);
              return (
                <div key={f.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/80 p-3.5 hover:border-violet-500/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="p-2 rounded-lg bg-secondary/60 text-lg">{cat.emoji}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{f.descricao}</p>
                      <p className="text-[0.65rem] uppercase tracking-widest text-muted-foreground font-semibold">
                        {cat.label}
                      </p>
                    </div>
                  </div>
                  <p className="font-mono text-sm font-extrabold tabular-nums text-violet-300 pl-2">{BRL(f.valor)}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB: DRE (Demonstração do Resultado do Exercício)
// ============================================================
function DreTab({ mes }: { mes: string }) {
  const fetchDre = useServerFn(getDRE);
  const [from, setFrom] = useState(() => mes + "-01");
  const [to, setTo] = useState(() => todayISO());
  const [imposto, setImposto] = useState(0);
  const [showDailyMeta, setShowDailyMeta] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["financeiro-dre", from, to],
    queryFn: () => fetchDre({ data: { from, to } }),
  });

  const fatTotal = data?.fatTotal ?? 0;
  const fatCaio = data?.fatCaio ?? 0;
  const fatGu = (data?.fatGustavo ?? 0) * 0.5;
  const fatHt = data?.fatHt ?? 0;

  const trafegoMeta = data?.custos.trafegoPago.total ?? 0;
  const devSaasTotal = data?.custos.devSaas.total ?? 0;
  const folhaTotal = data?.custos.folha.total ?? 0;
  const comX1Total = data?.custos.comissaoX1.total ?? 0;
  const comHtTotal = data?.custos.comissaoHt.total ?? 0;
  const outrosTotal = data?.custos.outros.total ?? 0;

  const impostoManual = data?.custos.imposto.total ?? 0;
  const impostoPct = fatTotal * (imposto / 100);
  const totalImpostos = impostoManual + impostoPct;

  const totalCustosCalculado = (data?.totalCustos ?? 0) + impostoPct;
  const lucro = fatTotal - totalCustosCalculado;
  const margem = fatTotal > 0 ? (lucro / fatTotal) * 100 : 0;

  return (
    <div className="mt-6 space-y-6">
      {/* Controles de Período */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Field label="Período De">
            <CustomDatePicker value={from} onChange={setFrom} label="" />
          </Field>
          <Field label="Até">
            <CustomDatePicker value={to} onChange={setTo} label="" />
          </Field>

          {/* Atalhos Rápidos */}
          <div className="flex items-center gap-1.5 self-end mb-0.5">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
                setTo(todayISO());
              }}
              className="rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              Este Mês
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 30);
                setFrom(d.toISOString().slice(0, 10));
                setTo(todayISO());
              }}
              className="rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              Últimos 30d
            </button>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-accent-foreground shadow-md transition hover:brightness-110 disabled:opacity-50 flex items-center gap-2"
        >
          {isFetching ? "Calculando DRE..." : "↺ Atualizar DRE"}
        </button>
      </div>

      {isLoading && (
        <div className="py-20 text-center text-sm font-semibold text-muted-foreground animate-pulse">
          Calculando DRE e buscando custos de Tráfego Pago do Meta Ads...
        </div>
      )}

      {data && (
        <>
          {/* KPI Summary Banner */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card/50 to-transparent p-5 shadow-sm">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-400">Faturamento Bruto</span>
              <p className="mt-1 font-mono text-2xl font-black tabular-nums text-emerald-400">{BRL(fatTotal)}</p>
              <p className="mt-1 text-[0.65rem] text-muted-foreground">Vendas Aprovadas (Hotmart + Kiwify + HT)</p>
            </div>

            <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-card/50 to-transparent p-5 shadow-sm">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-rose-400">Total Custos & Operação</span>
              <p className="mt-1 font-mono text-2xl font-black tabular-nums text-rose-400">{BRL(totalCustosCalculado)}</p>
              <p className="mt-1 text-[0.65rem] text-muted-foreground">Meta Ads + Folha + Comissões + Impostos</p>
            </div>

            <div className={`rounded-2xl border p-5 shadow-sm ${lucro >= 0 ? "border-emerald-500/40 bg-emerald-500/15" : "border-rose-500/40 bg-rose-500/15"}`}>
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">Lucro Líquido Real</span>
              <p className={`mt-1 font-mono text-2xl font-black tabular-nums ${lucro >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {lucro >= 0 ? "+" : ""}{BRL(lucro)}
              </p>
              <p className="mt-1 text-[0.65rem] font-medium text-muted-foreground">Faturamento − Custos Totais</p>
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">Margem Líquida</span>
              <p className={`mt-1 font-mono text-2xl font-black tabular-nums ${margem >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {margem.toFixed(1)}%
              </p>
              <p className="mt-1 text-[0.65rem] text-muted-foreground">Retorno sob o faturamento bruto</p>
            </div>
          </div>

          {/* Card Especial: Tráfego Pago Meta Ads Automático */}
          <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-card/50 to-transparent p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-500/20 pb-4">
              <div>
                <h3 className="font-display text-xl font-bold flex items-center gap-2 text-sky-300">
                  <BarChart3 className="h-5 w-5 text-sky-400" />
                  Tráfego Pago (Facebook / Meta Ads API)
                </h3>
                <p className="text-xs text-muted-foreground">Custo diário puxado automaticamente da conta de anúncios do Meta Ads</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-sky-400/80 block">Investimento Meta Ads</span>
                  <p className="font-mono text-2xl font-black tabular-nums text-sky-300">{BRL(trafegoMeta)}</p>
                </div>
                {data.custos.trafegoPago.itens.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDailyMeta(!showDailyMeta)}
                    className="rounded-xl border border-sky-500/40 bg-sky-500/20 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/30 transition-colors"
                  >
                    {showDailyMeta ? "▲ Ocultar Diário" : `▼ Ver por Dia (${data.custos.trafegoPago.itens.length})`}
                  </button>
                )}
              </div>
            </div>

            {/* Tabela Diária de Gastos Meta Ads */}
            {showDailyMeta && (
              <div className="mt-4 max-h-60 overflow-y-auto rounded-xl border border-sky-500/20 bg-background/50 p-3 space-y-1.5 animate-in fade-in duration-200">
                <div className="grid grid-cols-3 text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground pb-2 border-b border-border/40 px-2">
                  <span>Data</span>
                  <span className="text-center">Descrição</span>
                  <span className="text-right">Investido</span>
                </div>
                {data.custos.trafegoPago.itens.map((it) => (
                  <div key={it.id} className="grid grid-cols-3 items-center text-xs py-1 px-2 rounded hover:bg-secondary/40">
                    <span className="font-semibold text-foreground">{it.date ? it.date.split("-").reverse().join("/") : "—"}</span>
                    <span className="truncate text-center text-muted-foreground" title={it.descricao}>{it.descricao}</span>
                    <span className="font-mono font-extrabold text-right tabular-nums text-sky-300">{BRL(it.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Faturamento Discriminado */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 shadow-sm">
            <h2 className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-emerald-400 flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4" /> Entradas de Faturamento Bruto
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FatBox label="Operação Caio (100%)" value={BRL(fatCaio)} />
              <FatBox label="Operação Gustavo (50%)" value={BRL(fatGu)} sub={`Bruto acumulado: ${BRL(data.fatGustavo)}`} />
              <FatBox label="High Ticket (100%)" value={BRL(fatHt)} />
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-4">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Faturamento Total do Período</p>
              <p className="font-mono text-2xl font-black tabular-nums text-emerald-400">{BRL(fatTotal)}</p>
            </div>
          </div>

          {/* Custos Discriminados */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <CustoBox
              title="Custos Operacionais" tone="violet"
              groups={[
                { label: "Tráfego Pago (Meta Ads)", total: trafegoMeta, itens: data.custos.trafegoPago.itens },
                { label: "Construção SaaS (Dev)", total: devSaasTotal, itens: data.custos.devSaas.itens },
                { label: "Folha de Pagamento", total: folhaTotal, itens: data.custos.folha.itens },
                { label: "Outras Despesas", total: outrosTotal, itens: data.custos.outros.itens },
              ]}
            />
            <CustoBox
              title="Comissões Pagas" tone="amber"
              groups={[
                { label: "Comissão Vendedores X1", total: comX1Total, itens: data.custos.comissaoX1.itens },
                { label: "Comissão High Ticket", total: comHtTotal, itens: data.custos.comissaoHt.itens },
              ]}
            />
          </div>

          {/* Impostos + DRE Final */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-rose-500/30 border-t-2 border-t-rose-500 bg-rose-500/[0.03] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-rose-400">Impostos Alíquota</h2>
                <div className="flex items-center gap-1">
                  <Percent className="h-3 w-3 text-muted-foreground" />
                  <input
                    type="number" min={0} step={0.1} value={imposto}
                    onChange={(e) => setImposto(Number(e.target.value) || 0)}
                    className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-right text-xs font-bold"
                    title="% sobre faturamento"
                  />
                </div>
              </div>
              <p className="mt-2 font-mono text-xl font-black tabular-nums text-foreground">{BRL(totalImpostos)}</p>
              <p className="text-[0.65rem] text-muted-foreground">
                Manual: {BRL(impostoManual)} + {imposto}%: {BRL(impostoPct)}
              </p>
            </div>

            <div className={`md:col-span-2 rounded-2xl border-t-4 p-6 shadow-md ${lucro >= 0 ? "border-t-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "border-t-rose-500 border-rose-500/30 bg-rose-500/10"} border`}>
              <p className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-muted-foreground">
                {lucro >= 0 ? "(=) Lucro Líquido Consolidado" : "(=) Prejuízo do Período"}
              </p>
              <p className={`mt-2 font-mono text-4xl font-black tabular-nums ${lucro >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {BRL(lucro)}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs border-t border-border/40 pt-3">
                <span className="text-muted-foreground font-medium">
                  Faturamento {BRL(fatTotal)} − Custos {BRL(totalCustosCalculado)}
                </span>
                <span className={`font-mono font-extrabold tabular-nums px-2.5 py-1 rounded-md ${lucro >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                  Margem Líquida: {margem.toFixed(1)}%
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
    <div className="rounded-xl border border-border/60 bg-background/50 p-4">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-black tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-1 text-[0.65rem] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function CustoBox({
  title, tone, groups,
}: {
  title: string;
  tone: "violet" | "amber";
  groups: { label: string; total: number; itens: { id: number | string; descricao: string; valor: number; date?: string }[] }[];
}) {
  const cls = tone === "violet"
    ? "border-violet-500/30 border-t-violet-400 text-violet-400"
    : "border-amber-500/30 border-t-amber-400 text-amber-400";
  return (
    <div className={`rounded-2xl border border-t-2 bg-card/60 p-5 shadow-sm ${cls.split(" ").slice(0, 2).join(" ")}`}>
      <h2 className={`text-[0.65rem] font-black uppercase tracking-[0.3em] ${cls.split(" ")[2]}`}>{title}</h2>
      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <div key={g.label} className="border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between">
              <p className="text-[0.65rem] font-bold uppercase text-muted-foreground">{g.label}</p>
              <p className="font-mono font-black tabular-nums text-foreground">{BRL(g.total)}</p>
            </div>
            <div className="mt-2 max-h-28 space-y-0.5 overflow-y-auto pr-1">
              {g.itens.length === 0 && <p className="text-[0.65rem] text-muted-foreground py-1">Sem lançamentos</p>}
              {g.itens.map((it) => (
                <div key={it.id} className="flex items-center justify-between border-b border-border/30 py-1 text-[0.7rem]">
                  <span className="truncate text-muted-foreground" title={it.descricao}>{it.descricao}</span>
                  <span className="font-mono font-bold tabular-nums text-foreground">{BRL(it.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
