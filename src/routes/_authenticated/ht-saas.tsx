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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Rocket, Plus, ExternalLink, MessageCircle, User, Code, CheckCircle2,
  Clock, AlertTriangle, Search, Filter, Trash2, Pencil, StickyNote,
  Bug, Zap, Flag, Layers, ShieldAlert, ChevronRight, Lock, Flame,
  Check, ArrowRight, Calendar, UserCheck, AlertCircle, Wrench, Eye, LayoutGrid
} from "lucide-react";
import {
  loadLocalSaasProjects,
  saveLocalSaasProjects,
  loadLocalSaasNotes,
  saveLocalSaasNote,
  deleteLocalSaasNote,
  loadLocalAjustesUrgentes,
  saveLocalAjustesUrgentes,
  type SaasFase,
  type SaasProject,
  type SaasNote,
  type AjusteUrgente,
  type AjustePrioridade,
  type AjusteStatus,
} from "@/lib/ht-saas-state";

export const Route = createFileRoute("/_authenticated/ht-saas")({
  ssr: false,
  component: () => <SaasProjectsPage />,
});

const FASE_CONFIG: Record<SaasFase, { label: string; badge: string; icon: any; border: string; cardBg: string }> = {
  planejamento: {
    label: "📝 PLANEJAMENTO",
    badge: "bg-amber-500/25 text-amber-200 border-amber-400 font-extrabold shadow-[0_0_15px_-3px_rgba(245,158,11,0.5)]",
    icon: Clock,
    border: "border-amber-500/60 shadow-[0_0_20px_-5px_rgba(245,158,11,0.25)]",
    cardBg: "from-amber-950/30 to-card/60",
  },
  desenvolvimento: {
    label: "🛠️ EM DESENVOLVIMENTO",
    badge: "bg-sky-500/25 text-sky-200 border-sky-400 font-extrabold shadow-[0_0_15px_-3px_rgba(56,189,248,0.6)] animate-pulse",
    icon: Code,
    border: "border-sky-500/70 shadow-[0_0_25px_-5px_rgba(56,189,248,0.3)]",
    cardBg: "from-sky-950/40 to-card/60",
  },
  testes: {
    label: "🧪 EM TESTES / QA",
    badge: "bg-purple-500/25 text-purple-200 border-purple-400 font-extrabold shadow-[0_0_15px_-3px_rgba(168,85,247,0.6)]",
    icon: Layers,
    border: "border-purple-500/70 shadow-[0_0_25px_-5px_rgba(168,85,247,0.3)]",
    cardBg: "from-purple-950/30 to-card/60",
  },
  lancado: {
    label: "✅ PRONTO / LANÇADO",
    badge: "bg-emerald-500/25 text-emerald-200 border-emerald-400 font-extrabold shadow-[0_0_15px_-3px_rgba(16,185,129,0.7)]",
    icon: CheckCircle2,
    border: "border-emerald-500/70 shadow-[0_0_25px_-5px_rgba(16,185,129,0.3)]",
    cardBg: "from-emerald-950/30 to-card/60",
  },
  pausado: {
    label: "⏸️ PAUSADO",
    badge: "bg-zinc-500/25 text-zinc-300 border-zinc-500 font-bold",
    icon: AlertTriangle,
    border: "border-zinc-700",
    cardBg: "from-zinc-950/40 to-card/40",
  },
};

const PRIORIDADE_CONFIG: Record<AjustePrioridade, { label: string; badge: string; icon: any }> = {
  urgente: {
    label: "🔴 URGENTE",
    badge: "bg-red-500/20 text-red-300 border-red-500/40 animate-pulse shadow-[0_0_15px_-3px_rgba(239,68,68,0.5)]",
    icon: Flame,
  },
  alta: {
    label: "🟠 ALTA",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    icon: AlertCircle,
  },
  media: {
    label: "🟡 MÉDIA",
    badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    icon: Clock,
  },
  baixa: {
    label: "🟢 BAIXA",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: CheckCircle2,
  },
};

const STATUS_CONFIG: Record<AjusteStatus, { label: string; badge: string; icon: any }> = {
  pendente: {
    label: "⏳ Pendente",
    badge: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
    icon: Clock,
  },
  em_andamento: {
    label: "🛠️ Em Andamento",
    badge: "bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-[0_0_12px_-3px_rgba(56,189,248,0.4)]",
    icon: Wrench,
  },
  resolvido: {
    label: "✅ Resolvido",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    icon: CheckCircle2,
  },
};

function SaasProjectsPage() {
  const vendorSession = getVendorSession();
  const navigate = useNavigate();
  const isAdmin = !vendorSession;

  const [activeTab, setActiveTab] = useState<"both" | "projects" | "ajustes">("both");

  const [projects, setProjects] = useState<SaasProject[]>([]);
  const [ajustes, setAjustes] = useState<AjusteUrgente[]>([]);

  // Filtros Projetos
  const [searchProjects, setSearchProjects] = useState("");
  const [faseFilter, setFaseFilter] = useState<string>("all");

  // Filtros Ajustes
  const [searchAjustes, setSearchAjustes] = useState("");
  const [prioFilter, setPrioFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modais
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SaasProject | null>(null);

  const [ajusteModalOpen, setAjusteModalOpen] = useState(false);
  const [editingAjuste, setEditingAjuste] = useState<AjusteUrgente | null>(null);

  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [activeProjectForNotes, setActiveProjectForNotes] = useState<SaasProject | null>(null);

  const refreshData = () => {
    setProjects(loadLocalSaasProjects());
    setAjustes(loadLocalAjustesUrgentes());
  };

  useEffect(() => {
    refreshData();
    const handleUpdate = () => refreshData();
    window.addEventListener("multium-ht-saas-updated", handleUpdate);
    return () => window.removeEventListener("multium-ht-saas-updated", handleUpdate);
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (faseFilter !== "all" && p.fase !== faseFilter) return false;
      if (searchProjects.trim()) {
        const q = searchProjects.toLowerCase().trim();
        const hay = `${p.nome} ${p.devResponsavel ?? ""} ${p.nomeGrupo ?? ""} ${p.descricao ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, searchProjects, faseFilter]);

  const filteredAjustes = useMemo(() => {
    return ajustes.filter((a) => {
      if (prioFilter !== "all" && a.prioridade !== prioFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (searchAjustes.trim()) {
        const q = searchAjustes.toLowerCase().trim();
        const hay = `${a.titulo} ${a.saasNome ?? ""} ${a.solicitante ?? ""} ${a.devResponsavel ?? ""} ${a.descricao ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ajustes, searchAjustes, prioFilter, statusFilter]);

  const statsProjects = useMemo(() => {
    const total = projects.length;
    const dev = projects.filter((p) => p.fase === "desenvolvimento").length;
    const testes = projects.filter((p) => p.fase === "testes").length;
    const lancados = projects.filter((p) => p.fase === "lancado").length;
    return { total, dev, testes, lancados };
  }, [projects]);

  const statsAjustes = useMemo(() => {
    const total = ajustes.length;
    const urgentes = ajustes.filter((a) => a.prioridade === "urgente" && a.status !== "resolvido").length;
    const pendentes = ajustes.filter((a) => a.status === "pendente").length;
    const emAndamento = ajustes.filter((a) => a.status === "em_andamento").length;
    const resolvidos = ajustes.filter((a) => a.status === "resolvido").length;
    const abertos = pendentes + emAndamento;
    return { total, urgentes, pendentes, emAndamento, resolvidos, abertos };
  }, [ajustes]);

  if (!isAdmin) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-destructive/20 text-destructive">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Acesso Restrito a Administradores</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Apenas administradores do sistema têm permissão para acessar o painel de organização de SaaS em Construção e Ajustes Urgentes.
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

  const handleDeleteAjuste = (id: string, titulo: string) => {
    if (confirm(`Tem certeza que deseja excluir o ajuste "${titulo}"?`)) {
      const next = ajustes.filter((a) => a.id !== id);
      saveLocalAjustesUrgentes(next);
      toast.success("Ajuste urgente removido.");
    }
  };

  const handleCycleAjusteStatus = (id: string) => {
    const list = [...ajustes];
    const item = list.find((a) => a.id === id);
    if (!item) return;

    if (item.status === "pendente") item.status = "em_andamento";
    else if (item.status === "em_andamento") item.status = "resolvido";
    else item.status = "pendente";

    item.updated_at = new Date().toISOString();
    saveLocalAjustesUrgentes(list);
    toast.success(`Status atualizado para: ${STATUS_CONFIG[item.status].label}`);
  };

  return (
    <div className="px-6 md:px-10 py-8 space-y-8 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent font-bold">
            <Rocket className="h-4 w-4 text-accent" />
            High Ticket · Central de Desenvolvimento & Hotfixes
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1 text-foreground">
            SaaS em Construção & Ajustes Urgentes 🛠️
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão estratégica de novos produtos SaaS, roadmaps, links, diário de bordo e fila de ajustes de emergência.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setEditingAjuste(null);
              setAjusteModalOpen(true);
            }}
            className="bg-gradient-to-r from-red-500 to-amber-500 text-white font-bold h-11 px-4 shadow-lg shadow-red-500/20 hover:scale-105 transition-all gap-2"
          >
            <Flame className="h-4 w-4" />
            + Ajuste Urgente / Por Fora
          </Button>

          <Button
            onClick={() => {
              setEditingProject(null);
              setProjectModalOpen(true);
            }}
            className="bg-gradient-to-r from-accent to-blue-500 text-white font-bold h-11 px-4 shadow-lg shadow-accent/20 hover:scale-105 transition-all gap-2"
          >
            <Plus className="h-4 w-4" />
            + Novo SaaS
          </Button>
        </div>
      </div>

      {/* BANNER DESTACADO DE AJUSTES URGENTES (SEMPRE VISÍVEL NO TOPO) */}
      {statsAjustes.abertos > 0 && (
        <Card className="relative overflow-hidden border-red-500/40 bg-gradient-to-r from-red-500/15 via-amber-500/10 to-transparent backdrop-blur shadow-xl">
          <div className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0 shadow-[0_0_20px_-4px_rgba(239,68,68,0.6)]">
                <Flame className="h-6 w-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/40 font-bold uppercase text-[10px] tracking-wider animate-pulse">
                    🚨 Atenção Requerida
                  </Badge>
                  <span className="text-xs font-mono font-bold text-red-300">
                    {statsAjustes.abertos} {statsAjustes.abertos === 1 ? "ajuste pendente" : "ajustes pendentes / em andamento"}
                  </span>
                </div>
                <h3 className="text-base font-bold text-foreground mt-0.5">
                  Existem ajustes urgentes precisando de acompanhamento!
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("ajustes")}
                className="bg-red-500/20 text-red-200 border-red-500/40 hover:bg-red-500/30 font-bold h-9 px-4 text-xs gap-1.5"
              >
                <Flame className="h-3.5 w-3.5 text-red-400" />
                Focar nos Ajustes ({statsAjustes.abertos})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("both")}
                className="bg-background/60 text-foreground border-border/60 hover:bg-card font-semibold h-9 px-3 text-xs gap-1.5"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Visão Unificada
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* SELETOR DE MODO DE VISÃO / ABAS */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-xl h-12 bg-card/60 p-1 border border-border/50 rounded-2xl backdrop-blur">
          <TabsTrigger value="both" className="gap-2 text-xs font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-accent data-[state=active]:to-red-500 data-[state=active]:text-white">
            <LayoutGrid className="h-4 w-4" />
            ⚡ Visão Unificada (Tudo)
          </TabsTrigger>
          <TabsTrigger value="ajustes" className="gap-2 text-xs font-bold rounded-xl data-[state=active]:bg-red-500 data-[state=active]:text-white relative">
            <Flame className="h-4 w-4" />
            🚨 Ajustes Urgentes ({statsAjustes.abertos})
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-2 text-xs font-bold rounded-xl data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            <Rocket className="h-4 w-4" />
            Projetos SaaS ({projects.length})
          </TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/* MODO UNIFICADO ("both") */}
        {/* ============================================================== */}
        <TabsContent value="both" className="space-y-10 mt-6">
          {/* BLOCO 1: AJUSTES URGENTES */}
          <div className="space-y-4 rounded-3xl border border-red-500/30 bg-red-500/[0.03] p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-red-500/20 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 font-bold">
                  <Flame className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    Ajustes Urgentes & Por Fora
                    <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px] font-bold">
                      {statsAjustes.abertos} ativos
                    </Badge>
                  </h2>
                  <p className="text-xs text-muted-foreground">Emergências, chamados rápidos e tarefas fora do escopo.</p>
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  setEditingAjuste(null);
                  setAjusteModalOpen(true);
                }}
                className="bg-red-500 hover:bg-red-600 text-white font-bold h-9 gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Cadastrar Ajuste
              </Button>
            </div>

            {/* GRID DE AJUSTES */}
            {ajustes.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground italic border border-dashed border-red-500/20 rounded-2xl">
                Nenhum ajuste urgente cadastrado no momento.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {ajustes.map((a) => (
                  <AjusteCardItem
                    key={a.id}
                    ajuste={a}
                    onCycleStatus={handleCycleAjusteStatus}
                    onEdit={(item) => {
                      setEditingAjuste(item);
                      setAjusteModalOpen(true);
                    }}
                    onDelete={handleDeleteAjuste}
                  />
                ))}
              </div>
            )}
          </div>

          {/* BLOCO 2: PROJETOS SAAS */}
          <div className="space-y-4 rounded-3xl border border-accent/30 bg-accent/[0.03] p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-accent/20 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-accent/20 flex items-center justify-center text-accent font-bold">
                  <Rocket className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    Projetos SaaS em Construção
                    <Badge variant="outline" className="bg-accent/20 text-accent border-accent/40 text-[10px] font-bold">
                      {projects.length} projetos
                    </Badge>
                  </h2>
                  <p className="text-xs text-muted-foreground">Catálogo de plataformas SaaS, links, equipes DEV e diário de bordo.</p>
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  setEditingProject(null);
                  setProjectModalOpen(true);
                }}
                className="bg-accent text-accent-foreground font-bold h-9 gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Cadastrar SaaS
              </Button>
            </div>

            {/* GRID DE PROJETOS SAAS */}
            {projects.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground italic border border-dashed border-accent/20 rounded-2xl">
                Nenhum projeto SaaS em construção cadastrado.
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
                {projects.map((p) => (
                  <SaasProjectCardItem
                    key={p.id}
                    project={p}
                    onEdit={(proj) => {
                      setEditingProject(proj);
                      setProjectModalOpen(true);
                    }}
                    onDelete={handleDeleteProject}
                    onOpenNotes={(proj) => {
                      setActiveProjectForNotes(proj);
                      setNotesDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 1: APENAS PROJETOS SAAS */}
        {/* ============================================================== */}
        <TabsContent value="projects" className="space-y-6 mt-6">
          {/* METRICS KPIS */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-border/50 bg-card/40 backdrop-blur shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total de Projetos</div>
                  <div className="text-3xl font-black mt-1 text-foreground">{statsProjects.total}</div>
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
                  <div className="text-3xl font-black mt-1 text-sky-300">{statsProjects.dev}</div>
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
                  <div className="text-3xl font-black mt-1 text-violet-300">{statsProjects.testes}</div>
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
                  <div className="text-3xl font-black mt-1 text-emerald-300">{statsProjects.lancados}</div>
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
                value={searchProjects}
                onChange={(e) => setSearchProjects(e.target.value)}
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
                {searchProjects || faseFilter !== "all"
                  ? "Tente alterar os filtros ou o termo pesquisado."
                  : "Cadastre o primeiro projeto SaaS em construção clicando no botão acima."}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
              {filteredProjects.map((p) => (
                <SaasProjectCardItem
                  key={p.id}
                  project={p}
                  onEdit={(proj) => {
                    setEditingProject(proj);
                    setProjectModalOpen(true);
                  }}
                  onDelete={handleDeleteProject}
                  onOpenNotes={(proj) => {
                    setActiveProjectForNotes(proj);
                    setNotesDialogOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 2: APENAS AJUSTES URGENTES */}
        {/* ============================================================== */}
        <TabsContent value="ajustes" className="space-y-6 mt-6">
          {/* METRICS KPIS AJUSTES */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-red-500/40 bg-red-500/10 backdrop-blur shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-red-400">Urgentes / Abertos</div>
                  <div className="text-3xl font-black mt-1 text-red-300">{statsAjustes.urgentes}</div>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400">
                  <Flame className="h-5 w-5 animate-bounce" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-500/30 bg-amber-500/5 backdrop-blur shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-400">Pendentes</div>
                  <div className="text-3xl font-black mt-1 text-amber-300">{statsAjustes.pendentes}</div>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                  <Clock className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-sky-500/30 bg-sky-500/5 backdrop-blur shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-sky-400">Em Andamento</div>
                  <div className="text-3xl font-black mt-1 text-sky-300">{statsAjustes.emAndamento}</div>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-sky-500/20 flex items-center justify-center text-sky-400">
                  <Wrench className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/30 bg-emerald-500/5 backdrop-blur shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Resolvidos</div>
                  <div className="text-3xl font-black mt-1 text-emerald-300">{statsAjustes.resolvidos}</div>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CONTROLS BAR AJUSTES */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card/40 p-3 rounded-2xl border border-border/50 backdrop-blur">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchAjustes}
                onChange={(e) => setSearchAjustes(e.target.value)}
                placeholder="Buscar ajuste urgente por título, SaaS, solicitante ou DEV..."
                className="pl-10 h-10 bg-background/60 border-border/50 text-sm focus-visible:ring-red-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={prioFilter} onValueChange={setPrioFilter}>
                <SelectTrigger className="h-10 w-40 bg-background/60 text-xs">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Prioridades</SelectItem>
                  <SelectItem value="urgente">🔴 Urgentes</SelectItem>
                  <SelectItem value="alta">🟠 Altas</SelectItem>
                  <SelectItem value="media">🟡 Médias</SelectItem>
                  <SelectItem value="baixa">🟢 Baixas</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-40 bg-background/60 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="pendente">⏳ Pendente</SelectItem>
                  <SelectItem value="em_andamento">🛠️ Em Andamento</SelectItem>
                  <SelectItem value="resolvido">✅ Resolvido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* GRID DE AJUSTES URGENTES */}
          {filteredAjustes.length === 0 ? (
            <div className="text-center py-16 rounded-3xl border border-dashed border-border/60 bg-card/20">
              <Flame className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40 animate-pulse" />
              <h3 className="text-lg font-bold text-foreground">Nenhum ajuste urgente encontrado</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {searchAjustes || prioFilter !== "all" || statusFilter !== "all"
                  ? "Tente alterar os filtros de prioridade/status."
                  : "Cadastre um ajuste emergencial ou por fora clicando no botão acima."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAjustes.map((a) => (
                <AjusteCardItem
                  key={a.id}
                  ajuste={a}
                  onCycleStatus={handleCycleAjusteStatus}
                  onEdit={(item) => {
                    setEditingAjuste(item);
                    setAjusteModalOpen(true);
                  }}
                  onDelete={handleDeleteAjuste}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* DIALOG ADD/EDIT PROJETO SAAS */}
      <SaasProjectFormModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        initialData={editingProject}
        onSaved={() => {
          refreshData();
          setProjectModalOpen(false);
        }}
      />

      {/* DIALOG ADD/EDIT AJUSTE URGENTE */}
      <AjusteFormModal
        open={ajusteModalOpen}
        onOpenChange={setAjusteModalOpen}
        initialData={editingAjuste}
        projects={projects}
        onSaved={() => {
          refreshData();
          setAjusteModalOpen(false);
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

// COMPONENTE DE CARD SAAS PROJECT
function SaasProjectCardItem({
  project: p,
  onEdit,
  onDelete,
  onOpenNotes,
}: {
  project: SaasProject;
  onEdit: (p: SaasProject) => void;
  onDelete: (id: string, nome: string) => void;
  onOpenNotes: (p: SaasProject) => void;
}) {
  const cfg = FASE_CONFIG[p.fase] || FASE_CONFIG.planejamento;
  const FaseIcon = cfg.icon;
  const notes = loadLocalSaasNotes(p.id);

  return (
    <Card
      className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border ${cfg.border} bg-gradient-to-b ${cfg.cardBg} backdrop-blur transition-all duration-300 hover:border-accent/80 hover:shadow-2xl`}
    >
      <div>
        {/* CARD HEADER */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Badge variant="outline" className={`px-3 py-1 text-[10px] uppercase tracking-wider ${cfg.badge} flex items-center gap-1.5 w-fit`}>
                <FaseIcon className="h-3.5 w-3.5" />
                {cfg.label}
              </Badge>
              <h2 className="text-xl font-bold tracking-tight mt-2.5 text-foreground">
                {p.nome}
              </h2>
            </div>

            <div className="flex items-center gap-1 bg-background/60 p-1 rounded-xl border border-border/40">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-accent"
                title="Editar SaaS"
                onClick={() => onEdit(p)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Excluir"
                onClick={() => onDelete(p.id, p.nome)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* PROGRESS BAR */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] font-semibold text-muted-foreground">Progresso da Construção</span>
              <span className="font-mono font-bold text-accent text-sm">{p.progressoPct ?? 0}%</span>
            </div>
            <div className="h-2.5 w-full bg-border/40 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-accent via-blue-400 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
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
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Grupo do Projeto</div>
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

        {/* DIÁRIO DE BORDO EXPOSTO DIRETAMENTE NO CARD */}
        <div className="p-4 px-6 bg-zinc-950/70 border-b border-border/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
              <StickyNote className="h-3 w-3" />
              Diário de Bordo & Anotações DEV ({notes.length})
            </span>
            <button
              type="button"
              onClick={() => onOpenNotes(p)}
              className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1"
            >
              + Escrever
            </button>
          </div>

          {notes.length === 0 ? (
            <div className="text-[11px] text-muted-foreground/60 italic py-1">
              Nenhuma anotação registrada ainda. Clique em "+ Escrever" para adicionar a primeira.
            </div>
          ) : (
            <div className="space-y-1.5">
              {notes.slice(0, 2).map((n) => (
                <div key={n.id} className="text-xs bg-background/60 p-2.5 rounded-xl border border-border/40 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-foreground">{n.autor}</span>
                    <span className="text-muted-foreground font-mono">
                      {new Date(n.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground/90 line-clamp-2 leading-tight whitespace-pre-wrap">
                    {n.conteudo}
                  </p>
                </div>
              ))}
              {notes.length > 2 && (
                <button
                  type="button"
                  onClick={() => onOpenNotes(p)}
                  className="text-[10px] text-accent hover:underline font-semibold block text-right w-full pt-1"
                >
                  Ver todas as {notes.length} anotações do diário ↗
                </button>
              )}
            </div>
          )}
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
          onClick={() => onOpenNotes(p)}
          className="gap-2 h-9 border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent font-semibold shrink-0"
        >
          <StickyNote className="h-3.5 w-3.5" />
          Gerenciar Diário ({notes.length})
        </Button>
      </div>
    </Card>
  );
}

// COMPONENTE DE CARD AJUSTE URGENTE
function AjusteCardItem({
  ajuste: a,
  onCycleStatus,
  onEdit,
  onDelete,
}: {
  ajuste: AjusteUrgente;
  onCycleStatus: (id: string) => void;
  onEdit: (a: AjusteUrgente) => void;
  onDelete: (id: string, titulo: string) => void;
}) {
  const pConfig = PRIORIDADE_CONFIG[a.prioridade] || PRIORIDADE_CONFIG.media;
  const stConfig = STATUS_CONFIG[a.status] || STATUS_CONFIG.pendente;
  const PrioIcon = pConfig.icon;
  const StatusIcon = stConfig.icon;

  return (
    <Card
      className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border ${
        a.prioridade === "urgente" && a.status !== "resolvido"
          ? "border-red-500/50 bg-gradient-to-b from-red-500/[0.08] to-card/40"
          : "border-border/50 bg-card/40"
      } backdrop-blur transition-all duration-300 hover:border-accent/50 hover:shadow-lg`}
    >
      <div className="p-5 space-y-3">
        {/* BADGES ROW */}
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${pConfig.badge} flex items-center gap-1`}>
            <PrioIcon className="h-3 w-3" />
            {pConfig.label}
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onCycleStatus(a.id)}
            className={`h-7 px-2.5 text-[10px] font-bold rounded-lg ${stConfig.badge} hover:scale-105 transition-all gap-1`}
            title="Clique para alternar status (Pendente -> Em Andamento -> Resolvido)"
          >
            <StatusIcon className="h-3 w-3" />
            {stConfig.label}
          </Button>
        </div>

        {/* TÍTULO */}
        <h3 className="text-base font-bold text-foreground leading-snug">
          {a.titulo}
        </h3>

        {/* SAAS TAG */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/30">
            {a.saasNome || "Ajuste Geral / Plataforma"}
          </span>
          {a.prazo && (
            <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1 bg-background/50 px-2 py-0.5 rounded border border-border/40">
              <Calendar className="h-3 w-3 text-amber-400" />
              Prazo: {a.prazo}
            </span>
          )}
        </div>

        {/* DESCRIÇÃO */}
        {a.descricao && (
          <p className="text-xs text-muted-foreground/90 line-clamp-3 leading-relaxed bg-background/40 p-2.5 rounded-lg border border-border/30">
            {a.descricao}
          </p>
        )}

        {/* METADATA (SOLICITANTE & DEV) */}
        <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-[11px]">
          <div className="truncate">
            <span className="text-muted-foreground font-semibold">Solicitante: </span>
            <span className="text-foreground font-medium">{a.solicitante || "Não informado"}</span>
          </div>
          <div className="truncate text-right">
            <span className="text-muted-foreground font-semibold">DEV: </span>
            <span className="text-sky-300 font-medium">{a.devResponsavel || "Antigravity"}</span>
          </div>
        </div>
      </div>

      {/* CARD FOOTER */}
      <div className="p-3 px-5 bg-card/60 border-t border-border/40 flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">
          {new Date(a.created_at).toLocaleDateString("pt-BR")}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-accent"
            title="Editar Ajuste"
            onClick={() => onEdit(a)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="Excluir"
            onClick={() => onDelete(a.id, a.titulo)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
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

function AjusteFormModal({
  open,
  onOpenChange,
  initialData,
  projects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialData: AjusteUrgente | null;
  projects: SaasProject[];
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [saasId, setSaasId] = useState<string>("geral");
  const [solicitante, setSolicitante] = useState("");
  const [devResponsavel, setDevResponsavel] = useState("Antigravity DEV");
  const [prioridade, setPrioridade] = useState<AjustePrioridade>("urgente");
  const [status, setStatus] = useState<AjusteStatus>("pendente");
  const [prazo, setPrazo] = useState("");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (initialData) {
      setTitulo(initialData.titulo || "");
      setSaasId(initialData.saasId || "geral");
      setSolicitante(initialData.solicitante || "");
      setDevResponsavel(initialData.devResponsavel || "Antigravity DEV");
      setPrioridade(initialData.prioridade || "urgente");
      setStatus(initialData.status || "pendente");
      setPrazo(initialData.prazo || "");
      setDescricao(initialData.descricao || "");
    } else {
      setTitulo("");
      setSaasId("geral");
      setSolicitante("");
      setDevResponsavel("Antigravity DEV");
      setPrioridade("urgente");
      setStatus("pendente");
      setPrazo("Hoje / Imediato");
      setDescricao("");
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error("Preencha o título do ajuste.");
      return;
    }

    const list = loadLocalAjustesUrgentes();
    const now = new Date().toISOString();

    const proj = projects.find((p) => p.id === saasId);
    const saasNome = saasId === "geral" ? "Ajuste Geral / Plataforma" : (proj?.nome || "SaaS");

    let updatedList: AjusteUrgente[];
    if (initialData) {
      updatedList = list.map((a) =>
        a.id === initialData.id
          ? {
              ...a,
              titulo: titulo.trim(),
              saasId: saasId === "geral" ? null : saasId,
              saasNome,
              solicitante: solicitante.trim() || null,
              devResponsavel: devResponsavel.trim() || null,
              prioridade,
              status,
              prazo: prazo.trim() || null,
              descricao: descricao.trim() || null,
              updated_at: now,
            }
          : a,
      );
      toast.success("Ajuste urgente atualizado!");
    } else {
      const newAjuste: AjusteUrgente = {
        id: `ajuste-${crypto.randomUUID()}`,
        titulo: titulo.trim(),
        saasId: saasId === "geral" ? null : saasId,
        saasNome,
        solicitante: solicitante.trim() || null,
        devResponsavel: devResponsavel.trim() || null,
        prioridade,
        status,
        prazo: prazo.trim() || null,
        descricao: descricao.trim() || null,
        created_at: now,
        updated_at: now,
      };
      updatedList = [newAjuste, ...list];
      toast.success("Ajuste urgente registrado!");
    }

    saveLocalAjustesUrgentes(updatedList);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-border/60 bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Flame className="h-5 w-5 text-red-500 animate-pulse" />
            {initialData ? "Editar Ajuste Urgente / Por Fora" : "Novo Ajuste Urgente / Por Fora"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Título do Ajuste *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Corrigir bug no checkout Cakto, Ajustar disparo no chat..."
              required
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">SaaS Relacionado</Label>
              <Select value={saasId} onValueChange={setSaasId}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">🌐 Geral / Plataforma</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      🚀 {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as AjustePrioridade)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgente">🔴 Urgente / Crítico</SelectItem>
                  <SelectItem value="alta">🟠 Alta</SelectItem>
                  <SelectItem value="media">🟡 Média</SelectItem>
                  <SelectItem value="baixa">🟢 Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Status Inicial</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AjusteStatus)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">⏳ Pendente</SelectItem>
                  <SelectItem value="em_andamento">🛠️ Em Andamento</SelectItem>
                  <SelectItem value="resolvido">✅ Resolvido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Prazo / Limite</Label>
              <Input
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                placeholder="Ex: Hoje, Amanhã 18h, Imediato"
                className="h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Solicitante / Origem</Label>
              <Input
                value={solicitante}
                onChange={(e) => setSolicitante(e.target.value)}
                placeholder="Ex: Cliente, Closer Victor, SDR Suellen"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">DEV Responsável</Label>
              <Input
                value={devResponsavel}
                onChange={(e) => setDevResponsavel(e.target.value)}
                placeholder="Ex: Antigravity DEV, Victor"
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Descrição do Ajuste / Instruções</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o problema relatado, causa provável ou instruções de correção..."
              rows={3}
              className="resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-red-500 hover:bg-red-600 text-white font-bold">
              {initialData ? "Salvar Alterações" : "Registrar Ajuste Urgente"}
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
