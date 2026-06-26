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
} from "lucide-react";

import { ShowUpDialog, getEventLink, getAllEventLinks } from "@/components/showup-dialog";

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
  attendees: string;
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
    attendees: "",
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

function colorKeyFor(ev: CalendarEvent): string {
  const att = ev.attendees?.find((a) => a.email && !a.email.includes("calendar.google"));
  return (att?.displayName || att?.email || ev.summary || ev.id || "x").toLowerCase().trim();
}
function colorFor(ev: CalendarEvent) {
  const key = colorKeyFor(ev);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return EVENT_PALETTE[h % EVENT_PALETTE.length];
}
function personLabel(ev: CalendarEvent): string {
  const att = ev.attendees?.find((a) => a.email && !a.email.includes("calendar.google"));
  return att?.displayName || att?.email?.split("@")[0] || "";
}

function CalendarPage() {
  const qc = useQueryClient();
  const list = useServerFn(listEvents);
  const create = useServerFn(createEvent);
  const update = useServerFn(updateEvent);
  const del = useServerFn(deleteEvent);

  const [view, setView] = useState<"month" | "list">("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
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

  const saveMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        summary: f.summary,
        description: f.description || undefined,
        location: f.location || undefined,
        start: fromLocalInput(f.start),
        end: fromLocalInput(f.end),
        attendees: f.attendees
          .split(/[,;\s]+/)
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
      attendees: (ev.attendees || []).map((a) => a.email).join(", "),
    });
    setDialogOpen(true);
  }

  const weekdayLabels = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const selectedDayEvents = selectedDay
    ? eventsByDay.get(format(selectedDay, "yyyy-MM-dd")) || []
    : [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
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
                    <Input
                      type="datetime-local"
                      value={form.start}
                      onChange={(e) => setForm({ ...form, start: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Fim</Label>
                    <Input
                      type="datetime-local"
                      value={form.end}
                      onChange={(e) => setForm({ ...form, end: e.target.value })}
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
                  <Label>Convidados (e-mails separados por vírgula)</Label>
                  <Input
                    value={form.attendees}
                    onChange={(e) => setForm({ ...form, attendees: e.target.value })}
                    placeholder="cliente@empresa.com, outro@empresa.com"
                  />
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
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => saveMutation.mutate(form)}
                  disabled={!form.summary || !form.start || !form.end || saveMutation.isPending}
                >
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
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

      <StatsCards events={events} />



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


          {/* Selected day panel */}
          {selectedDay && (
            <div className="border-t border-border bg-card/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold capitalize">
                  {format(selectedDay, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </h3>
                <Button size="sm" variant="outline" onClick={() => openCreate(selectedDay)}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
              </div>
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento neste dia.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map((ev) => (
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
          )}
        </Card>
      ) : (
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
      )}
    </div>
  );
}

function StatsCards({ events }: { events: CalendarEvent[] }) {
  const stats = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const links = getAllEventLinks();
    let agendadas = 0;
    let showup = 0;
    let noshow = 0;
    let proximas = 0;
    for (const ev of events) {
      const d = new Date(ev.start.dateTime || ev.start.date || "");
      if (isNaN(d.getTime())) continue;
      if (d >= startMonth && d <= endMonth) agendadas++;
      const past = d < now;
      const linked = !!links[ev.id];
      if (past && linked) showup++;
      else if (past && !linked) noshow++;
      else if (!past) proximas++;
    }
    return { agendadas, showup, noshow, proximas };
  }, [events]);

  const cards = [
    { label: "Agendadas no mês", value: stats.agendadas, icon: CalendarIcon, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Próximas calls", value: stats.proximas, icon: CalendarClock, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Show-up confirmado", value: stats.showup, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "No-show", value: stats.noshow, icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/10" },
  ];

  return (
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
  );
}


function MonthEventChip({ ev, onEdit }: { ev: CalendarEvent; onEdit: () => void }) {
  const [showUpOpen, setShowUpOpen] = useState(false);
  const c = colorFor(ev);
  const time = ev.start.dateTime ? format(new Date(ev.start.dateTime), "HH:mm") : "";
  const person = personLabel(ev);
  const title = ev.summary || "(sem título)";
  const link = getEventLink(ev.id);
  const attendeeEmail = ev.attendees?.find((a) => a.email && !a.email.includes("calendar.google"))?.email;
  const attendeeName = ev.attendees?.find((a) => a.displayName)?.displayName;

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
      </div>
      {person && time && (
        <p className={`truncate text-[10px] opacity-80 ${c.text}`}>{title}</p>
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
  const start = ev.start.dateTime ? format(new Date(ev.start.dateTime), "HH:mm") : "dia todo";
  const end = ev.end.dateTime ? format(new Date(ev.end.dateTime), "HH:mm") : "";
  const attendeeEmail = ev.attendees?.find((a) => a.email && !a.email.includes("calendar.google"))?.email;
  const attendeeName = ev.attendees?.find((a) => a.displayName)?.displayName;
  const link = getEventLink(ev.id);

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

