import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// value/onChange use the `datetime-local` format: "YYYY-MM-DDTHH:mm"
type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

function parseLocal(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimePicker({ value, onChange, placeholder = "Escolher data" }: Props) {
  const selected = parseLocal(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
    const arr: Date[] = [];
    let d = start;
    while (d <= end) {
      arr.push(d);
      d = addDays(d, 1);
    }
    return arr;
  }, [viewMonth]);

  const hour = selected ? selected.getHours() : 9;
  const minute = selected ? selected.getMinutes() : 0;

  const update = (d: Date, h = hour, m = minute) => {
    const next = new Date(d);
    next.setHours(h, m, 0, 0);
    onChange(toLocal(next));
  };

  const display = selected
    ? format(selected, "dd 'de' MMM, HH:mm", { locale: ptBR })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          type="button"
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !selected && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{display}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <div className="p-3 w-[300px]">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="icon" type="button" className="h-7 w-7" onClick={() => setViewMonth(subMonths(viewMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-semibold capitalize">
              {format(viewMonth, "MMMM yyyy", { locale: ptBR })}
            </div>
            <Button variant="ghost" size="icon" type="button" className="h-7 w-7" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={i} className="text-[10px] font-medium text-muted-foreground text-center py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const isSel = selected && isSameDay(d, selected);
              const inMonth = isSameMonth(d, viewMonth);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => update(d)}
                  className={cn(
                    "h-8 w-8 rounded-md text-xs transition-colors flex items-center justify-center",
                    !inMonth && "text-muted-foreground/40",
                    inMonth && !isSel && "hover:bg-accent",
                    isToday(d) && !isSel && "border border-primary/50 font-semibold",
                    isSel && "bg-primary text-primary-foreground font-semibold",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Time */}
          <div className="mt-3 pt-3 border-t flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <select
              value={hour}
              onChange={(e) => update(selected ?? new Date(), Number(e.target.value), minute)}
              className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
              ))}
            </select>
            <span className="text-muted-foreground">:</span>
            <select
              value={minute}
              onChange={(e) => update(selected ?? new Date(), hour, Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-8"
              onClick={() => setOpen(false)}
            >
              OK
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
