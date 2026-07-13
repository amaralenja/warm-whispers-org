import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { ArrowLeft, Calendar, ExternalLink, HeartHandshake, Link2, Pencil, Phone, Plus, Trash2, User, Users, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIAS,
  FASES,
  type Categoria,
  type Fase,
  type HTCustomerSuccess,
  deleteCustomerSuccess,
  listCustomerSuccess,
  updateCustomerSuccessFase,
  upsertCustomerSuccess,
} from "@/lib/ht-customer-success.functions";

export const Route = createFileRoute("/_authenticated/ht-customer-success")({
  component: HTCustomerSuccessPage,
  head: () => ({ meta: [{ title: "Sucesso do Cliente · High Ticket" }] }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Não encontrado</div>,
});

const FASE_META: Record<Fase, { label: string; accent: string; dot: string }> = {
  espionagem: {
    label: "Fase 1 · Espionagem",
    accent: "border-rose-500/30 bg-rose-500/5",
    dot: "bg-rose-400",
  },
  modelagem: {
    label: "Fase 2 · Modelagem",
    accent: "border-amber-500/30 bg-amber-500/5",
    dot: "bg-amber-400",
  },
  construcao: {
    label: "Fase 3 · Construção",
    accent: "border-sky-500/30 bg-sky-500/5",
    dot: "bg-sky-400",
  },
  concluido: {
    label: "Concluído",
    accent: "border-emerald-500/30 bg-emerald-500/5",
    dot: "bg-emerald-400",
  },
};
const CATEGORIA_META: Record<Categoria, { label: string; short: string; description: string; accent: string; icon: typeof User }> = {
  x1: {
    label: "Alunos X1",
    short: "X1",
    description: "Alunos da mentoria X1",
    accent: "from-sky-500/20 to-sky-500/5 border-sky-500/30 text-sky-300",
    icon: User,
  },
  grupo: {
    label: "Alunos Mentoria em Grupo",
    short: "Grupo",
    description: "Alunos das turmas em grupo",
    accent: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-300",
    icon: UsersRound,
  },
  individual: {
    label: "Alunos Mentoria Individual",
    short: "Individual",
    description: "Alunos da mentoria individual",
    accent: "from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/30 text-fuchsia-300",
    icon: Users,
  },
};

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function whatsappHref(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

function HTCustomerSuccessPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCustomerSuccess);
  const updateFaseFn = useServerFn(updateCustomerSuccessFase);
  const deleteFn = useServerFn(deleteCustomerSuccess);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ht-customer-success"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<HTCustomerSuccess | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const byFase = useMemo(() => {
    const map: Record<Fase, HTCustomerSuccess[]> = {
      espionagem: [], modelagem: [], construcao: [], concluido: [],
    };
    for (const r of rows) {
      const f = (FASES as readonly string[]).includes(r.fase) ? (r.fase as Fase) : "espionagem";
      map[f].push(r);
    }
    return map;
  }, [rows]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const moveMut = useMutation({
    mutationFn: (vars: { id: string; fase: Fase }) => updateFaseFn({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["ht-customer-success"] });
      const prev = qc.getQueryData<HTCustomerSuccess[]>(["ht-customer-success"]);
      qc.setQueryData<HTCustomerSuccess[]>(["ht-customer-success"], (old) =>
        (old ?? []).map((r) => (r.id === vars.id ? { ...r, fase: vars.fase } : r)),
      );
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["ht-customer-success"], ctx.prev);
      toast.error(e?.message ?? "Falha ao mover");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["ht-customer-success"] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Aluno removido");
      qc.invalidateQueries({ queryKey: ["ht-customer-success"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  function handleDragStart(e: DragStartEvent) {
    setDragId(String(e.active.id));
  }
  function handleDragEnd(e: DragEndEvent) {
    setDragId(null);
    const id = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const target = overId.startsWith("col:") ? (overId.slice(4) as Fase) : null;
    if (!target || !(FASES as readonly string[]).includes(target)) return;
    const current = rows.find((r) => r.id === id);
    if (!current || current.fase === target) return;
    moveMut.mutate({ id, fase: target });
  }

  const dragged = dragId ? rows.find((r) => r.id === dragId) ?? null : null;

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-400">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold md:text-2xl">Sucesso do Cliente</h1>
            <p className="text-xs text-muted-foreground md:text-sm">
              Acompanhe cada aluno da mentoria por fase — arraste os cards pra mover.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo aluno
        </Button>
      </div>

      {isLoading ? (
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-4">
          {FASES.map((f) => (
            <div key={f} className="animate-pulse rounded-2xl border border-border bg-card/40" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid flex-1 grid-cols-1 gap-3 overflow-x-auto pb-2 md:grid-cols-2 xl:grid-cols-4">
            {FASES.map((f) => (
              <Column
                key={f}
                fase={f}
                items={byFase[f]}
                onEdit={setEditing}
                onDelete={(id) => {
                  if (confirm("Remover este aluno?")) delMut.mutate(id);
                }}
              />
            ))}
          </div>
          <DragOverlay>
            {dragged ? <Card row={dragged} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <EditDialog
        open={creating || !!editing}
        row={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function Column({
  fase,
  items,
  onEdit,
  onDelete,
}: {
  fase: Fase;
  items: HTCustomerSuccess[];
  onEdit: (r: HTCustomerSuccess) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${fase}` });
  const meta = FASE_META[fase];
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[60vh] flex-col rounded-2xl border ${meta.accent} ${isOver ? "ring-2 ring-emerald-500/50" : ""} transition`}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          <span className="text-xs font-semibold uppercase tracking-wider">{meta.label}</span>
        </div>
        <span className="rounded-full bg-background/60 px-2 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="grid h-24 place-items-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
            Solte um aluno aqui
          </div>
        ) : (
          items.map((r) => (
            <DraggableCard key={r.id} row={r} onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  row,
  onEdit,
  onDelete,
}: {
  row: HTCustomerSuccess;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
    >
      <Card row={row} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function Card({
  row,
  onEdit,
  onDelete,
  dragging,
}: {
  row: HTCustomerSuccess;
  onEdit?: () => void;
  onDelete?: () => void;
  dragging?: boolean;
}) {
  const waHref = whatsappHref(row.whatsapp_privado);
  return (
    <div
      className={`group rounded-xl border border-border bg-card p-3 shadow-sm transition ${dragging ? "rotate-1 shadow-xl" : "hover:border-emerald-500/40"}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{row.aluno_nome}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[0.65rem] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Entrada: {fmtDate(row.entrada_mentoria)}
          </div>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            {onEdit && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="rounded p-1 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1.5 text-[0.7rem]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Phone className="h-3 w-3 shrink-0" />
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-foreground hover:text-emerald-400"
            >
              {row.whatsapp_privado}
            </a>
          ) : (
            <span className="truncate">Sem WhatsApp</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-3 w-3 shrink-0" />
          {row.grupo_whatsapp_link ? (
            <a
              href={row.grupo_whatsapp_link}
              target="_blank"
              rel="noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex min-w-0 items-center gap-1 truncate text-foreground hover:text-emerald-400"
            >
              <span className="truncate">Abrir grupo</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="truncate">Sem grupo</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-background/60 px-2 py-1 text-muted-foreground">
          <Calendar className="h-3 w-3 shrink-0" />
          Última call: <span className="ml-auto font-medium text-foreground">{fmtDateTime(row.ultima_call)}</span>
        </div>
      </div>
    </div>
  );
}

function toDateInput(v: string | null) {
  if (!v) return "";
  return v.slice(0, 10);
}
function toDateTimeInput(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditDialog({
  open,
  row,
  onClose,
}: {
  open: boolean;
  row: HTCustomerSuccess | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertCustomerSuccess);

  const [form, setForm] = useState({
    aluno_nome: "",
    entrada_mentoria: "",
    fase: "espionagem" as Fase,
    ultima_call: "",
    whatsapp_privado: "",
    grupo_whatsapp_link: "",
    observacoes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      aluno_nome: row?.aluno_nome ?? "",
      entrada_mentoria: toDateInput(row?.entrada_mentoria ?? null),
      fase: (row?.fase as Fase) ?? "espionagem",
      ultima_call: toDateTimeInput(row?.ultima_call ?? null),
      whatsapp_privado: row?.whatsapp_privado ?? "",
      grupo_whatsapp_link: row?.grupo_whatsapp_link ?? "",
      observacoes: row?.observacoes ?? "",
    });
  }, [open, row]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: row?.id ?? null,
          aluno_nome: form.aluno_nome,
          entrada_mentoria: form.entrada_mentoria || null,
          fase: form.fase,
          ultima_call: form.ultima_call ? new Date(form.ultima_call).toISOString() : null,
          whatsapp_privado: form.whatsapp_privado || null,
          grupo_whatsapp_link: form.grupo_whatsapp_link || null,
          observacoes: form.observacoes || null,
        },
      }),
    onSuccess: () => {
      toast.success(row ? "Aluno atualizado" : "Aluno adicionado");
      qc.invalidateQueries({ queryKey: ["ht-customer-success"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "Editar aluno" : "Novo aluno"}</DialogTitle>
          <DialogDescription>Dados do aluno em Sucesso do Cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome do aluno *</Label>
            <Input
              value={form.aluno_nome}
              maxLength={160}
              onChange={(e) => setForm({ ...form, aluno_nome: e.target.value })}
              placeholder="Ex: Lucas do Império"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Entrada na mentoria</Label>
              <Input
                type="date"
                value={form.entrada_mentoria}
                onChange={(e) => setForm({ ...form, entrada_mentoria: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Fase</Label>
              <Select value={form.fase} onValueChange={(v) => setForm({ ...form, fase: v as Fase })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FASES.map((f) => (
                    <SelectItem key={f} value={f}>{FASE_META[f].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Última call</Label>
            <Input
              type="datetime-local"
              value={form.ultima_call}
              onChange={(e) => setForm({ ...form, ultima_call: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">WhatsApp privado</Label>
            <Input
              value={form.whatsapp_privado}
              maxLength={40}
              onChange={(e) => setForm({ ...form, whatsapp_privado: e.target.value })}
              placeholder="(11) 90000-0000"
            />
          </div>
          <div>
            <Label className="text-xs">Link do grupo WhatsApp</Label>
            <Input
              value={form.grupo_whatsapp_link}
              maxLength={500}
              onChange={(e) => setForm({ ...form, grupo_whatsapp_link: e.target.value })}
              placeholder="https://chat.whatsapp.com/..."
            />
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={form.observacoes}
              maxLength={1000}
              rows={3}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Notas internas (opcional)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.aluno_nome.trim()}>
            {saveMut.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
