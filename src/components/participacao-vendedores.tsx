import type { VendedorStat } from "@/lib/operacoes.functions";

// Paleta dos vendedores — verde dominante, alguns destaques (laranja/amarelo) pra quebrar
const COLORS = [
  "#22c55e", // green
  "#16a34a",
  "#f97316", // orange
  "#facc15", // amber
  "#86efac", // light green
  "#10b981", // emerald
  "#65a30d", // lime dark
  "#f59e0b",
];

function colorFor(idx: number) {
  return COLORS[idx % COLORS.length];
}

export function ParticipacaoVendedores({
  vendedores,
  loading,
}: {
  vendedores: VendedorStat[];
  loading?: boolean;
}) {
  const max = vendedores.reduce((m, v) => Math.max(m, v.pctTotal), 0) || 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">▰</span>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">
            Participação por Vendedor
          </h2>
        </div>
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
          {vendedores.length} ativos
        </span>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-secondary/30" />
            ))}
          </div>
        ) : vendedores.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            Sem vendas no período.
          </div>
        ) : (
          <div className="space-y-1.5">
            {vendedores.map((v, i) => {
              const widthPct = Math.max(6, (v.pctTotal / max) * 100);
              const color = colorFor(i);
              const pctLabel = (v.pctTotal * 100).toFixed(v.pctTotal < 0.01 ? 1 : 0);
              return (
                <div
                  key={v.utm}
                  className="relative h-11 overflow-hidden rounded-md"
                  style={{ background: `${color}1a` }}
                >
                  <div
                    className="absolute inset-y-0 left-0 transition-[width]"
                    style={{
                      width: `${widthPct}%`,
                      backgroundImage: `linear-gradient(90deg, ${color}, ${color}cc)`,
                    }}
                  />
                  <div className="relative z-10 flex h-full items-center justify-center gap-2">
                    <span className="text-sm font-bold text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                      {v.utm}
                    </span>
                    <span className="text-[0.7rem] font-medium text-foreground/80">
                      {pctLabel}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
