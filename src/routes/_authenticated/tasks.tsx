import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  MoreHorizontal,
  Calendar as CalIcon,
  Users as UsersIcon,
  Trash2,
  Edit2,
  Flag,
  Check,
  X,
  Settings2,
  CheckSquare,
  Loader2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

type Board = { id: string; nome: string; cor: string };
type Column = { id: string; board_id: string; nome: string; cor: string; ordem: number };
type ChecklistItem = { id: string; texto: string; done: boolean };
type ChecklistGroup = { id: string; titulo: string; items: ChecklistItem[] };
type Task = {
  id: string;
  board_id: string;
  column_id: string;
  titulo: string;
  descricao: string | null;
  prioridade: "baixa" | "media" | "alta" | "urgente";
  prazo: string | null;
  assignee_ids: string[];
  labels: { texto: string; cor: string }[];
  checklist: ChecklistGroup[];
  ordem: number;
  concluida: boolean;
};
type Member = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  funcao: string | null;
  foto_url: string | null;
  cor: string;
  ativo: boolean;
};


const PRIO_COLORS: Record<string, string> = {
  baixa: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  media: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  alta: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  urgente: "bg-red-500/20 text-red-300 border-red-500/40",
};

const LABEL_COLORS = [
  { name: "Vermelho", value: "#ef4444" },
  { name: "Laranja", value: "#f97316" },
  { name: "Âmbar", value: "#f59e0b" },
  { name: "Verde", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Roxo", value: "#a855f7" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Cinza", value: "#64748b" },
];

function normalizeChecklist(raw: unknown): ChecklistGroup[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length === 0) return [];
  // Legacy: array of {id, texto, done}
  if ("texto" in (raw[0] as any) && !("items" in (raw[0] as any))) {
    return [
      {
        id: crypto.randomUUID(),
        titulo: "Checklist",
        items: raw as ChecklistItem[],
      },
    ];
  }
  return raw as ChecklistGroup[];
}

function normalizeLabels(raw: unknown): { texto: string; cor: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l: any) =>
    typeof l === "string" ? { texto: l, cor: "#64748b" } : { texto: l.texto, cor: l.cor ?? "#64748b" },
  );
}


function initials(n: string) {
  return n
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function TasksPage() {
  const qc = useQueryClient();
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingInColumn, setCreatingInColumn] = useState<string | null>(null);

  const boardsQ = useQuery({
    queryKey: ["task_boards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_boards" as any)
        .select("*")
        .order("ordem")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Board[];
    },
  });

  useEffect(() => {
    if (!activeBoardId && boardsQ.data && boardsQ.data.length > 0) {
      setActiveBoardId(boardsQ.data[0].id);
    }
  }, [boardsQ.data, activeBoardId]);

  const columnsQ = useQuery({
    queryKey: ["task_columns", activeBoardId],
    enabled: !!activeBoardId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_columns" as any)
        .select("*")
        .eq("board_id", activeBoardId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Column[];
    },
  });

  const tasksQ = useQuery({
    queryKey: ["tasks", activeBoardId],
    enabled: !!activeBoardId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks" as any)
        .select("*")
        .eq("board_id", activeBoardId!)
        .order("ordem");
      if (error) throw error;
      return ((data ?? []) as any[]).map((t) => ({
        ...t,
        labels: normalizeLabels(t.labels),
        checklist: normalizeChecklist(t.checklist),
      })) as Task[];
    },
  });

  const membersQ = useQuery({
    queryKey: ["team_members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members" as any)
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Member[];
    },
  });

  const columns = columnsQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const members = membersQ.data ?? [];
  const memberById = useMemo(() => {
    const m = new Map<string, Member>();
    for (const x of members) m.set(x.id, x);
    return m;
  }, [members]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);

  function tasksOfColumn(colId: string) {
    return tasks.filter((t) => t.column_id === colId).sort((a, b) => a.ordem - b.ordem);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDragTask(null);
    const { active, over } = e;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;

    // over.id may be a column id or a task id
    const overColumn = columns.find((c) => c.id === over.id);
    const overTask = tasks.find((t) => t.id === over.id);
    const targetColumnId = overColumn?.id ?? overTask?.column_id ?? task.column_id;

    const targetList = tasksOfColumn(targetColumnId).filter((t) => t.id !== task.id);
    let newIndex = targetList.length;
    if (overTask && overTask.id !== task.id) {
      newIndex = targetList.findIndex((t) => t.id === overTask.id);
      if (newIndex < 0) newIndex = targetList.length;
    }
    targetList.splice(newIndex, 0, { ...task, column_id: targetColumnId });

    // optimistic update
    qc.setQueryData<Task[]>(["tasks", activeBoardId], (old) => {
      if (!old) return old;
      const others = old.filter((t) => t.column_id !== targetColumnId && t.id !== task.id);
      const reordered = targetList.map((t, i) => ({ ...t, ordem: i, column_id: targetColumnId }));
      return [...others, ...reordered];
    });

    // persist
    const updates = targetList.map((t, i) => ({ id: t.id, ordem: i, column_id: targetColumnId }));
    for (const u of updates) {
      await supabase.from("tasks" as any).update({ ordem: u.ordem, column_id: u.column_id }).eq("id", u.id);
    }
  }

  async function createBoard() {
    const nome = prompt("Nome do novo quadro:");
    if (!nome) return;
    const { data, error } = await supabase
      .from("task_boards" as any)
      .insert({ nome })
      .select()
      .single();
    if (error) return toast.error(error.message);
    const board = data as any;
    // colunas padrão
    await supabase.from("task_columns" as any).insert([
      { board_id: board.id, nome: "A Fazer", cor: "#64748b", ordem: 0 },
      { board_id: board.id, nome: "Em Andamento", cor: "#3b82f6", ordem: 1 },
      { board_id: board.id, nome: "Concluído", cor: "#10b981", ordem: 2 },
    ]);
    await qc.invalidateQueries({ queryKey: ["task_boards"] });
    setActiveBoardId(board.id);
  }

  async function addColumn() {
    if (!activeBoardId) return;
    const nome = prompt("Nome da coluna:");
    if (!nome) return;
    const maxOrdem = columns.reduce((m, c) => Math.max(m, c.ordem), -1);
    await supabase.from("task_columns" as any).insert({
      board_id: activeBoardId,
      nome,
      ordem: maxOrdem + 1,
      cor: "#64748b",
    });
    qc.invalidateQueries({ queryKey: ["task_columns", activeBoardId] });
  }

  async function deleteColumn(id: string) {
    if (!confirm("Apagar coluna e todas as tarefas dela?")) return;
    await supabase.from("task_columns" as any).delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["task_columns", activeBoardId] });
    qc.invalidateQueries({ queryKey: ["tasks", activeBoardId] });
  }

  async function renameColumn(c: Column) {
    const nome = prompt("Novo nome:", c.nome);
    if (!nome || nome === c.nome) return;
    await supabase.from("task_columns" as any).update({ nome }).eq("id", c.id);
    qc.invalidateQueries({ queryKey: ["task_columns", activeBoardId] });
  }

  const activeBoard = boardsQ.data?.find((b) => b.id === activeBoardId);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/40 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <CheckSquare className="h-6 w-6 text-accent" />
          <h1 className="text-xl font-semibold">Tarefas</h1>
          <Select value={activeBoardId ?? ""} onValueChange={setActiveBoardId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Selecione um quadro" />
            </SelectTrigger>
            <SelectContent>
              {(boardsQ.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={createBoard}>
            <Plus className="mr-1 h-4 w-4" /> Quadro
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowMembers(true)}>
            <UsersIcon className="mr-1 h-4 w-4" /> Equipe ({members.length})
          </Button>
          <Button variant="outline" size="sm" onClick={addColumn} disabled={!activeBoardId}>
            <Plus className="mr-1 h-4 w-4" /> Coluna
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-gradient-to-br from-background to-background/70">
        {!activeBoard ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {boardsQ.isLoading ? "Carregando..." : "Nenhum quadro. Crie o primeiro!"}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e: DragStartEvent) => {
              const t = tasks.find((x) => x.id === e.active.id);
              if (t) setActiveDragTask(t);
            }}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragTask(null)}
          >
            <div className="flex h-full gap-4 p-6">
              {columns.map((col) => (
                <ColumnView
                  key={col.id}
                  column={col}
                  tasks={tasksOfColumn(col.id)}
                  memberById={memberById}
                  onAdd={() => setCreatingInColumn(col.id)}
                  onEditTask={(t) => setEditingTask(t)}
                  onRename={() => renameColumn(col)}
                  onDelete={() => deleteColumn(col.id)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDragTask ? (
                <TaskCard task={activeDragTask} memberById={memberById} onClick={() => {}} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Task editor */}
      {editingTask && (
        <TaskDialog
          task={editingTask}
          members={members}
          columns={columns}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setEditingTask(null);
            qc.invalidateQueries({ queryKey: ["tasks", activeBoardId] });
          }}
        />
      )}
      {creatingInColumn && activeBoardId && (
        <TaskDialog
          task={{
            id: "",
            board_id: activeBoardId,
            column_id: creatingInColumn,
            titulo: "",
            descricao: "",
            prioridade: "media",
            prazo: null,
            assignee_ids: [],
            labels: [],
            checklist: [],
            ordem: 9999,
            concluida: false,
          }}
          members={members}
          columns={columns}
          isNew
          onClose={() => setCreatingInColumn(null)}
          onSaved={() => {
            setCreatingInColumn(null);
            qc.invalidateQueries({ queryKey: ["tasks", activeBoardId] });
          }}
        />
      )}

      {showMembers && (
        <MembersDialog
          members={members}
          onClose={() => setShowMembers(false)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["team_members"] })}
        />
      )}
    </div>
  );
}

function ColumnView({
  column,
  tasks,
  memberById,
  onAdd,
  onEditTask,
  onRename,
  onDelete,
}: {
  column: Column;
  tasks: Task[];
  memberById: Map<string, Member>;
  onAdd: () => void;
  onEditTask: (t: Task) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef } = useSortable({ id: column.id });
  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col rounded-xl border border-border bg-card/60 backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: column.cor }} />
          <span className="text-sm font-semibold">{column.nome}</span>
          <Badge variant="secondary" className="h-5 text-xs">
            {tasks.length}
          </Badge>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-40 p-1">
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onRename}>
              <Edit2 className="mr-2 h-4 w-4" /> Renomear
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 space-y-2 overflow-y-auto p-2 scrollbar-fancy"
        data-column-id={column.id}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableTask key={t.id} task={t} memberById={memberById} onClick={() => onEditTask(t)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            Sem tarefas
          </div>
        )}
      </div>

      <button
        onClick={onAdd}
        className="flex items-center justify-center gap-1 border-t border-border py-2 text-sm text-muted-foreground transition hover:bg-accent/10 hover:text-accent"
      >
        <Plus className="h-4 w-4" /> Adicionar tarefa
      </button>
    </div>
  );
}

function SortableTask({
  task,
  memberById,
  onClick,
}: {
  task: Task;
  memberById: Map<string, Member>;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} memberById={memberById} onClick={onClick} />
    </div>
  );
}

function TaskCard({
  task,
  memberById,
  onClick,
}: {
  task: Task;
  memberById: Map<string, Member>;
  onClick: () => void;
}) {
  const assignees = task.assignee_ids.map((id) => memberById.get(id)).filter(Boolean) as Member[];
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const checklistTotal = task.checklist.length;
  const prazoDate = task.prazo ? new Date(task.prazo) : null;
  const isLate = prazoDate && prazoDate < new Date() && !task.concluida;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="cursor-pointer rounded-lg border border-border bg-background/80 p-3 shadow-sm transition hover:border-accent/60 hover:shadow-md"
    >
      {task.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <span key={l} className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent/20 text-accent">
              {l}
            </span>
          ))}
        </div>
      )}
      <div className="mb-2 text-sm font-medium leading-snug">{task.titulo}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${PRIO_COLORS[task.prioridade]}`}
          >
            <Flag className="mr-1 inline h-3 w-3" />
            {task.prioridade}
          </span>
          {checklistTotal > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckSquare className="h-3 w-3" /> {checklistDone}/{checklistTotal}
            </span>
          )}
          {prazoDate && (
            <span
              className={`flex items-center gap-1 text-[11px] ${
                isLate ? "text-red-400" : "text-muted-foreground"
              }`}
            >
              <CalIcon className="h-3 w-3" />
              {prazoDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </span>
          )}
        </div>
        <div className="flex -space-x-2">
          {assignees.slice(0, 3).map((m) => (
            <Avatar key={m.id} className="h-6 w-6 border-2 border-card">
              {m.foto_url ? <AvatarImage src={m.foto_url} /> : null}
              <AvatarFallback style={{ background: m.cor, color: "#fff" }} className="text-[10px]">
                {initials(m.nome)}
              </AvatarFallback>
            </Avatar>
          ))}
          {assignees.length > 3 && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px]">
              +{assignees.length - 3}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskDialog({
  task,
  members,
  columns,
  isNew,
  onClose,
  onSaved,
}: {
  task: Task;
  members: Member[];
  columns: Column[];
  isNew?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState(task.titulo);
  const [descricao, setDescricao] = useState(task.descricao ?? "");
  const [prioridade, setPrioridade] = useState(task.prioridade);
  const [prazo, setPrazo] = useState(task.prazo ? task.prazo.slice(0, 10) : "");
  const [assignees, setAssignees] = useState<string[]>(task.assignee_ids);
  const [labels, setLabels] = useState<string[]>(task.labels);
  const [labelInput, setLabelInput] = useState("");
  const [columnId, setColumnId] = useState(task.column_id);
  const [checklist, setChecklist] = useState(task.checklist);
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!titulo.trim()) return toast.error("Título obrigatório");
    setSaving(true);
    const payload = {
      titulo: titulo.trim(),
      descricao,
      prioridade,
      prazo: prazo ? new Date(prazo + "T12:00:00").toISOString() : null,
      assignee_ids: assignees,
      labels,
      checklist,
      column_id: columnId,
    };
    if (isNew) {
      const { data: inserted, error } = await supabase
        .from("tasks" as any)
        .insert({ ...payload, board_id: task.board_id, ordem: task.ordem })
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
      // Dispara notificação WhatsApp pros assignees (fire & forget)
      if (inserted && assignees.length > 0) {
        import("@/lib/task-notifications.functions")
          .then(({ notifyTaskCreated }) => notifyTaskCreated({ data: { taskId: (inserted as any).id } }))
          .catch(() => {});
      }

    } else {
      const { error } = await supabase.from("tasks" as any).update(payload).eq("id", task.id);
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
    }
    setSaving(false);
    toast.success("Salvo");
    onSaved();
  }

  async function remove() {
    if (!confirm("Apagar tarefa?")) return;
    await supabase.from("tasks" as any).delete().eq("id", task.id);
    toast.success("Removido");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto scrollbar-fancy">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nova Tarefa" : "Editar Tarefa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Coluna</Label>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prazo</Label>
              <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Responsáveis</Label>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const sel = assignees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setAssignees(sel ? assignees.filter((x) => x !== m.id) : [...assignees, m.id])
                    }
                    className={`flex items-center gap-2 rounded-full border px-2 py-1 text-xs transition ${
                      sel ? "border-accent bg-accent/20" : "border-border hover:border-accent/50"
                    }`}
                  >
                    <Avatar className="h-5 w-5">
                      {m.foto_url ? <AvatarImage src={m.foto_url} /> : null}
                      <AvatarFallback style={{ background: m.cor, color: "#fff" }} className="text-[9px]">
                        {initials(m.nome)}
                      </AvatarFallback>
                    </Avatar>
                    {m.nome}
                  </button>
                );
              })}
              {members.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Cadastre membros da equipe primeiro.
                </span>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Labels</Label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <Badge key={l} variant="secondary" className="gap-1">
                  {l}
                  <button onClick={() => setLabels(labels.filter((x) => x !== l))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Adicionar label..."
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && labelInput.trim()) {
                    setLabels([...labels, labelInput.trim()]);
                    setLabelInput("");
                  }
                }}
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Checklist</Label>
            <div className="space-y-1.5">
              {checklist.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1">
                  <input
                    type="checkbox"
                    checked={c.done}
                    onChange={(e) =>
                      setChecklist(
                        checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)),
                      )
                    }
                  />
                  <span className={`flex-1 text-sm ${c.done ? "line-through text-muted-foreground" : ""}`}>
                    {c.texto}
                  </span>
                  <button onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Novo item..."
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newItem.trim()) {
                    setChecklist([
                      ...checklist,
                      { id: crypto.randomUUID(), texto: newItem.trim(), done: false },
                    ]);
                    setNewItem("");
                  }
                }}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <div>
            {!isNew && (
              <Button variant="destructive" onClick={remove}>
                <Trash2 className="mr-1 h-4 w-4" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              <Check className="mr-1 h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({
  members,
  onClose,
  onChanged,
}: {
  members: Member[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Partial<Member> | null>(null);

  const [uploading, setUploading] = useState(false);

  async function handlePhoto(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = () => { img.src = reader.result as string; };
        reader.onerror = reject;
        img.onload = () => {
          const size = 256;
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d")!;
          const scale = Math.max(size / img.width, size / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = reject;
        reader.readAsDataURL(file);
      });
      setEditing((p) => ({ ...(p ?? {}), foto_url: dataUrl }));
    } catch (e: any) {
      toast.error("Erro ao carregar foto");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!editing?.nome?.trim()) return toast.error("Nome obrigatório");
    const payload: any = {
      nome: editing.nome.trim(),
      telefone: editing.telefone?.trim() || null,
      email: editing.email || null,
      funcao: editing.funcao || null,
      foto_url: editing.foto_url || null,
      cor: editing.cor || "#1f2937",
      ativo: editing.ativo ?? true,
    };
    if (editing.id) {
      await supabase.from("team_members" as any).update(payload).eq("id", editing.id);
    } else {
      await supabase.from("team_members" as any).insert(payload);
    }
    setEditing(null);
    onChanged();
    toast.success("Salvo");
  }


  async function remove(id: string) {
    if (!confirm("Remover membro?")) return;
    await supabase.from("team_members" as any).delete().eq("id", id);
    onChanged();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Equipe / Funcionários</DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="space-y-4">
            {/* Avatar + upload */}
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 rounded-full overflow-hidden border-2 border-border bg-neutral-900 flex items-center justify-center">
                {editing.foto_url ? (
                  <img src={editing.foto_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <svg viewBox="0 0 24 24" className="h-12 w-12 text-neutral-600" fill="currentColor">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                  </svg>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editing.foto_url ? "Trocar foto" : "Enviar foto (opcional)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
                {editing.foto_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing({ ...editing, foto_url: null })}>
                    Remover foto
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label>Nome</Label>
              <Input value={editing.nome ?? ""} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Função</Label>
                <Input
                  value={editing.funcao ?? ""}
                  onChange={(e) => setEditing({ ...editing, funcao: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone (WhatsApp)</Label>
                <Input
                  value={editing.telefone ?? ""}
                  placeholder="(11) 99999-9999"
                  onChange={(e) => setEditing({ ...editing, telefone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Cor (fallback)</Label>
              <Input
                type="color"
                value={editing.cor ?? "#1f2937"}
                onChange={(e) => setEditing({ ...editing, cor: e.target.value })}
                className="h-10 w-20"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={uploading}>Salvar</Button>
            </DialogFooter>
          </div>

        ) : (
          <>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto scrollbar-fancy">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/40 p-3"
                >
                  <div className="h-10 w-10 rounded-full overflow-hidden border border-border bg-neutral-900 flex items-center justify-center shrink-0">
                    {m.foto_url ? (
                      <img src={m.foto_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-6 w-6 text-neutral-600" fill="currentColor">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{m.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.funcao || "—"} {m.telefone ? `• ${m.telefone}` : m.email ? `• ${m.email}` : ""}
                    </div>
                  </div>

                  <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {members.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum membro ainda. Cadastre o primeiro!
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setEditing({ cor: "#6366f1", ativo: true })}>
                <Plus className="mr-1 h-4 w-4" /> Novo Membro
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
