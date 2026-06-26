import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  listCalendars,
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
  // treat as local time, convert to ISO
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

const emptyForm = (): FormState => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
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

function CalendarPage() {
  const qc = useQueryClient();
  const list = useServerFn(listEvents);
  const create = useServerFn(createEvent);
  const update = useServerFn(updateEvent);
  const del = useServerFn(deleteEvent);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["gcal-events"],
    queryFn: () => list({ data: {} }),
    refetchInterval: 60_000,
  });

  const events = data?.items || [];

  const grouped = useMemo(() => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const dt = ev.start.dateTime || ev.start.date;
      if (!dt) continue;
      const key = format(new Date(dt), "yyyy-MM-dd");
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

  function openCreate() {
    setForm(emptyForm());
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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
            <p className="text-sm text-muted-foreground">
              Google Agenda — eventos sincronizados em tempo real
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
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
            <p className="text-xs text-muted-foreground mt-2">
              Confere se o calendário foi compartilhado com{" "}
              <code>multiumboard@n8n-calendar.iam.gserviceaccount.com</code> com permissão "fazer
              alterações nos eventos", e se o GOOGLE_CALENDAR_ID está correto.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold">{events.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Próximos 7 dias</p>
            <p className="text-2xl font-bold">
              {
                events.filter((e) => {
                  const dt = new Date(e.start.dateTime || e.start.date || "");
                  const now = Date.now();
                  return dt.getTime() >= now && dt.getTime() <= now + 7 * 86400_000;
                }).length
              }
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Hoje</p>
            <p className="text-2xl font-bold">
              {
                events.filter((e) => {
                  const dt = new Date(e.start.dateTime || e.start.date || "");
                  const t = new Date();
                  return (
                    dt.getDate() === t.getDate() &&
                    dt.getMonth() === t.getMonth() &&
                    dt.getFullYear() === t.getFullYear()
                  );
                }).length
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando eventos...</p>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum evento encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, evs]) => (
            <Card key={day}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {format(parseISO(day), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {evs.map((ev) => {
                  const start = ev.start.dateTime
                    ? format(new Date(ev.start.dateTime), "HH:mm")
                    : "dia todo";
                  const end = ev.end.dateTime ? format(new Date(ev.end.dateTime), "HH:mm") : "";
                  return (
                    <div
                      key={ev.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-accent/40 transition-colors"
                    >
                      <div className="text-xs text-muted-foreground w-20 shrink-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {start}
                        {end ? `–${end}` : ""}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{ev.summary || "(sem título)"}</p>
                        {ev.location && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" />
                            {ev.location}
                          </p>
                        )}
                        {ev.attendees && ev.attendees.length > 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Users className="h-3 w-3" />
                            {ev.attendees.length} convidado(s)
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {ev.htmlLink && (
                          <a
                            href={ev.htmlLink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded hover:bg-muted"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          className="p-2 rounded hover:bg-muted"
                          onClick={() => openEdit(ev)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="p-2 rounded hover:bg-destructive/10 text-destructive"
                          onClick={() => {
                            if (confirm("Remover este evento?")) deleteMutation.mutate(ev.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
