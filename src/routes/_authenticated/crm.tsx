import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Download, LayoutGrid, List, Trash2, Pencil, Phone, Mail,
  User, MoreVertical, KeyRound, RefreshCw, Tag as TagIcon,
} from "lucide-react";
import { TagsManagerDialog } from "@/components/tags-manager-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { fireNewLeadTrigger } from "@/lib/flow-engine.functions";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CRMPage,
});

// ---------- Stages ----------
const STAGES = [
  { id: "novo",        label: "Novo",        color: "bg-blue-500",    border: "border-blue-500/40",    text: "text-blue-300",    soft: "bg-blue-500/10" },
  { id: "contato",     label: "Em contato",  color: "bg-amber-500",   border: "border-amber-500/40",   text: "text-amber-300",   soft: "bg-amber-500/10" },
  { id: "qualificado", label: "Qualificado", color: "bg-violet-500",  border: "border-violet-500/40",  text: "text-violet-300",  soft: "bg-violet-500/10" },
  { id: "negociacao",  label: "Negociação",  color: "bg-orange-500",  border: "border-orange-500/40",  text: "text-orange-300",  soft: "bg-orange-500/10" },
  { id: "ganho",       label: "Ganho",       color: "bg-emerald-500", border: "border-emerald-500/40", text: "text-emerald-300", soft: "bg-emerald-500/10" },
  { id: "perdido",     label: "Perdido",     color: "bg-rose-500",    border: "border-rose-500/40",    text: "text-rose-300",    soft: "bg-rose-500/10" },
] as const;

type Stage = typeof STAGES[number]["id"];

type Lead = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  expert: string | null;
  fonte: string | null;
  status: Stage | string;
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

type ExpertApiKey = { id: number; nome: string; ativo: boolean; crm_api_key: string | null };

const API_BASE = "https://vyzap.lovable.app/api/public/v1";

const BRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

function firstString(obj: Record<string, any>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj?.[key];
    if (value == null) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return null;
}

function firstNumber(obj: Record<string, any>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = obj?.[key];
    if (raw == null || raw === "") continue;
    const parsed = Number(String(raw).replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractLeadArray(payload: any): Record<string, any>[] {
  if (Array.isArray(payload)) return payload;
  const candidates = [payload?.leads, payload?.data, payload?.items, payload?.contacts, payload?.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (Array.isArray(candidate?.data)) return candidate.data;
    if (Array.isArray(candidate?.items)) return candidate.items;
  }
  return [];
}

function normalizeApiLead(raw: Record<string, any>, expert: string, index: number): Partial<Lead> & { _syncKey: string } {
  const externalId = firstString(raw, ["id", "lead_id", "leadId", "contact_id", "contactId", "uuid", "external_id", "externalId"]);
  const telefone = firstString(raw, ["telefone", "phone", "celular", "whatsapp", "numero", "number", "mobile"]);
  const email = firstString(raw, ["email", "e_mail"]);
  const nome = firstString(raw, ["nome", "name", "full_name", "fullName", "lead_name", "leadName", "first_name", "firstName"])
    ?? email
    ?? telefone
    ?? `Lead ${index + 1}`;
  const fonte = firstString(raw, ["fonte", "source", "origem", "utm_source", "utmSource", "campaign", "campanha"]);
  const responsavelUtm = firstString(raw, ["responsavel_utm", "utm", "utm_content", "utmContent", "vendedor_utm", "seller_utm"]);
  const responsavelNome = firstString(raw, ["responsavel_nome", "responsavel", "seller", "seller_name", "vendedor", "vendedor_nome"]);
  const valor = firstNumber(raw, ["valor_estimado", "valor", "value", "ticket", "revenue"]);
  const createdAt = firstString(raw, ["created_at", "createdAt", "data", "date", "timestamp"]);
  const tagsRaw = raw.tags ?? raw.tag;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((tag) => String(tag).trim()).filter(Boolean)
    : typeof tagsRaw === "string"
      ? tagsRaw.split(",").map((tag) => tag.trim()).filter(Boolean)
      : [];
  const syncKey = `${expert}|${externalId || email || telefone || nome}`.toLowerCase();

  return {
    _syncKey: syncKey,
    nome,
    telefone,
    email,
    expert,
    fonte: fonte ?? "Quiz API",
    status: "novo",
    responsavel_utm: responsavelUtm,
    responsavel_nome: responsavelNome,
    valor_estimado: valor ?? 0,
    tags,
    ultima_interacao: createdAt,
    dados: {
      origem: "crm_leads_x1_api",
      external_id: externalId,
      sync_key: syncKey,
      raw,
    },
  };
}

async function fetchCrmApiLeads(expert: ExpertApiKey) {
  const url = new URL(`${API_BASE}/contacts`);
  url.searchParams.set("period", "all");
  url.searchParams.set("limit", "500");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${expert.crm_api_key}` },
  });
  if (!res.ok) throw new Error(`${expert.nome}: /contacts retornou HTTP ${res.status}`);
  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${expert.nome}: /contacts não retornou JSON. Confere a API key.`);
  }
  return extractLeadArray(payload).map((raw, index) => normalizeApiLead(raw, expert.nome, index));
}

// ---------- Page ----------
function CRMPage() {
  const qc = useQueryClient();
  const fireNewLead = useServerFn(fireNewLeadTrigger);
  const { workspace, workspaces } = useWorkspace();
  const isGeral = workspace?.id === "all";

  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [search, setSearch] = useState("");
  const [opFilter, setOpFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  const operacoes = useMemo(
    () => workspaces.filter((w) => w.id !== "all").map((w) => w.nome),
    [workspaces],
  );

  const { data: expertsWithKeys = [], isLoading: loadingApiKeys } = useQuery({
    queryKey: ["experts-crm-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experts")
        .select("id, nome, ativo, crm_api_key")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ExpertApiKey[];
    },
  });

  const targetApiExperts = useMemo(() => {
    const active = expertsWithKeys.filter((e) => e.ativo && e.crm_api_key);
    if (isGeral) return active;
    return active.filter((e) => e.nome === workspace?.nome);
  }, [expertsWithKeys, isGeral, workspace?.nome]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["crm-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("*")
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const syncLeads = useMutation({
    mutationFn: async () => {
      if (targetApiExperts.length === 0) {
        return { fetched: 0, inserted: 0, skipped: 0 };
      }

      const batches = await Promise.all(targetApiExperts.map(fetchCrmApiLeads));
      const fetched = batches.flat();
      if (fetched.length === 0) {
        return { fetched: 0, inserted: 0, skipped: 0 };
      }

      const { data: existingRows, error: existingError } = await supabase
        .from("crm_leads")
        .select("id,nome,telefone,email,expert,dados");
      if (existingError) throw existingError;

      const existingKeys = new Set<string>();
      for (const row of (existingRows ?? []) as any[]) {
        const dados = row.dados && typeof row.dados === "object" ? row.dados : {};
        if (dados.sync_key) existingKeys.add(String(dados.sync_key).toLowerCase());
        const fallback = `${row.expert ?? ""}|${row.email || row.telefone || row.nome || ""}`.toLowerCase();
        if (fallback !== "|") existingKeys.add(fallback);
      }

      const seenThisSync = new Set<string>();
      const toInsert = fetched
        .filter((lead) => {
          if (existingKeys.has(lead._syncKey) || seenThisSync.has(lead._syncKey)) return false;
          seenThisSync.add(lead._syncKey);
          return true;
        })
        .map(({ _syncKey, ...lead }) => lead)
        .filter((lead) => lead.nome?.trim());

      let insertedIds: string[] = [];
      if (toInsert.length > 0) {
        const { data: ins, error } = await supabase.from("crm_leads").insert(toInsert as any[]).select("id");
        if (error) throw error;
        insertedIds = (ins ?? []).map((r: any) => r.id);
      }
      // Fire "new_lead" triggers (non-blocking)
      for (const id of insertedIds) {
        fireNewLead({ data: { lead_id: id } }).catch(() => {});
      }

      return {
        fetched: fetched.length,
        inserted: toInsert.length,
        skipped: fetched.length - toInsert.length,
      };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      if (result.inserted > 0) {
        toast.success(`${result.inserted} lead${result.inserted === 1 ? "" : "s"} importado${result.inserted === 1 ? "" : "s"}`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao puxar leads da API"),
  });

  const lastAutoSyncKey = useRef("");
  const autoSyncKey = useMemo(
    () => targetApiExperts.map((e) => `${e.id}:${e.crm_api_key}`).join("|"),
    [targetApiExperts],
  );

  useEffect(() => {
    if (loadingApiKeys || !autoSyncKey || lastAutoSyncKey.current === autoSyncKey) return;
    lastAutoSyncKey.current = autoSyncKey;
    syncLeads.mutate();
  }, [autoSyncKey, loadingApiKeys]);

  // Apply filters
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
      if (lead.id) {
        const { error } = await supabase.from("crm_leads").update(lead as any).eq("id", lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("crm_leads").insert(lead as any);
        if (error) throw error;
      }
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
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      toast.success("Lead removido");
    },
  });

  const moveStage = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Stage }) => {
      const { error } = await supabase.from("crm_leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-leads"] }),
  });

  // Export CSV
  function exportCSV() {
    const rows = filtered;
    if (!rows.length) {
      toast.error("Nada para exportar");
      return;
    }
    const headers = [
      "nome", "telefone", "email", "expert", "fonte", "status",
      "responsavel_nome", "valor_estimado", "tags", "notas",
      "ultima_interacao", "created_at",
    ];
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM Leads X1</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
            {!isGeral && ` em ${workspace?.nome}`}
            {targetApiExperts.length > 0 && ` · ${targetApiExperts.length} API key${targetApiExperts.length > 1 ? "s" : ""} ativa${targetApiExperts.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncLeads.mutate()}
            disabled={syncLeads.isPending || targetApiExperts.length === 0}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${syncLeads.isPending ? "animate-spin" : ""}`} />
            {syncLeads.isPending ? "Puxando…" : "Puxar leads"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setApiKeysOpen(true)}>
            <KeyRound className="mr-1.5 h-4 w-4" /> API Keys
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

      {!loadingApiKeys && targetApiExperts.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {isGeral
            ? "Cadastre pelo menos uma API key nas operações para o CRM puxar leads automaticamente."
            : `A operação ${workspace?.nome} ainda não tem API key de CRM cadastrada.`}
        </div>
      )}

      {syncLeads.data && syncLeads.data.fetched === 0 && targetApiExperts.length > 0 && (
        <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
          A API respondeu, mas não retornou nenhum lead em <code className="text-foreground">/api/public/v1/leads?period=30d</code>.
        </div>
      )}

      {/* Toolbar */}
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
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Operação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as operações</SelectItem>
              {operacoes.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background/60 p-1">
          <Button
            size="sm"
            variant={view === "kanban" ? "default" : "ghost"}
            className="h-7 px-3"
            onClick={() => setView("kanban")}
          >
            <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Kanban
          </Button>
          <Button
            size="sm"
            variant={view === "lista" ? "default" : "ghost"}
            className="h-7 px-3"
            onClick={() => setView("lista")}
          >
            <List className="mr-1.5 h-3.5 w-3.5" /> Lista
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Carregando leads…
        </div>
      ) : view === "kanban" ? (
        <Kanban
          leads={filtered}
          onMove={(id, status) => moveStage.mutate({ id, status })}
          onEdit={setEditing}
        />
      ) : (
        <Lista leads={filtered} onEdit={setEditing} onRemove={(id) => remove.mutate(id)} />
      )}

      {/* Edit / Create dialog */}
      <LeadDialog
        open={creating || !!editing}
        lead={editing}
        defaultExpert={!isGeral ? workspace?.nome : undefined}
        operacoes={operacoes}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSubmit={(payload) => upsert.mutate(payload)}
        onDelete={editing ? () => remove.mutate(editing.id) : undefined}
        loading={upsert.isPending}
      />

      <ApiKeysDialog open={apiKeysOpen} onClose={() => setApiKeysOpen(false)} />
      <TagsManagerDialog open={tagsOpen} onOpenChange={setTagsOpen} operacao={workspace?.id ?? "all"} />
    </div>
  );
}

// ---------- API Keys Dialog ----------
function ApiKeysDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const { data: experts = [] } = useQuery({
    queryKey: ["experts-crm-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experts")
        .select("id, nome, ativo, crm_api_key")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: number; nome: string; ativo: boolean; crm_api_key: string | null }[];
    },
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async (payload: { id: number; key: string }) => {
      const { error } = await supabase
        .from("experts")
        .update({ crm_api_key: payload.key || null })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["experts-crm-keys"] });
      toast.success("API Key salva");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>API Keys do CRM Leads X1</DialogTitle>
          <DialogDescription>
            Cole o Bearer Token de cada operação para puxar os leads automaticamente no CRM.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {experts.filter((e) => e.ativo).map((ex) => {
            const current = drafts[ex.id] ?? ex.crm_api_key ?? "";
            return (
              <div key={ex.id} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{ex.nome}</span>
                  {ex.crm_api_key && (
                    <Badge variant="secondary" className="text-xs">
                      ••••{ex.crm_api_key.slice(-6)}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Bearer token…"
                    value={current}
                    onChange={(e) => setDrafts((d) => ({ ...d, [ex.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    onClick={() => save.mutate({ id: ex.id, key: current })}
                    disabled={save.isPending}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            );
          })}
          {!experts.length && (
            <p className="text-sm text-muted-foreground">Nenhuma operação ativa cadastrada.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Kanban ----------
function Kanban({
  leads, onMove, onEdit,
}: {
  leads: Lead[];
  onMove: (id: string, status: Stage) => void;
  onEdit: (l: Lead) => void;
}) {
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const grouped = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of STAGES) map.set(s.id, []);
    for (const l of leads) {
      const arr = map.get(l.status) ?? map.get("novo")!;
      arr.push(l);
    }
    return map;
  }, [leads]);

  function onDragStart(e: DragEvent<HTMLDivElement>, lead: Lead) {
    e.dataTransfer.setData("text/plain", lead.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(e: DragEvent<HTMLDivElement>, status: Stage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setDragOver(null);
    if (id) onMove(id, status);
  }

  return (
    <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
      {STAGES.map((s) => {
        const items = grouped.get(s.id) ?? [];
        const totalValor = items.reduce((a, b) => a + (b.valor_estimado ?? 0), 0);
        const isOver = dragOver === s.id;
        return (
          <div
            key={s.id}
            onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
            onDragLeave={() => setDragOver((p) => (p === s.id ? null : p))}
            onDrop={(e) => onDrop(e, s.id)}
            className={`flex w-72 shrink-0 flex-col rounded-xl border ${s.border} ${isOver ? "bg-card" : "bg-card/40"} transition-colors`}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${s.color}`} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${s.text}`}>{s.label}</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {items.length}
                </span>
              </div>
              {totalValor > 0 && (
                <span className="text-[10px] font-bold text-muted-foreground">{BRL(totalValor)}</span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/40 py-6 text-center text-[11px] text-muted-foreground">
                  Arraste leads aqui
                </div>
              )}
              {items.map((lead) => (
                <KanbanCard key={lead.id} lead={lead} onClick={() => onEdit(lead)} onDragStart={onDragStart} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  lead, onClick, onDragStart,
}: {
  lead: Lead;
  onClick: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, lead: Lead) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onClick={onClick}
      className="group cursor-pointer rounded-lg border border-border bg-background/80 p-3 hover:border-accent/40 hover:shadow-md transition-all"
    >
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
      {(lead.telefone || lead.email) && (
        <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          {lead.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.telefone}</span>}
          {lead.email && <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" />{lead.email}</span>}
        </div>
      )}
      {lead.tags && lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map((t) => (
            <Badge key={t} variant="outline" className="px-1.5 py-0 text-[9px]">{t}</Badge>
          ))}
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
  leads, onEdit, onRemove,
}: {
  leads: Lead[];
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
            const stage = STAGES.find((s) => s.id === l.status) ?? STAGES[0];
            return (
              <tr key={l.id} className="border-t border-border/40 hover:bg-card/60">
                <td className="px-4 py-3">
                  <button onClick={() => onEdit(l)} className="text-left font-semibold hover:text-accent">
                    {l.nome}
                  </button>
                  {l.tags && l.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.tags.map((t) => <Badge key={t} variant="outline" className="px-1.5 py-0 text-[9px]">{t}</Badge>)}
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
                  <span className={`inline-flex items-center gap-1.5 rounded-md border ${stage.border} ${stage.soft} px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${stage.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${stage.color}`} />{stage.label}
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
  open, lead, defaultExpert, operacoes, onClose, onSubmit, onDelete, loading,
}: {
  open: boolean;
  lead: Lead | null;
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
              <Select value={form.status ?? "novo"} onValueChange={(v) => set("status", v as Stage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
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
