import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Clock,
  MapPin,
  Users,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  List,
  LayoutGrid,
  Zap,
  CheckCircle2,
  XCircle,
  CalendarClock,
  X,
  BarChart3,
  TrendingUp,
  DollarSign,
  Target,
  Percent,
  PhoneCall,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { ShowUpDialog, getEventLink, getAllEventLinks, getNoShow, getAllNoShows, markNoShow, unmarkNoShow } from "@/components/showup-dialog";
import { UserX } from "lucide-react";
import { LeadSearchPicker } from "@/components/lead-search-picker";
import { DateRangeFilter, computeRange, type DateRangeValue } from "@/components/date-range-filter";
import { DateTimePicker } from "@/components/datetime-picker";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  type CalendarEvent,
} from "@/lib/google-calendar.functions";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string) {
  return new Date(local).toISOString();
}

type FormState = {
  id?: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  attendees: string[];
};

const emptyForm = (base?: Date): FormState => {
  const now = base ?? new Date();
  const start = new Date(now);
  start.setHours(now.getHours() + 1, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    summary: "",
    description: "",
    location: "",
    start: toLocalInput(start.toISOString()),
    end: toLocalInput(end.toISOString()),
    attendees: [""],
  };
};

function evDate(ev: CalendarEvent) {
  return new Date(ev.start.dateTime || ev.start.date || "");
}

// Distinct, high-contrast color per attendee/title — deterministic hash
const EVENT_PALETTE = [
  { bg: "bg-rose-500/25",    border: "border-rose-400",    text: "text-rose-100",    dot: "bg-rose-400" },
  { bg: "bg-amber-500/25",   border: "border-amber-400",   text: "text-amber-100",   dot: "bg-amber-400" },
  { bg: "bg-emerald-500/25", border: "border-emerald-400", text: "text-emerald-100", dot: "bg-emerald-400" },
  { bg: "bg-sky-500/25",     border: "border-sky-400",     text: "text-sky-100",     dot: "bg-sky-400" },
  { bg: "bg-violet-500/25",  border: "border-violet-400",  text: "text-violet-100",  dot: "bg-violet-400" },
  { bg: "bg-pink-500/25",    border: "border-pink-400",    text: "text-pink-100",    dot: "bg-pink-400" },
  { bg: "bg-cyan-500/25",    border: "border-cyan-400",    text: "text-cyan-100",    dot: "bg-cyan-400" },
  { bg: "bg-orange-500/25",  border: "border-orange-400",  text: "text-orange-100",  dot: "bg-orange-400" },
  { bg: "bg-lime-500/25",    border: "border-lime-400",    text: "text-lime-100",    dot: "bg-lime-400" },
  { bg: "bg-fuchsia-500/25", border: "border-fuchsia-400", text: "text-fuchsia-100", dot: "bg-fuchsia-400" },
];

function isGuest(a: NonNullable<CalendarEvent["attendees"]>[number]): boolean {
  if (!a.email) return false;
  if (a.organizer || a.self || a.resource) return false;
  if (a.email.includes("calendar.google")) return false;
  if (a.email.endsWith(".iam.gserviceaccount.com")) return false;
  return true;
}
function guestOf(ev: CalendarEvent) {
  return ev.attendees?.find(isGuest);
}
function colorKeyFor(ev: CalendarEvent): string {
  const att = guestOf(ev);
  return (att?.displayName || att?.email || ev.summary || ev.id || "x").toLowerCase().trim();
}
function colorFor(ev: CalendarEvent) {
  const key = colorKeyFor(ev);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return EVENT_PALETTE[h % EVENT_PALETTE.length];
}
function personLabel(ev: CalendarEvent): string {
  const att = guestOf(ev);
  return att?.displayName || att?.email?.split("@")[0] || "";
}

function CalendarPage() {
  const qc = useQueryClient();
  const list = useServerFn(listEvents);
  const create = useServerFn(createEvent);
  const update = useServerFn(updateEvent);
  const del = useServerFn(deleteEvent);

  const [view, setView] = useState<"month" | "list" | "metrics">("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [range, setRange] = useState<DateRangeValue>(() => computeRange("hoje"));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["gcal-events"],
    queryFn: () => list({ data: {} }),
    refetchInterval: 60_000,
  });

  const events = data?.items || [];

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    const days: Date[] = [];
    let d = start;
    while (d <= end) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = format(evDate(ev), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => evDate(a).getTime() - evDate(b).getTime());
    }
    return map;
  }, [events]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = format(evDate(ev), "yyyy-MM-dd");
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(ev);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  // Conflict detection: any event overlapping the chosen [start, end), excluding the one being edited.
  const conflicts = useMemo(() => {
    if (!form.start || !form.end) return [] as CalendarEvent[];
    const s = new Date(form.start).getTime();
    const e = new Date(form.end).getTime();
    if (!isFinite(s) || !isFinite(e) || e <= s) return [];
    return events.filter((ev) => {
      if (form.id && ev.id === form.id) return false;
      const es = new Date(ev.start.dateTime || ev.start.date || "").getTime();
      const ee = new Date(ev.end?.dateTime || ev.end?.date || ev.start.dateTime || ev.start.date || "").getTime();
      if (!isFinite(es) || !isFinite(ee)) return false;
      return es < e && ee > s;
    });
  }, [events, form.start, form.end, form.id]);
  const hasConflict = conflicts.length > 0;

  const saveMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        summary: f.summary,
        description: f.description || undefined,
        location: f.location || undefined,
        start: fromLocalInput(f.start),
        end: fromLocalInput(f.end),
        attendees: f.attendees
          .map((s) => s.trim())
          .filter((s) => s.includes("@")),
      };
      if (f.id) return update({ data: { id: f.id, ...payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      toast.success("Evento salvo");
      setDialogOpen(false);
      setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["gcal-events"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Evento removido");
      qc.invalidateQueries({ queryKey: ["gcal-events"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao remover"),
  });

  function openCreate(base?: Date) {
    setForm(emptyForm(base));
    setDialogOpen(true);
  }

  function openEdit(ev: CalendarEvent) {
    setForm({
      id: ev.id,
      summary: ev.summary || "",
      description: ev.description || "",
      location: ev.location || "",
      start: toLocalInput(ev.start.dateTime || ev.start.date),
      end: toLocalInput(ev.end.dateTime || ev.end.date),
      attendees: (ev.attendees || []).map((a) => a.email).filter(Boolean).concat(""),
    });
    setDialogOpen(true);
  }

  const weekdayLabels = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

  // Panel events: if user clicked a day → that day only; otherwise filtered by global range
  const panelEvents = useMemo(() => {
    if (selectedDay) {
      return eventsByDay.get(format(selectedDay, "yyyy-MM-dd")) || [];
    }
    const from = range.from ? new Date(range.from + "T00:00:00") : null;
    const to = range.to ? new Date(range.to + "T23:59:59") : null;
    return events
      .filter((ev) => {
        const d = evDate(ev);
        if (isNaN(d.getTime())) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .sort((a, b) => evDate(a).getTime() - evDate(b).getTime());
  }, [selectedDay, eventsByDay, events, range]);

  const PRESET_LABELS: Record<string, string> = {
    hoje: "Hoje",
    ontem: "Ontem",
    semana: "Esta semana",
    "7d": "Últimos 7 dias",
    "15d": "Últimos 15 dias",
    "30d": "Últimos 30 dias",
    mes: "Este mês",
    personalizado: "Período personalizado",
  };
  const panelTitle = selectedDay
    ? format(selectedDay, "EEEE, dd 'de' MMMM", { locale: ptBR })
    : PRESET_LABELS[range.preset] || "Período selecionado";

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Calendário Calls</h1>
            <p className="text-sm text-muted-foreground">
              Google Agenda — sincronizado em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border bg-card p-0.5">
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
                view === "month"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-4 w-4" /> Mês
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
                view === "list"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4" /> Lista
            </button>
            <button
              onClick={() => setView("metrics")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
                view === "metrics"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="h-4 w-4" /> Métricas
            </button>
          </div>

          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openCreate()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo evento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{form.id ? "Editar evento" : "Novo evento"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Título</Label>
                  <Input
                    value={form.summary}
                    onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    placeholder="Reunião com cliente"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Início</Label>
                    <DateTimePicker
                      value={form.start}
                      onChange={(v) => {
                        const next: Partial<FormState> = { start: v };
                        const d = new Date(v);
                        if (!isNaN(d.getTime())) {
                          const endDate = new Date(d.getTime() + 60 * 60 * 1000);
                          next.end = toLocalInput(endDate.toISOString());
                        }
                        setForm({ ...form, ...next });
                      }}
                    />
                  </div>
                  <div>
                    <Label>Fim</Label>
                    <DateTimePicker
                      value={form.end}
                      onChange={(v) => setForm({ ...form, end: v })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Local</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Google Meet, endereço, etc."
                  />
                </div>
                <div>
                  <Label>Convidados</Label>
                  <div className="space-y-2 mt-1">
                    {form.attendees.map((email, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={email}
                          onChange={(e) => {
                            const next = [...form.attendees];
                            next[idx] = e.target.value;
                            // auto-add new empty field when typing in the last one
                            if (idx === next.length - 1 && e.target.value.trim() !== "") {
                              next.push("");
                            }
                            setForm({ ...form, attendees: next });
                          }}
                          placeholder={idx === 0 ? "cliente@empresa.com" : "outro@empresa.com (opcional)"}
                          type="email"
                        />
                        {form.attendees.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const next = form.attendees.filter((_, i) => i !== idx);
                              setForm({ ...form, attendees: next.length ? next : [""] });
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setForm({ ...form, attendees: [...form.attendees, ""] })}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Adicionar convidado
                      </Button>
                      <LeadSearchPicker
                        onPick={(lead) => {
                          if (!lead.email) {
                            toast.error("Esse lead não tem e-mail cadastrado");
                            return;
                          }
                          const emails = form.attendees.filter((e) => e.trim());
                          if (emails.includes(lead.email)) {
                            toast.info("Lead já adicionado");
                            return;
                          }
                          setForm({ ...form, attendees: [...emails, lead.email, ""] });
                          toast.success(`${lead.nome || lead.email} adicionado`);
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>
              {hasConflict && (
                <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm">
                  <p className="font-semibold text-rose-300">⚠ Este horário já está ocupado</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-rose-200/90">
                    {conflicts.slice(0, 4).map((c) => (
                      <li key={c.id}>
                        • {c.summary || "(sem título)"} —{" "}
                        {format(new Date(c.start.dateTime || c.start.date || ""), "HH:mm")}–
                        {format(new Date(c.end.dateTime || c.end.date || ""), "HH:mm")}
                      </li>
                    ))}
                    {conflicts.length > 4 && <li>• +{conflicts.length - 4} outros</li>}
                  </ul>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => saveMutation.mutate(form)}
                  disabled={!form.summary || !form.start || !form.end || hasConflict || saveMutation.isPending}
                  title={hasConflict ? "Horário ocupado — escolha outro" : undefined}
                >
                  {saveMutation.isPending ? "Salvando..." : hasConflict ? "Horário ocupado" : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold text-destructive mb-1">Erro ao carregar eventos</p>
            <p className="text-muted-foreground break-all">{(error as Error).message}</p>
          </CardContent>
        </Card>
      ) : null}

      {view === "metrics" ? (
        <MetricsView events={events} range={range} setRange={setRange} />
      ) : (
        <StatsCards events={events} range={range} setRange={setRange} />
      )}

      {view === "month" && (
        <Card className="bg-card/60">
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold capitalize">
                📅 {panelTitle}
                {panelEvents.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground normal-case">
                    ({panelEvents.length} {panelEvents.length === 1 ? "evento" : "eventos"})
                  </span>
                )}
                {!selectedDay && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">
                    · filtro do período
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openCreate(selectedDay ?? new Date())}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
                {selectedDay && (
                  <Button size="sm" variant="ghost" onClick={() => setSelectedDay(null)} title="Voltar ao filtro do período">
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            {panelEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {selectedDay ? "Nenhum evento neste dia." : "Nenhum evento no período selecionado."}
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {panelEvents.map((ev) => (
                  <EventRow
                    key={ev.id}
                    ev={ev}
                    onEdit={() => openEdit(ev)}
                    onDelete={() => {
                      if (confirm("Remover este evento?")) deleteMutation.mutate(ev.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {view === "month" ? (
        <Card className="overflow-hidden">
          {/* Month navigator */}
          <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
                Hoje
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-lg font-semibold capitalize">
              {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
            </h2>
            <div className="w-[150px]" />
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {weekdayLabels.map((w) => (
              <div
                key={w}
                className="py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 grid-rows-6">
            {monthDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) || [];
              const inMonth = isSameMonth(day, cursor);
              const today = isToday(day);
              const selected = selectedDay && isSameDay(day, selectedDay);

              return (
                <div
                  key={key}
                  onClick={() => setSelectedDay(day)}
                  onDoubleClick={() => openCreate(day)}
                  className={`group relative min-h-[150px] border-b border-r border-border p-2 text-left transition hover:bg-muted/30 ${
                    inMonth ? "bg-background" : "bg-muted/10"
                  } ${selected ? "ring-2 ring-accent ring-inset" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                        today
                          ? "bg-accent text-accent-foreground"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted-foreground/50"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {dayEvents.length > 2 && (
                      <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        +{dayEvents.length - 2}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <MonthEventChip
                        key={ev.id}
                        ev={ev}
                        onEdit={() => openEdit(ev)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

      ) : view === "list" ? (
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando eventos...</p>
          ) : grouped.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Nenhum evento encontrado.
              </CardContent>
            </Card>
          ) : (
            grouped.map(([day, evs]) => (
              <Card key={day}>
                <div className="border-b border-border px-4 py-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {format(parseISO(day), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </p>
                </div>
                <div className="space-y-2 p-3">
                  {evs.map((ev) => (
                    <EventRow
                      key={ev.id}
                      ev={ev}
                      onEdit={() => openEdit(ev)}
                      onDelete={() => {
                        if (confirm("Remover este evento?")) deleteMutation.mutate(ev.id);
                      }}
                    />
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function StatsCards({ events, range, setRange }: { events: CalendarEvent[]; range: DateRangeValue; setRange: (v: DateRangeValue) => void }) {

  const stats = useMemo(() => {
    const now = new Date();
    const from = range.from ? new Date(range.from + "T00:00:00") : null;
    const to = range.to ? new Date(range.to + "T23:59:59") : null;
    const links = getAllEventLinks();
    const noshows = getAllNoShows();
    let agendadas = 0;
    let showup = 0;
    let noshow = 0;
    let proximas = 0;
    for (const ev of events) {
      const d = new Date(ev.start.dateTime || ev.start.date || "");
      if (isNaN(d.getTime())) continue;
      if (from && d < from) continue;
      if (to && d > to) continue;
      agendadas++;
      const past = d < now;
      const linked = !!links[ev.id];
      const isNoShow = !!noshows[ev.id];
      if (isNoShow) noshow++;
      else if (past && linked) showup++;
      else if (past && !linked) noshow++;
      else if (!past) proximas++;
    }
    return { agendadas, showup, noshow, proximas };
  }, [events, range]);

  const cards = [
    { label: "Agendadas no período", value: stats.agendadas, icon: CalendarIcon, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Próximas calls", value: stats.proximas, icon: CalendarClock, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Show-up confirmado", value: stats.showup, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "No-show", value: stats.noshow, icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/10" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          📊 Filtro afeta as <strong>métricas</strong> e a <strong>lista de eventos</strong> abaixo do calendário. Clique num dia pra ver só ele.
        </p>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${c.bg} ${c.color}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</p>
                <p className="text-2xl font-bold tabular-nums">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}



function MonthEventChip({ ev, onEdit }: { ev: CalendarEvent; onEdit: () => void }) {
  const [showUpOpen, setShowUpOpen] = useState(false);
  const [, force] = useState(0);
  const c = colorFor(ev);
  const time = ev.start.dateTime ? format(new Date(ev.start.dateTime), "HH:mm") : "";
  const person = personLabel(ev);
  const title = ev.summary || "(sem título)";
  const link = getEventLink(ev.id);
  const noShow = getNoShow(ev.id);
  const guest = guestOf(ev);
  const attendeeEmail = guest?.email;
  const attendeeName = guest?.displayName;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      className={`group/chip relative rounded-md border-l-4 ${c.border} ${c.bg} px-2 py-1.5 cursor-pointer hover:brightness-125 transition`}
      title={`${time} ${title}${person ? " — " + person : ""}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {time && (
          <span className={`text-[10px] font-bold tabular-nums ${c.text} shrink-0`}>{time}</span>
        )}
        <span className={`truncate text-[11px] font-semibold ${c.text} flex-1`}>
          {person || title}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowUpOpen(true);
          }}
          className={`opacity-0 group-hover/chip:opacity-100 transition shrink-0 rounded p-0.5 hover:bg-black/30 ${link ? "text-emerald-300" : "text-amber-300"}`}
          title={link ? "Re-disparar ShowUp" : "Disparar ShowUp"}
        >
          <Zap className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (noShow) { unmarkNoShow(ev.id); toast.success("NoShow removido"); }
            else { markNoShow(ev.id); toast.success("Marcado como NoShow"); }
            force((n) => n + 1);
          }}
          className={`opacity-0 group-hover/chip:opacity-100 transition shrink-0 rounded p-0.5 hover:bg-black/30 ${noShow ? "text-rose-300" : "text-muted-foreground"}`}
          title={noShow ? "Desmarcar NoShow" : "Marcar como NoShow"}
        >
          <UserX className="h-3 w-3" />
        </button>
      </div>
      {person && time && (
        <p className={`truncate text-[10px] opacity-80 ${c.text}`}>{title}</p>
      )}
      {noShow && (
        <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background" title="NoShow" />
      )}
      {link && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-background" />
      )}
      <ShowUpDialog
        open={showUpOpen}
        onOpenChange={setShowUpOpen}
        eventId={ev.id}
        defaultEmail={attendeeEmail}
        defaultName={attendeeName}
      />
    </div>
  );
}

function EventRow({
  ev,
  onEdit,
  onDelete,
}: {
  ev: CalendarEvent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showUpOpen, setShowUpOpen] = useState(false);
  const [, force] = useState(0);
  const start = ev.start.dateTime ? format(new Date(ev.start.dateTime), "HH:mm") : "dia todo";
  const end = ev.end.dateTime ? format(new Date(ev.end.dateTime), "HH:mm") : "";
  const guest = guestOf(ev);
  const attendeeEmail = guest?.email;
  const attendeeName = guest?.displayName;
  const link = getEventLink(ev.id);
  const noShow = getNoShow(ev.id);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-accent/40">
      <div className="flex w-20 shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {start}
        {end ? `–${end}` : ""}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{ev.summary || "(sem título)"}</p>
        {ev.location && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {ev.location}
          </p>
        )}
        {ev.attendees && ev.attendees.length > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {ev.attendees.length} convidado(s)
          </p>
        )}
        {link && (
          <p className="mt-0.5 text-xs text-emerald-400">
            ✓ Vinculado: {link.nome || link.email}
          </p>
        )}
        {noShow && (
          <p className="mt-0.5 text-xs text-rose-400">✗ Marcado como NoShow</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          onClick={() => setShowUpOpen(true)}
          className="h-8 gap-1.5 bg-amber-500 px-2.5 text-black hover:bg-amber-400"
          title="Vincular lead e disparar ShowUp manualmente"
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">{link ? "Re-disparar" : "ShowUp"}</span>
        </Button>
        <Button
          size="sm"
          variant={noShow ? "destructive" : "outline"}
          onClick={() => {
            if (noShow) { unmarkNoShow(ev.id); toast.success("NoShow removido"); }
            else { markNoShow(ev.id); toast.success("Marcado como NoShow"); }
            force((n) => n + 1);
          }}
          className="h-8 gap-1.5 px-2.5"
          title={noShow ? "Desmarcar NoShow" : "Marcar como NoShow"}
        >
          <UserX className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">{noShow ? "NoShow ✓" : "NoShow"}</span>
        </Button>
        {ev.htmlLink && (
          <a href={ev.htmlLink} target="_blank" rel="noreferrer" className="rounded p-2 hover:bg-muted">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <button className="rounded p-2 hover:bg-muted" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </button>
        <button className="rounded p-2 text-destructive hover:bg-destructive/10" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <ShowUpDialog
        open={showUpOpen}
        onOpenChange={setShowUpOpen}
        eventId={ev.id}
        defaultEmail={attendeeEmail}
        defaultName={attendeeName}
      />
    </div>
  );
}

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function pct(n: number) {
  if (!isFinite(n) || isNaN(n)) return "0%";
  return `${n.toFixed(1)}%`;
}

function MetricsView({
  events,
  range,
  setRange,
}: {
  events: CalendarEvent[];
  range: DateRangeValue;
  setRange: (v: DateRangeValue) => void;
}) {
  const { data: vendasData, isLoading: vendasLoading } = useQuery({
    queryKey: ["calendar-metrics-vendas", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ranking_tv_stats", {
        _from: range.from || undefined,
        _to: range.to || undefined,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const eventStats = useMemo(() => {
    const now = new Date();
    const from = range.from ? new Date(range.from + "T00:00:00") : null;
    const to = range.to ? new Date(range.to + "T23:59:59") : null;
    const links = getAllEventLinks();
    const noshows = getAllNoShows();
    let agendadas = 0;
    let proximas = 0;
    let realizadas = 0;
    let showup = 0;
    let noshow = 0;
    let linkadas = 0;
    for (const ev of events) {
      const d = new Date(ev.start.dateTime || ev.start.date || "");
      if (isNaN(d.getTime())) continue;
      if (from && d < from) continue;
      if (to && d > to) continue;
      agendadas++;
      const linked = !!links[ev.id];
      const isNoShow = !!noshows[ev.id];
      if (linked) linkadas++;
      const past = d < now;
      if (isNoShow) {
        realizadas++;
        noshow++;
      } else if (past) {
        realizadas++;
        if (linked) showup++;
        else noshow++;
      } else {
        proximas++;
      }
    }
    return { agendadas, proximas, realizadas, showup, noshow, linkadas };
  }, [events, range]);

  const totalFat = Number(vendasData?.totalFaturamento || 0);
  const totalVendas = Number(vendasData?.totalVendas || 0);
  const ticketMedio = Number(vendasData?.ticketMedioGeral || 0);

  const taxaShowup = eventStats.realizadas > 0 ? (eventStats.showup / eventStats.realizadas) * 100 : 0;
  const taxaNoshow = eventStats.realizadas > 0 ? (eventStats.noshow / eventStats.realizadas) * 100 : 0;
  const taxaFechamentoShown = eventStats.showup > 0 ? (totalVendas / eventStats.showup) * 100 : 0;
  const taxaFechamentoAgendadas = eventStats.agendadas > 0 ? (totalVendas / eventStats.agendadas) * 100 : 0;
  const taxaConexao = eventStats.agendadas > 0 ? (eventStats.linkadas / eventStats.agendadas) * 100 : 0;
  const valorPorCall = eventStats.agendadas > 0 ? totalFat / eventStats.agendadas : 0;
  const valorPorShowup = eventStats.showup > 0 ? totalFat / eventStats.showup : 0;

  const groups: { title: string; cards: { label: string; value: string; sub?: string; icon: any; color: string; bg: string }[] }[] = [
    {
      title: "Volume de calls",
      cards: [
        { label: "Agendadas no período", value: String(eventStats.agendadas), icon: CalendarIcon, color: "text-blue-400", bg: "bg-blue-500/10" },
        { label: "Próximas calls", value: String(eventStats.proximas), icon: CalendarClock, color: "text-amber-400", bg: "bg-amber-500/10" },
        { label: "Realizadas", value: String(eventStats.realizadas), icon: PhoneCall, color: "text-violet-400", bg: "bg-violet-500/10" },
        { label: "Leads linkados ao Quiz", value: String(eventStats.linkadas), sub: pct(taxaConexao) + " das calls", icon: Target, color: "text-cyan-400", bg: "bg-cyan-500/10" },
      ],
    },
    {
      title: "Comparecimento",
      cards: [
        { label: "Show-up", value: String(eventStats.showup), sub: pct(taxaShowup) + " das realizadas", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
        { label: "No-show", value: String(eventStats.noshow), sub: pct(taxaNoshow) + " das realizadas", icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/10" },
        { label: "Taxa de show-up", value: pct(taxaShowup), icon: Percent, color: "text-emerald-400", bg: "bg-emerald-500/10" },
        { label: "Taxa de no-show", value: pct(taxaNoshow), icon: Percent, color: "text-rose-400", bg: "bg-rose-500/10" },
      ],
    },
    {
      title: "Conversão em venda",
      cards: [
        { label: "Vendas no período", value: String(totalVendas), icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
        { label: "Fechamento sobre show-up", value: pct(taxaFechamentoShown), sub: totalVendas + " / " + eventStats.showup, icon: Target, color: "text-amber-400", bg: "bg-amber-500/10" },
        { label: "Fechamento sobre agendadas", value: pct(taxaFechamentoAgendadas), sub: totalVendas + " / " + eventStats.agendadas, icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
        { label: "Ticket médio", value: fmtBRL(ticketMedio), icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
      ],
    },
    {
      title: "Faturamento & eficiência",
      cards: [
        { label: "Faturamento total", value: fmtBRL(totalFat), icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
        { label: "Valor por call agendada", value: fmtBRL(valorPorCall), icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10" },
        { label: "Valor por show-up", value: fmtBRL(valorPorShowup), icon: DollarSign, color: "text-violet-400", bg: "bg-violet-500/10" },
        { label: "Conversão geral (agendada → venda)", value: pct(taxaFechamentoAgendadas), icon: Percent, color: "text-amber-400", bg: "bg-amber-500/10" },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" /> Painel SDR
          </h2>
          <p className="text-xs text-muted-foreground">
            Métricas completas de calls e conversão {vendasLoading && "· carregando vendas..."}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {groups.map((g) => (
        <div key={g.title} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {g.cards.map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={"h-10 w-10 rounded-lg flex items-center justify-center " + c.bg + " " + c.color}>
                      <c.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className="text-xl font-bold leading-tight">{c.value}</p>
                      {c.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <Card className="bg-muted/20">
        <CardContent className="p-4 text-xs text-muted-foreground">
          💡 <strong>Como lemos:</strong> uma call vira <strong>show-up</strong> quando você dispara o ShowUp no botão ⚡.
          As métricas de venda vêm da base de vendas filtrada pelo mesmo período.
        </CardContent>
      </Card>
    </div>
  );
}


