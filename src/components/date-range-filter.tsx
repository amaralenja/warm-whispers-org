import { useEffect, useMemo, useState } from "react";
import type { DateRange as RDPRange } from "react-day-picker";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export type RangePreset = "hoje" | "ontem" | "7d" | "15d" | "30d" | "custom";

export type DateRangeValue = {
  preset: RangePreset;
  from: string | null; // YYYY-MM-DD
  to: string | null;
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function computeRange(preset: RangePreset): DateRangeValue {
  const today = todayUTC();
  if (preset === "hoje") return { preset, from: iso(today), to: iso(today) };
  if (preset === "ontem") {
    const y = new Date(today); y.setUTCDate(y.getUTCDate() - 1);
    return { preset, from: iso(y), to: iso(y) };
  }
  const daysMap: Record<string, number> = { "7d": 6, "15d": 14, "30d": 29 };
  const back = daysMap[preset];
  if (back != null) {
    const from = new Date(today); from.setUTCDate(from.getUTCDate() - back);
    return { preset, from: iso(from), to: iso(today) };
  }
  // custom — caller fills from/to
  return { preset: "custom", from: iso(today), to: iso(today) };
}

const PRESETS: { id: Exclude<RangePreset, "custom">; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "15d", label: "15 dias" },
  { id: "30d", label: "30 dias" },
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
              defaultMonth={parseISO(value.from)}
              selected={{ from: parseISO(value.from), to: parseISO(value.to) }}
              onSelect={(r) => {
                if (!r?.from) return;
                const from = iso(r.from);
                const to = iso(r.to ?? r.from);
                onChange({ preset: "custom", from, to });
                if (r.to) setOpen(false);
              }}
              className="pointer-events-auto p-3"
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
        {subtitle}
      </div>
    </div>
  );
}
