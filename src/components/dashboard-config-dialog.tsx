import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { useDashboardConfig, type DashboardConfig } from "@/lib/dashboard-config";
import { ACCENTS, BASE_WORKSPACES } from "@/lib/workspace-context";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  experts: { id: number | string; nome: string }[];
  scoped?: boolean;
  scopedName?: string;
};

function accentFor(name?: string | null): string {
  const bases = BASE_WORKSPACES ?? [];
  const accents = ACCENTS ?? [];
  const fallback = accents[0]?.hex ?? "#e94560";
  if (!name || typeof name !== "string") return fallback;
  const base = bases.find((b) => b.nome === name);
  if (base) return base.accent.hex;
  if (accents.length === 0) return fallback;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return accents[h % accents.length].hex;
}

export function DashboardConfigDialog({ open, onOpenChange, experts, scoped, scopedName }: Props) {
  const { config, getShare, update, setShare } = useDashboardConfig();
  const [draft, setDraft] = useState<DashboardConfig>(config);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) setDraft(config); }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  const list = scoped && scopedName
    ? experts.filter((e) => e.nome === scopedName)
    : experts;

  function patchShare(name: string, val: number) {
    const v = Math.max(0, Math.min(100, Math.round(val)));
    setDraft((d) => ({ ...d, sharePct: { ...d.sharePct, [name]: v } }));
  }

  function handleSave() {
    const mergedShare = { ...config.sharePct };
    for (const e of list) {
      const desired = draft.sharePct[e.nome] ?? getShare(e.nome);
      mergedShare[e.nome] = Math.max(0, Math.min(100, Math.round(desired)));
    }
    update({
      sharePct: mergedShare,
      includeHighTicket: draft.includeHighTicket,
      showFinanceiro: draft.showFinanceiro,
      showGastosCard: draft.showGastosCard,
    });
    onOpenChange(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex">
      {/* backdrop */}
      <div
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in duration-200"
      />

      {/* painel lateral */}
      <aside
        className="relative ml-auto flex h-full w-full max-w-[440px] flex-col border-l border-border bg-[oklch(0.16_0.006_270)] shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.6)] animate-in slide-in-from-right duration-300"
        style={{
          backgroundImage:
            "radial-gradient(120% 60% at 100% 0%, rgba(233,69,96,0.10), transparent 60%)",
        }}
      >
        {/* header */}
        <header className="relative px-7 pt-7 pb-5">
          <div className="flex items-center justify-between">
            <div className="text-[0.62rem] uppercase tracking-[0.32em] text-muted-foreground">
              Painel de controle
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <h2 className="mt-2 font-display text-3xl leading-tight text-foreground">
            {scoped && scopedName ? (
              <>Ajustar <span className="italic text-accent">{scopedName}</span></>
            ) : (
              <>Configurar <span className="italic text-accent">Dashboard</span></>
            )}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {scoped
              ? "Defina como esta operação aparece nos KPIs."
              : "O que aparece e como o lucro é calculado."}
          </p>
          <div className="mt-5 h-px w-full bg-gradient-to-r from-accent/40 via-border to-transparent" />
        </header>

        {/* corpo scrollável */}
        <div className="flex-1 overflow-y-auto px-7 pb-6">
          {/* Nossa parte */}
          {list.length > 0 && (
            <section className="space-y-5">
              <SectionLabel index="01" title="Nossa parte" subtitle="% do bruto que fica pra nós" />
              <div className="space-y-5">
                {list.map((e) => {
                  const v = draft.sharePct[e.nome] ?? getShare(e.nome);
                  const hex = accentFor(e.nome);
                  return (
                    <RangeRow
                      key={e.id}
                      label={e.nome}
                      value={v}
                      color={hex}
                      onChange={(val) => patchShare(e.nome, val)}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* High Ticket */}
          {!scoped && (
            <section className="mt-8 space-y-4">
              <SectionLabel index="02" title="High Ticket" subtitle="Como entra no consolidado" />
              <ToggleRow
                label="Incluir High Ticket no Total + Saldo"
                desc="Soma ht_vendas aos KPIs de Low Ticket."
                checked={draft.includeHighTicket}
                onChange={(v) => setDraft((d) => ({ ...d, includeHighTicket: v }))}
              />
            </section>
          )}

          {/* Visibilidade */}
          <section className="mt-8 space-y-4">
            <SectionLabel index={scoped ? "02" : "03"} title="Visibilidade" subtitle="O que aparece na tela" />
            <ToggleRow
              label="KPIs Financeiros"
              desc="Lucro, gastos e saldo."
              checked={draft.showFinanceiro}
              onChange={(v) => setDraft((d) => ({ ...d, showFinanceiro: v }))}
            />
            <ToggleRow
              label="Card de Gastos do Mês"
              desc="Bloco dedicado ao total gasto no período."
              checked={draft.showGastosCard}
              onChange={(v) => setDraft((d) => ({ ...d, showGastosCard: v }))}
            />
          </section>
        </div>

        {/* footer */}
        <footer className="border-t border-border bg-[oklch(0.15_0.006_270)] px-7 py-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-sm text-muted-foreground transition hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="group inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-[0_8px_24px_-8px_rgba(233,69,96,0.6)] transition hover:brightness-110 active:scale-[0.98]"
            >
              <Check className="h-4 w-4" />
              Salvar alterações
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function SectionLabel({ index, title, subtitle }: { index: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-display text-xs text-accent/70 tabular-nums">{index}</span>
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-[0.7rem] text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

function RangeRow({
  label, value, color, onChange,
}: { label: string; value: number; color: string; onChange: (v: number) => void }) {
  return (
    <div
      className="group rounded-xl border border-border/60 bg-card/40 p-4 transition hover:border-[color:var(--rr-c)]/40"
      style={{ ["--rr-c" as any]: color }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 12px ${color}` }}
          />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="flex items-baseline gap-1 font-display">
          <span className="text-2xl leading-none tabular-nums" style={{ color }}>{value}</span>
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>

      <div className="relative mt-4 h-6">
        {/* track */}
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-secondary/60" />
        {/* fill */}
        <div
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, ${color}aa, ${color})`,
            boxShadow: `0 0 10px ${color}66`,
          }}
        />
        {/* thumb */}
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-transform group-hover:scale-110"
          style={{ left: `${value}%` }}
        >
          <div
            className="h-4 w-4 rounded-full border-2 bg-background"
            style={{ borderColor: color, boxShadow: `0 0 0 4px ${color}22` }}
          />
        </div>
        {/* input invisível em cima */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`${label} %`}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-xl border border-border/60 bg-card/40 p-4 text-left transition hover:border-accent/30 hover:bg-card/60"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {desc && <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>}
      </div>
      <span
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? "bg-accent" : "bg-secondary"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
