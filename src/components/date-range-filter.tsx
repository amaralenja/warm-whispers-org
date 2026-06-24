import { useMemo } from "react";

export type RangePreset = "hoje" | "7d" | "30d" | "mes" | "tudo";

export type DateRangeValue = {
  preset: RangePreset;
  from: string | null; // YYYY-MM-DD
  to: string | null;
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function computeRange(preset: RangePreset): DateRangeValue {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (preset === "tudo") return { preset, from: null, to: null };
  if (preset === "hoje") return { preset, from: iso(today), to: iso(today) };
  if (preset === "7d") {
    const from = new Date(today); from.setUTCDate(from.getUTCDate() - 6);
    return { preset, from: iso(from), to: iso(today) };
  }
  if (preset === "30d") {
    const from = new Date(today); from.setUTCDate(from.getUTCDate() - 29);
    return { preset, from: iso(from), to: iso(today) };
  }
  // mes
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { preset, from: iso(from), to: iso(today) };
}

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Mês" },
  { id: "tudo", label: "Tudo" },
];

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  const subtitle = useMemo(() => {
    if (value.preset === "tudo" || !value.from || !value.to) return "Todo o período";
    const fmt = (s: string) => {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y.slice(2)}`;
    };
    return value.from === value.to ? fmt(value.from) : `${fmt(value.from)} → ${fmt(value.to)}`;
  }, [value]);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card/40 p-1">
        {PRESETS.map((p) => {
          const active = p.id === value.preset;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(computeRange(p.id))}
              className={[
                "rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              ].join(" ")}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
        {subtitle}
      </div>
    </div>
  );
}
