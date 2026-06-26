import { useEffect, useMemo, useState } from "react";
import type { DateRange as RDPRange } from "react-day-picker";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export type RangePreset = "hoje" | "ontem" | "semana" | "mes" | "ano" | "7d" | "30d" | "custom";

export type DateRangeValue = {
  preset: RangePreset;
  from: string | null; // YYYY-MM-DD
  to: string | null;
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Retorna a data "hoje" no fuso de São Paulo como Date UTC (00:00). */
function todayBR() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = +parts.find((p) => p.type === "year")!.value;
  const m = +parts.find((p) => p.type === "month")!.value;
  const d = +parts.find((p) => p.type === "day")!.value;
  return new Date(Date.UTC(y, m - 1, d));
}

export function computeRange(preset: RangePreset): DateRangeValue {
  const today = todayBR();
  if (preset === "hoje") return { preset, from: iso(today), to: iso(today) };
  if (preset === "ontem") {
    const y = new Date(today);
    y.setUTCDate(y.getUTCDate() - 1);
    return { preset, from: iso(y), to: iso(y) };
  }
  if (preset === "semana") {
    const weekStart = new Date(today);
    const day = weekStart.getUTCDay();
    weekStart.setUTCDate(weekStart.getUTCDate() - day + (day === 0 ? -6 : 1));
    return { preset, from: iso(weekStart), to: iso(today) };
  }
  if (preset === "7d") {
    const s = new Date(today);
    s.setUTCDate(s.getUTCDate() - 6);
    return { preset, from: iso(s), to: iso(today) };
  }
  if (preset === "30d") {
    const s = new Date(today);
    s.setUTCDate(s.getUTCDate() - 29);
    return { preset, from: iso(s), to: iso(today) };
  }
  if (preset === "mes") {
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { preset, from: iso(monthStart), to: iso(today) };
  }
  if (preset === "ano") {
    return { preset, from: "2026-01-01", to: iso(today) };
  }
  // custom — caller fills from/to
  return { preset: "custom", from: iso(today), to: iso(today) };
}

const PRESETS: { id: Exclude<RangePreset, "custom">; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "2026" },
];

function fmtBR(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function parseISO(s: string | null): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<RDPRange | undefined>(() => ({
    from: parseISO(value.from),
    to: parseISO(value.to),
  }));

  // Sincroniza quando abre o popover ou quando value muda externamente
  useEffect(() => {
    if (open) {
      setPending({ from: parseISO(value.from), to: parseISO(value.to) });
    }
  }, [open, value.from, value.to]);


  const subtitle = useMemo(() => {
    if (!value.from || !value.to) return "Selecione um período";
    return value.from === value.to ? fmtBR(value.from) : `${fmtBR(value.from)} → ${fmtBR(value.to)}`;
  }, [value]);

  const customActive = value.preset === "custom";

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

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={[
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors",
                customActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              ].join(" ")}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Personalizado
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto border-border bg-popover p-0">
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={pending?.from ?? parseISO(value.from)}
              selected={pending}
              onSelect={(r) => setPending(r)}
              className="pointer-events-auto p-3"
            />
            <div className="flex items-center justify-between gap-2 border-t border-border p-2">
              <button
                type="button"
                onClick={() => setPending(undefined)}
                className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50"
              >
                Limpar
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!pending?.from}
                  onClick={() => {
                    if (!pending?.from) return;
                    const from = iso(pending.from);
                    const to = iso(pending.to ?? pending.from);
                    onChange({ preset: "custom", from, to });
                    setOpen(false);
                  }}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:brightness-110 disabled:opacity-40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

      </div>
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
        {subtitle}
      </div>
    </div>
  );
}
