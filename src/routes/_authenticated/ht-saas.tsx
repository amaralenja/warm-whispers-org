import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getVendorSession } from "@/lib/vendor-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Rocket, Plus, ExternalLink, MessageCircle, User, Code, CheckCircle2,
  Clock, AlertTriangle, Search, Filter, Trash2, Pencil, StickyNote,
  Bug, Zap, Flag, Layers, ShieldAlert, ChevronRight, Lock
} from "lucide-react";
import {
  loadLocalSaasProjects,
  saveLocalSaasProjects,
  loadLocalSaasNotes,
  saveLocalSaasNote,
  deleteLocalSaasNote,
  type SaasFase,
  type SaasProject,
  type SaasNote,
} from "@/lib/ht-saas-state";

export const Route = createFileRoute("/_authenticated/ht-saas")({
  component: () => <SaasProjectsPage />,
});

const FASE_CONFIG: Record<SaasFase, { label: string; badge: string; icon: any; border: string }> = {
  planejamento: {
    label: "Planejamento",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: Clock,
    border: "border-amber-500/30",
  },
  desenvolvimento: {
    label: "Em Desenvolvimento",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30 shadow-[0_0_15px_-4px_rgba(56,189,248,0.4)]",
    icon: Code,
    border: "border-sky-500/40",
  },
  testes: {
    label: "Em Testes / QA",
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30 shadow-[0_0_15px_-4px_rgba(167,139,250,0.4)]",
    icon: Layers,
    border: "border-violet-500/40",
  },
  lancado: {
    label: "Lançado / Pronto",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_15px_-4px_rgba(16,185,129,0.4)]",
    icon: CheckCircle2,
    border: "border-emerald-500/40",
  },
  pausado: {
    label: "Pausado",
    badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    icon: AlertTriangle,
    border: "border-zinc-500/30",
  },
};

function SaasProjectsPage() {
  const vendorSession = getVendorSession();
  const navigate = useNavigate();
  const isAdmin = !vendorSession;

  const [projects, setProjects] = useState<SaasProject[]>([]);
  const [search, setSearch] = useState("");
  const [faseFilter, setFaseFilter] = useState<string>("all");

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SaasProject | null>(null);

  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [activeProjectForNotes, setActiveProjectForNotes] = useState<SaasProject | null>(null);

  const refreshProjects = () => {
    setProjects(loadLocalSaasProjects());
  };

  useEffect(() => {
    refreshProjects();
    const handleUpdate = () => refreshProjects();
    window.addEventListener("multium-ht-saas-updated", handleUpdate);
    return () => window.removeEventListener("multium-ht-saas-updated", handleUpdate);
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (faseFilter !== "all" && p.fase !== faseFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const hay = `${p.nome} ${p.devResponsavel ?? ""} ${p.nomeGrupo ?? ""} ${p.descricao ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, faseFilter]);

  const stats = useMemo(() => {
    const total = projects.length;
    const dev = projects.filter((p) => p.fase === "desenvolvimento").length;
    const testes = projects.filter((p) => p.fase === "testes").length;
    const lancados = projects.filter((p) => p.fase === "lancado").length;
    return { total, dev, testes, lancados };
  }, [projects]);

  if (!isAdmin) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-destructive/20 text-destructive">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Acesso Restrito a Administradores</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Apenas administradores do sistema têm permissão para acessar o painel de organização de SaaS em Construção.
          </p>
          <Button className="mt-6 gap-2" onClick={() => navigate({ to: "/dashboard" })}>
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const handleDeleteProject = (id: string, nome: string) => {
    if (confirm(`Tem certeza que deseja excluir o projeto "${nome}"?`)) {
      const next = projects.filter((p) => p.id !== id);
      saveLocalSaasProjects(next);
      toast.success("Projeto SaaS removido.");
    }
  };

  return (
    <div className="px-6 md:px-10 py-8 space-y-8 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent font-bold">
            <Rocket className="h-4 w-4" />
            High Ticket · Organização DEV
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1 text-foreground">
            SaaS em Construção 🛠️
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Painel exclusivo de administradores para gestão de novos produtos SaaS, links, grupos e diário de bordo DEV.
          </p>
        </div>

        <Button
          onClick={() => {
            setEditingProject(null);
            setProjectModalOpen(true);
          }}
          className="bg-gradient-to-r from-accent to-blue-500 text-white font-bold h-11 px-5 shadow-lg shadow-accent/20 hover:scale-105 transition-all gap-2"
        >
          <Plus className="h-4 w-4" />
          Novo SaaS em Construção
        </Button>
      </div>

      {/* METRICS KPIS */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50 bg-card/40 backdrop-blur shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total de Projetos</div>
              <div className="text-3xl font-black mt-1 text-foreground">{stats.total}</div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-accent/15 flex items-center justify-center text-accent">
              <Rocket className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-sky-500/30 bg-sky-500/5 backdrop-blur shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-sky-400">Em Desenvolvimento</div>
              <div className="text-3xl font-black mt-1 text-sky-300">{stats.dev}</div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-sky-500/20 flex items-center justify-center text-sky-400">
              <Code className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-violet-500/30 bg-violet-500/5 backdrop-blur shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-violet-400">Em Testes / QA</div>
              <div className="text-3xl font-black mt-1 text-violet-300">{stats.testes}</div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-violet-500/20 flex items-center justify-center text-violet-400">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5 backdrop-blur shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Lançados / Prontos</div>
              <div className="text-3xl font-black mt-1 text-emerald-300">{stats.lancados}</div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CONTROLS BAR */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card/40 p-3 rounded-2xl border border-border/50 backdrop-blur">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome do SaaS, DEV responsável, grupo ou descrição..."
            className="pl-10 h-10 bg-background/60 border-border/50 text-sm focus-visible:ring-accent"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          {[
            { id: "all", label: "Todos" },
            { id: "desenvolvimento", label: "🛠️ Em Dev" },
            { id: "testes", label: "🧪 Em Testes" },
            { id: "planejamento", label: "📝 Planejamento" },
            { id: "lancado", label: "✅ Lançados" },
            { id: "pausado", label: "⏸️ Pausados" },
          ].map((f) => (
            <Button
              key={f.id}
              variant={faseFilter === f.id ? "default" : "outline"}
              size="sm"
              onClick={() => setFaseFilter(f.id)}
              className={`h-9 px-3 text-xs font-semibold rounded-xl transition-all ${
                faseFilter === f.id
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "bg-background/60 border-border/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* SAAS PROJECTS GRID */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 rounded-3xl border border-dashed border-border/60 bg-card/20">
          <Rocket className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40 animate-bounce" />
          <h3 className="text-lg font-bold text-foreground">Nenhum SaaS localizado</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {search || faseFilter !== "all"
              ? "Tente alterar os filtros ou o termo pesquisado."
              : "Cadastre o primeiro projeto SaaS em construção clicando no botão acima."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          {filteredProjects.map((p) => {
            const cfg = FASE_CONFIG[p.fase] || FASE_CONFIG.planejamento;
            const FaseIcon = cfg.icon;
            const notes = loadLocalSaasNotes(p.id);

            return (
              <Card
                key={p.id}
                className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border ${cfg.border} bg-gradient-to-b from-card/80 to-card/40 backdrop-blur transition-all duration-300 hover:border-accent/50 hover:shadow-xl`}
              >
                <div>
                  {/* CARD HEADER */}
                  <div className="p-6 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant="outline" className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${cfg.badge} flex items-center gap-1.5 w-fit`}>
                          <FaseIcon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                        <h2 className="text-xl font-bold tracking-tight mt-2.5 text-foreground">
                          {p.nome}
                        </h2>
                      </div>

                      <div className="flex items-center gap-1 bg-background/50 p-1 rounded-xl border border-border/40">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-accent"
                          title="Editar SaaS"
                          onClick={() => {
                            setEditingProject(p);
                            setProjectModalOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Excluir"
                          onClick={() => handleDeleteProject(p.id, p.nome)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* PROGRESS BAR */}
                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[11px] font-medium text-muted-foreground">Progresso da Construção</span>
                        <span className="font-mono font-bold text-accent">{p.progressoPct ?? 0}%</span>
                      </div>
                      <div className="h-2 w-full bg-border/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-accent to-blue-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, p.progressoPct ?? 0))}%` }}
                        />
                      </div>
                    </div>

                    {/* DESCRIPTION */}
                    {p.descricao && (
                      <p className="text-xs text-muted-foreground/90 mt-3 line-clamp-2 leading-relaxed">
                        {p.descricao}
                      </p>
                    )}
                  </div>

                  {/* INFO GRID */}
                  <div className="px-6 py-3 bg-muted/20 border-y border-border/40 grid grid-cols-2 gap-3 text-xs">
                    {/* DEV RESPONSÁVEL */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-accent/15 flex items-center justify-center shrink-0 text-accent font-bold">
                        <Code className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">DEV / Responsável</div>
                        <div className="font-medium text-foreground truncate">{p.devResponsavel || "Não atribuído"}</div>
                      </div>
                    </div>

                    {/* GRUPO */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 text-emerald-400 font-bold">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Grupo do Projetos</div>
                        {p.linkGrupo ? (
                          <a href={p.linkGrupo} target="_blank" rel="noreferrer" className="font-medium text-emerald-400 hover:underline truncate block">
                            {p.nomeGrupo || "Acessar Grupo"} ↗
                          </a>
                        ) : (
                          <div className="font-medium text-foreground truncate">{p.nomeGrupo || "Sem grupo cadastrado"}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD FOOTER */}
                <div className="p-4 px-6 bg-card/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {p.linkSaas ? (
                    <a
                      href={p.linkSaas}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline truncate"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{p.linkSaas}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Sem URL de teste cadastrada</span>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveProjectForNotes(p);
                      setNotesDialogOpen(true);
                    }}
                    className="gap-2 h-9 border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent font-semibold shrink-0"
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    Diário & Anotações ({notes.length})
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* DIALOG ADD/EDIT PROJETO SAAS */}
      <SaasProjectFormModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        initialData={editingProject}
        onSaved={() => {
          refreshProjects();
          setProjectModalOpen(false);
        }}
      />

      {/* DIALOG DIÁRIO DE BORDO & ANOTAÇÕES DEV */}
      {activeProjectForNotes && (
        <SaasNotesModal
          open={notesDialogOpen}
          onOpenChange={setNotesDialogOpen}
          project={activeProjectForNotes}
        />
      )}
    </div>
  );
}

function SaasProjectFormModal({
  open,
  onOpenChange,
  initialData,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialData: SaasProject | null;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [linkSaas, setLinkSaas] = useState("");
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [linkGrupo, setLinkGrupo] = useState("");
  const [fase, setFase] = useState<SaasFase>("desenvolvimento");
  const [devResponsavel, setDevResponsavel] = useState("");
  const [progressoPct, setProgressoPct] = useState<number>(50);
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (initialData) {
      setNome(initialData.nome || "");
      setLinkSaas(initialData.linkSaas || "");
      setNomeGrupo(initialData.nomeGrupo || "");
      setLinkGrupo(initialData.linkGrupo || "");
      setFase(initialData.fase || "desenvolvimento");
      setDevResponsavel(initialData.devResponsavel || "");
      setProgressoPct(initialData.progressoPct ?? 50);
      setDescricao(initialData.descricao || "");
    } else {
      setNome("");
      setLinkSaas("");
      setNomeGrupo("");
      setLinkGrupo("");
      setFase("desenvolvimento");
      setDevResponsavel("");
      setProgressoPct(20);
      setDescricao("");
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Preencha o nome do SaaS.");
      return;
    }

    const projects = loadLocalSaasProjects();
    const now = new Date().toISOString();

    let updatedList: SaasProject[];
    if (initialData) {
      updatedList = projects.map((p) =>
        p.id === initialData.id
          ? {
              ...p,
              nome: nome.trim(),
              linkSaas: linkSaas.trim() || null,
              nomeGrupo: nomeGrupo.trim() || null,
              linkGrupo: linkGrupo.trim() || null,
              fase,
              devResponsavel: devResponsavel.trim() || null,
              progressoPct: Number(progressoPct),
              descricao: descricao.trim() || null,
              updated_at: now,
            }
          : p,
      );
      toast.success("Projeto SaaS atualizado!");
    } else {
      const newProj: SaasProject = {
        id: `saas-${crypto.randomUUID()}`,
        nome: nome.trim(),
        linkSaas: linkSaas.trim() || null,
        nomeGrupo: nomeGrupo.trim() || null,
        linkGrupo: linkGrupo.trim() || null,
        fase,
        devResponsavel: devResponsavel.trim() || null,
        progressoPct: Number(progressoPct),
        descricao: descricao.trim() || null,
        created_at: now,
        updated_at: now,
      };
      updatedList = [newProj, ...projects];
      toast.success("SaaS adicionado com sucesso!");
    }

    saveLocalSaasProjects(updatedList);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-border/60 bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Rocket className="h-5 w-5 text-accent" />
            {initialData ? "Editar SaaS em Construção" : "Novo SaaS em Construção"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nome do SaaS *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Multium AI, Cakto Bot, ZapManager"
              required
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Fase / Status</Label>
              <Select value={fase} onValueChange={(v) => setFase(v as SaasFase)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejamento">📝 Planejamento</SelectItem>
                  <SelectItem value="desenvolvimento">🛠️ Em Desenvolvimento</SelectItem>
                  <SelectItem value="testes">🧪 Em Testes / QA</SelectItem>
                  <SelectItem value="lancado">✅ Lançado / Concluído</SelectItem>
                  <SelectItem value="pausado">⏸️ Pausado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">DEV / Responsável</Label>
              <Input
                value={devResponsavel}
                onChange={(e) => setDevResponsavel(e.target.value)}
                placeholder="Ex: Victor, Caio, Equipe DEV"
                className="h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Link do SaaS (Staging / Prod)</Label>
              <Input
                value={linkSaas}
                onChange={(e) => setLinkSaas(e.target.value)}
                placeholder="https://meusaas.com"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nome do Grupo do SaaS</Label>
              <Input
                value={nomeGrupo}
                onChange={(e) => setNomeGrupo(e.target.value)}
                placeholder="Ex: Grupo Dev Multium"
                className="h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Link do Grupo (WhatsApp / Telegram)</Label>
              <Input
                value={linkGrupo}
                onChange={(e) => setLinkGrupo(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Progresso da Construção ({progressoPct}%)</Label>
              <div className="flex items-center gap-3 h-10">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progressoPct}
                  onChange={(e) => setProgressoPct(Number(e.target.value))}
                  className="flex-1 accent-accent"
                />
                <span className="font-mono text-sm font-bold w-12 text-right">{progressoPct}%</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Descrição / Visão Geral / Stack</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva a utilidade do SaaS, funcionalidades principais, integrações, etc..."
              rows={3}
              className="resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-accent text-accent-foreground font-bold">
              {initialData ? "Salvar Alterações" : "Criar Projeto SaaS"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaasNotesModal({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SaasProject;
}) {
  const [notes, setNotes] = useState<SaasNote[]>([]);
  const [autor, setAutor] = useState("Admin / DEV");
  const [tipo, setTipo] = useState<"anotacao" | "dev_update" | "bug" | "milestone">("dev_update");
  const [conteudo, setConteudo] = useState("");

  const refreshNotes = () => {
    setNotes(loadLocalSaasNotes(project.id));
  };

  useEffect(() => {
    if (open) refreshNotes();
  }, [open, project.id]);

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!conteudo.trim()) return;

    const newNote: SaasNote = {
      id: `note-${crypto.randomUUID()}`,
      saasId: project.id,
      autor: autor.trim() || "Admin / DEV",
      tipo,
      conteudo: conteudo.trim(),
      created_at: new Date().toISOString(),
    };

    saveLocalSaasNote(newNote);
    setConteudo("");
    refreshNotes();
    toast.success("Anotação adicionada ao diário de bordo!");
  };

  const handleDeleteNote = (id: string) => {
    deleteLocalSaasNote(project.id, id);
    refreshNotes();
    toast.success("Anotação removida.");
  };

  const NOTE_TYPE_BADGES: Record<string, { label: string; class: string; icon: any }> = {
    anotacao: { label: "Anotação", class: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30", icon: StickyNote },
    dev_update: { label: "DEV Update", class: "bg-sky-500/15 text-sky-300 border-sky-500/30", icon: Zap },
    bug: { label: "Bug Fix", class: "bg-red-500/15 text-red-300 border-red-500/30", icon: Bug },
    milestone: { label: "Milestone", class: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: Flag },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border/60 bg-background max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0 border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-accent/15 text-accent border-accent/30 text-[10px] font-bold uppercase">
              Diário de Bordo & Anotações DEV
            </Badge>
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight mt-1 text-foreground">
            {project.nome}
          </DialogTitle>
          {project.devResponsavel && (
            <p className="text-xs text-muted-foreground">
              DEV Responsável: <span className="text-foreground font-semibold">{project.devResponsavel}</span>
            </p>
          )}
        </DialogHeader>

        {/* INPUT DE NOVA ANOTAÇÃO */}
        <form onSubmit={handleAddNote} className="shrink-0 bg-card/50 p-4 rounded-xl border border-border/50 space-y-3 my-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">Autor (Seu nome)</Label>
              <Input
                value={autor}
                onChange={(e) => setAutor(e.target.value)}
                placeholder="Admin / DEV"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">Categoria da Atualização</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dev_update">⚡ DEV Update</SelectItem>
                  <SelectItem value="anotacao">📝 Anotação Geral</SelectItem>
                  <SelectItem value="bug">🐛 Bug Fix / Correção</SelectItem>
                  <SelectItem value="milestone">🏁 Milestone / Conquista</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground font-semibold">Conteúdo da Anotação / Atualização</Label>
            <Textarea
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="Descreva as alterações efetuadas, progresso da tarefa, bugs corrigidos ou próximas metas..."
              rows={2}
              className="text-xs resize-none"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!conteudo.trim()} className="gap-1.5 bg-accent text-accent-foreground font-bold h-9">
              <Plus className="h-3.5 w-3.5" />
              Publicar no Diário
            </Button>
          </div>
        </form>

        {/* TIMELINE DE ANOTAÇÕES */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-3 my-2">
          {notes.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs italic border border-dashed border-border/40 rounded-xl">
              Nenhuma anotação registrada ainda neste projeto.
            </div>
          ) : (
            notes.map((n) => {
              const b = NOTE_TYPE_BADGES[n.tipo] || NOTE_TYPE_BADGES.anotacao;
              const Icon = b.icon;
              return (
                <div
                  key={n.id}
                  className="group relative rounded-xl border border-border/50 bg-card/30 p-4 transition-all hover:border-border hover:bg-card/60"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${b.class} flex items-center gap-1`}>
                        <Icon className="h-2.5 w-2.5" />
                        {b.label}
                      </Badge>
                      <span className="text-xs font-bold text-foreground">{n.autor}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("pt-BR", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteNote(n.id)}
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {n.conteudo}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t border-border/40">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
