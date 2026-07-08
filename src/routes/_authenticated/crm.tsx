import { useEffect, useMemo, useState, type DragEvent } from "react";
import { getVendorSession } from "@/lib/vendor-session";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Download, LayoutGrid, List, Trash2, Pencil, Phone, Mail,
  User, MoreVertical, Tag as TagIcon, Columns3, MessageCircle,
} from "lucide-react";
import {
  TagsManagerDialog, StagesManagerDialog, useCrmStages, useCrmTags, DEFAULT_STAGES, useHiddenDefaultStages,
} from "@/components/tags-manager-dialog";


import { useServerFn } from "@tanstack/react-start";
import { fireNewLeadTrigger } from "@/lib/flow-engine.functions";
import {
  deleteCrmLead,
  listCrmLeads,
  updateCrmLeadStage,
  upsertCrmLead,
} from "@/lib/crm.functions";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { DragScroll } from "@/components/drag-scroll";
import { ChatEmbed } from "@/components/chat-page";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CRMPage,
});

type StageView = { id: string; label: string; cor: string };

function stageView(id: string, nome: string, cor: string): StageView {
  return { id, label: nome, cor: cor || "#64748b" };
}

function hexToRgba(hex: string, alpha = 0.15) {
  const h = (hex || "#64748b").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Deterministic color from a string (name → hue)
const AVATAR_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
];
function colorFromName(name: string): string {
  const s = (name || "?").trim();
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
function initialsOf(name: string): string {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


type Lead = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  expert: string | null;
  fonte: string | null;
  status: string;
  responsavel_utm: string | null;
  responsavel_nome: string | null;
  valor_estimado: number | null;
  tags: string[] | null;
  notas: string | null;
  ultima_interacao: string | null;
  dados: Record<string, unknown> | null;
  ordem: number | null;
  created_at: string;
  updated_at: string;
};


const BRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);


// ---------- Page ----------
function CRMPage() {
  const qc = useQueryClient();
  const fireNewLead = useServerFn(fireNewLeadTrigger);
  const listLeadsFn = useServerFn(listCrmLeads);
  const upsertLeadFn = useServerFn(upsertCrmLead);
  const deleteLeadFn = useServerFn(deleteCrmLead);
  const updateStageFn = useServerFn(updateCrmLeadStage);
  const { workspace, workspaces } = useWorkspace();
  const isGeral = workspace?.id === "all";

  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [search, setSearch] = useState("");
  const [opFilter, setOpFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);

  const operacoes = useMemo(
    () => workspaces.filter((w) => w.id !== "all").map((w) => w.nome),
    [workspaces],
  );

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["crm-leads"],
    queryFn: async () => (await listLeadsFn()) as Lead[],
  });

  // Dynamic stages: defaults + custom for the active operation
  const stageOperacao = isGeral ? "all" : (workspace?.nome ?? "all");
  const { data: customStages = [] } = useCrmStages(stageOperacao);
  const [hiddenDefaults] = useHiddenDefaultStages(stageOperacao);

  const baseStages: StageView[] = useMemo(() => {
    return [
      ...DEFAULT_STAGES.filter((s) => !hiddenDefaults.includes(s.id)).map((s) => stageView(s.id, s.nome, s.cor)),
      ...customStages.map((s) => stageView(s.id, s.nome, s.cor)),
    ];
  }, [customStages, hiddenDefaults]);

  // Per-user column ordering (persisted in localStorage)
  const orderStorageKey = useMemo(() => {
    const vendor = typeof window !== "undefined" ? getVendorSession() : null;
    const who = vendor?.id ? `v${vendor.id}` : "admin";
    return `crm-col-order:${who}:${stageOperacao}`;
  }, [stageOperacao]);

  const [colOrder, setColOrder] = useState<string[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(orderStorageKey);
      setColOrder(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setColOrder([]);
    }
  }, [orderStorageKey]);

  const stages: StageView[] = useMemo(() => {
    if (colOrder.length === 0) return baseStages;
    const byId = new Map(baseStages.map((s) => [s.id, s]));
    const ordered: StageView[] = [];
    for (const id of colOrder) {
      const s = byId.get(id);
      if (s) { ordered.push(s); byId.delete(id); }
    }
    for (const s of byId.values()) ordered.push(s);
    return ordered;
  }, [baseStages, colOrder]);

  const handleReorderStages = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const current = stages.map((s) => s.id);
    const fromIdx = current.indexOf(fromId);
    const toIdx = current.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = current.slice();
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromId);
    setColOrder(next);
    try {
      window.localStorage.setItem(orderStorageKey, JSON.stringify(next));
    } catch { /* noop */ }
  };

  const { data: crmTags = [] } = useCrmTags(stageOperacao);
  const tagColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of crmTags) m.set(t.nome.toLowerCase(), t.cor);
    return m;
  }, [crmTags]);



  // Filters
  const filtered = useMemo(() => {
    const opActive = isGeral ? opFilter : workspace?.nome;
    const term = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (opActive && opActive !== "all" && (l.expert || "") !== opActive) return false;
      if (!term) return true;
      const blob = [l.nome, l.telefone, l.email, l.responsavel_nome, l.fonte, ...(l.tags ?? [])]
        .filter(Boolean).join(" ").toLowerCase();
      return blob.includes(term);
    });
  }, [leads, isGeral, opFilter, workspace, search]);

  // Mutations
  const upsert = useMutation({
    mutationFn: async (lead: Partial<Lead> & { id?: string }) => {
      const ins = await upsertLeadFn({ data: lead as any });
      if (!lead.id && (ins as any)?.id) fireNewLead({ data: { lead_id: (ins as any).id } }).catch(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      setEditing(null);
      setCreating(false);
      toast.success("Lead salvo");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteLeadFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      toast.success("Lead removido");
    },
  });

  const moveStage = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => updateStageFn({ data: { id, status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-leads"] }),
  });

  function exportCSV() {
    const rows = filtered;
    if (!rows.length) { toast.error("Nada para exportar"); return; }
    const headers = ["nome","telefone","email","expert","fonte","status","responsavel_nome","valor_estimado","tags","notas","ultima_interacao","created_at"];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => {
          const v = (r as any)[h];
          if (v == null) return "";
          if (Array.isArray(v)) return `"${v.join("; ")}"`;
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        }).join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} leads exportados`);
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM Leads X1</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
            {!isGeral && ` em ${workspace?.nome}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStagesOpen(true)}>
            <Columns3 className="mr-1.5 h-4 w-4" /> Colunas
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTagsOpen(true)}>
            <TagIcon className="mr-1.5 h-4 w-4" /> Etiquetas
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-1.5 h-4 w-4" /> Exportar
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo lead
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/40 p-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, email, tag…"
            className="border-0 bg-transparent pl-9 focus-visible:ring-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isGeral && (
          <Select value={opFilter} onValueChange={setOpFilter}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Operação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as operações</SelectItem>
              {operacoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background/60 p-1">
          <Button size="sm" variant={view === "kanban" ? "default" : "ghost"} className="h-7 px-3" onClick={() => setView("kanban")}>
            <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Kanban
          </Button>
          <Button size="sm" variant={view === "lista" ? "default" : "ghost"} className="h-7 px-3" onClick={() => setView("lista")}>
            <List className="mr-1.5 h-3.5 w-3.5" /> Lista
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Carregando leads…</div>
      ) : view === "kanban" ? (
        <Kanban stages={stages} leads={filtered} tagColors={tagColorMap} onMove={(id, status) => moveStage.mutate({ id, status })} onEdit={setEditing} />
      ) : (
        <Lista stages={stages} leads={filtered} tagColors={tagColorMap} onEdit={setEditing} onRemove={(id) => remove.mutate(id)} />

      )}

      <LeadDialog
        open={creating || !!editing}
        lead={editing}
        stages={stages}
        defaultExpert={!isGeral ? workspace?.nome : undefined}
        operacoes={operacoes}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSubmit={(payload) => upsert.mutate(payload)}
        onDelete={editing ? () => remove.mutate(editing.id) : undefined}
        loading={upsert.isPending}
      />

      <TagsManagerDialog open={tagsOpen} onOpenChange={setTagsOpen} operacao={stageOperacao} />
      <StagesManagerDialog open={stagesOpen} onOpenChange={setStagesOpen} operacao={stageOperacao} />
    </div>
  );
}


// ---------- Kanban ----------
function Kanban({
  stages, leads, tagColors, onMove, onEdit,
}: {
  stages: StageView[];
  leads: Lead[];
  tagColors: Map<string, string>;
  onMove: (id: string, status: string) => void;
  onEdit: (l: Lead) => void;
}) {
  
  const [dragOver, setDragOver] = useState<string | null>(null);
  const grouped = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of stages) map.set(s.id, []);
    for (const l of leads) {
      const arr = map.get(l.status) ?? map.get("novo");
      if (arr) arr.push(l);
    }
    return map;
  }, [leads, stages]);


  function onDragStart(e: DragEvent<HTMLDivElement>, lead: Lead) {
    e.dataTransfer.setData("application/x-lead-id", lead.id);
    e.dataTransfer.setData("text/plain", lead.id);
    e.dataTransfer.effectAllowed = "move";
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function onDrop(e: DragEvent<HTMLDivElement>, status: string) {
    e.preventDefault();
    const id =
      e.dataTransfer.getData("application/x-lead-id") ||
      e.dataTransfer.getData("text/plain");
    setDragOver(null);
    if (id && UUID_RE.test(id.trim())) onMove(id.trim(), status);
  }


  const [visible, setVisible] = useState<Record<string, number>>({});
  const PAGE = 15;

  const [chatPhone, setChatPhone] = useState<string | null>(null);
  const openChatForLead = (lead: Lead) => {
    const phoneDigits = (lead.telefone ?? "").replace(/\D+/g, "");
    if (!phoneDigits) {
      onEdit(lead);
      return;
    }
    setChatPhone(phoneDigits);
  };



  return (
    <>
      <DragScroll className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden pb-2 scrollbar-hide cursor-grab active:cursor-grabbing select-none">
        {stages.map((s) => {
          const items = grouped.get(s.id) ?? [];
          const shown = visible[s.id] ?? PAGE;
          const totalValor = items.reduce((a, b) => a + (b.valor_estimado ?? 0), 0);
          const isOver = dragOver === s.id;
          return (
            <div
              key={s.id}
              onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
              onDragLeave={() => setDragOver((p) => (p === s.id ? null : p))}
              onDrop={(e) => onDrop(e, s.id)}
              style={{ borderColor: hexToRgba(s.cor, 0.4), background: isOver ? hexToRgba(s.cor, 0.08) : undefined }}
              className="flex min-h-0 w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-card/40 transition-colors"
            >
              <div className="h-1 w-full" style={{ background: s.cor }} />
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5" style={{ background: hexToRgba(s.cor, 0.12) }}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.cor }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: s.cor }}>{s.label}</span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                {totalValor > 0 && (
                  <span className="text-[10px] font-bold text-muted-foreground">{BRL(totalValor)}</span>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/40 py-6 text-center text-[11px] text-muted-foreground">
                    Arraste leads aqui
                  </div>
                )}
                {items.slice(0, shown).map((lead) => (
                  <KanbanCard
                    key={lead.id}
                    lead={lead}
                    stageColor={s.cor}
                    tagColors={tagColors}
                    onEdit={() => onEdit(lead)}
                    onOpenChat={() => openChatForLead(lead)}
                    onDragStart={onDragStart}
                  />
                ))}

                {items.length > shown && (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => ({ ...v, [s.id]: shown + PAGE }))}
                    className="mt-1 rounded-lg border border-dashed border-border/50 py-2 text-[11px] font-medium text-muted-foreground hover:bg-muted/40"
                  >
                    Ver mais ({items.length - shown})
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </DragScroll>

      <Dialog open={!!chatPhone} onOpenChange={(o) => !o && setChatPhone(null)}>
        <DialogContent className="p-0 max-w-[95vw] w-[1200px] h-[85vh] overflow-hidden flex flex-col gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Chat ao vivo</DialogTitle>
          </DialogHeader>
          {chatPhone && (
            <div className="min-h-0 flex-1 bg-chat-shell">
              <ChatEmbed phone={chatPhone} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


// (chat abre em /chat?phone=... — sem iframe)






function KanbanCard({
  lead, stageColor, tagColors, onEdit, onOpenChat, onDragStart,
}: {
  lead: Lead;
  stageColor: string;
  tagColors: Map<string, string>;
  onEdit: () => void;
  onOpenChat: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, lead: Lead) => void;
}) {
  const avatarColor = colorFromName(lead.nome);
  const initials = initialsOf(lead.nome);
  const phoneDigits = (lead.telefone ?? "").replace(/\D+/g, "");
  const handleClick = () => {
    if (phoneDigits) onOpenChat();
    else onEdit();
  };
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onClick={handleClick}
      style={{ borderLeftColor: stageColor }}
      className="group relative cursor-pointer rounded-lg border border-border border-l-4 bg-background/80 p-3 hover:border-accent/40 hover:shadow-md transition-all"
      title={phoneDigits ? "Abrir conversa" : "Editar lead"}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="absolute right-1.5 top-1.5 hidden rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground group-hover:block"
        title="Editar lead"
      >
        <Pencil className="h-3 w-3" />
      </button>

      <div className="flex items-start gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ring-2"
          style={{ background: avatarColor, boxShadow: `0 0 0 2px ${hexToRgba(avatarColor, 0.25)}` }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{lead.nome}</p>
              {lead.expert && (
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {lead.expert}
                </p>
              )}
            </div>
            {(lead.valor_estimado ?? 0) > 0 && (
              <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                {BRL(lead.valor_estimado ?? 0)}
              </span>
            )}
          </div>
        </div>
      </div>
      {(lead.telefone || lead.email) && (
        <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          {lead.telefone && (
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3 text-emerald-400" />
              {lead.telefone}
            </span>
          )}
          {lead.email && <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" />{lead.email}</span>}
        </div>
      )}
      {lead.tags && lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map((t) => {
            const c = tagColors.get(t.toLowerCase()) ?? colorFromName(t);
            return (
              <span
                key={t}
                className="rounded-md border px-1.5 py-0 text-[9px] font-semibold"
                style={{ borderColor: hexToRgba(c, 0.6), background: hexToRgba(c, 0.15), color: c }}
              >
                {t}
              </span>
            );
          })}
          {lead.tags.length > 3 && (
            <span className="rounded-md border border-border px-1.5 py-0 text-[9px] font-semibold text-muted-foreground">+{lead.tags.length - 3}</span>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
        {lead.responsavel_nome ? (
          <span className="flex items-center gap-1"><User className="h-3 w-3" />{lead.responsavel_nome}</span>
        ) : <span />}
        {lead.fonte && <span>{lead.fonte}</span>}
      </div>
    </div>
  );
}


// ---------- Lista ----------
function Lista({
  stages, leads, tagColors, onEdit, onRemove,
}: {
  stages: StageView[];
  leads: Lead[];
  tagColors: Map<string, string>;
  onEdit: (l: Lead) => void;
  onRemove: (id: string) => void;

}) {
  return (
    <div className="flex-1 overflow-auto rounded-xl border border-border bg-card/40">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
          <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Lead</th>
            <th className="px-4 py-3">Contato</th>
            <th className="px-4 py-3">Operação</th>
            <th className="px-4 py-3">Fonte</th>
            <th className="px-4 py-3">Responsável</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="w-10 px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-16 text-center text-sm text-muted-foreground">
              Nenhum lead encontrado. Crie um novo ou aguarde a chegada via integração.
            </td></tr>
          )}
          {leads.map((l) => {
            const stage = stages.find((s) => s.id === l.status) ?? stages[0];

            return (
              <tr key={l.id} className="border-t border-border/40 hover:bg-card/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: colorFromName(l.nome) }}
                    >
                      {initialsOf(l.nome)}
                    </div>
                    <button onClick={() => onEdit(l)} className="text-left font-semibold hover:text-accent">
                      {l.nome}
                    </button>
                  </div>
                  {l.tags && l.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 pl-9">
                      {l.tags.map((t) => {
                        const c = tagColors.get(t.toLowerCase()) ?? colorFromName(t);
                        return (
                          <span
                            key={t}
                            className="rounded-md border px-1.5 py-0 text-[9px] font-semibold"
                            style={{ borderColor: hexToRgba(c, 0.6), background: hexToRgba(c, 0.15), color: c }}
                          >
                            {t}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>

                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {l.telefone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{l.telefone}</div>}
                  {l.email && <div className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{l.email}</div>}
                </td>
                <td className="px-4 py-3 text-xs">{l.expert ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{l.fonte ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{l.responsavel_nome ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ borderColor: hexToRgba(stage.cor, 0.5), background: hexToRgba(stage.cor, 0.12), color: stage.cor }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: stage.cor }} />{stage.label}
                  </span>
                </td>

                <td className="px-4 py-3 text-right text-xs font-bold tabular-nums">
                  {(l.valor_estimado ?? 0) > 0 ? BRL(l.valor_estimado ?? 0) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-2 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(l)}><Pencil className="mr-2 h-3.5 w-3.5" /> Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onRemove(l.id)} className="text-rose-400 focus:text-rose-400">
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Dialog ----------
function LeadDialog({
  open, lead, stages, defaultExpert, operacoes, onClose, onSubmit, onDelete, loading,
}: {
  open: boolean;
  lead: Lead | null;
  stages: StageView[];
  defaultExpert?: string;
  operacoes: string[];
  onClose: () => void;
  onSubmit: (payload: Partial<Lead>) => void;
  onDelete?: () => void;
  loading: boolean;
}) {

  const [form, setForm] = useState<Partial<Lead>>({});

  // Reset form when opening
  useMemo(() => {
    if (open) {
      setForm(
        lead ?? {
          nome: "", telefone: "", email: "",
          expert: defaultExpert ?? null,
          fonte: "", status: "novo",
          responsavel_nome: "", valor_estimado: 0,
          tags: [], notas: "",
        },
      );
    }
  }, [open, lead, defaultExpert]);

  function set<K extends keyof Lead>(k: K, v: Lead[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleSubmit() {
    if (!form.nome?.trim()) { toast.error("Nome é obrigatório"); return; }
    const payload: any = { ...form };
    if (typeof payload.tags === "string") {
      payload.tags = payload.tags.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    payload.valor_estimado = Number(payload.valor_estimado) || 0;
    onSubmit(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar lead" : "Novo lead"}</DialogTitle>
          <DialogDescription>
            Preencha as informações do lead. Você pode editar a qualquer momento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field label="Nome *">
            <Input value={form.nome ?? ""} onChange={(e) => set("nome", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone"><Input value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} /></Field>
            <Field label="Email"><Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Operação">
              <Select value={form.expert ?? "none"} onValueChange={(v) => set("expert", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {operacoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status ?? "novo"} onValueChange={(v) => set("status", v as string)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}

                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fonte"><Input value={form.fonte ?? ""} onChange={(e) => set("fonte", e.target.value)} placeholder="Ex: Anúncio, Indicação…" /></Field>
            <Field label="Responsável"><Input value={form.responsavel_nome ?? ""} onChange={(e) => set("responsavel_nome", e.target.value)} /></Field>
          </div>
          <Field label="Valor estimado (R$)">
            <Input
              type="number" inputMode="decimal" step="1"
              value={form.valor_estimado ?? 0}
              onChange={(e) => set("valor_estimado", Number(e.target.value))}
            />
          </Field>
          <Field label="Tags (separadas por vírgula)">
            <Input
              value={Array.isArray(form.tags) ? form.tags.join(", ") : (form.tags ?? "") as any}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value as any }))}
            />
          </Field>
          <Field label="Notas">
            <Textarea rows={3} value={form.notas ?? ""} onChange={(e) => set("notas", e.target.value)} />
          </Field>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {onDelete && (
              <Button variant="ghost" className="text-rose-400 hover:text-rose-300" onClick={onDelete}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Remover
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading}>{loading ? "Salvando…" : "Salvar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
