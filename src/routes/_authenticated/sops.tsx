import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BookOpenText,
  Plus,
  Search,
  Trash2,
  Save,
  FolderPlus,
  FileText,
  Loader2,
  Sparkles,
  Folder,
  ChevronRight,
  ChevronDown,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { improveSopText } from "@/lib/sops-ai.functions";

export const Route = createFileRoute("/_authenticated/sops")({
  component: SopsPage,
});

type Sop = {
  id: string;
  categoria: string;
  titulo: string;
  conteudo: string;
  emoji: string | null;
  ordem: number;
  updated_at: string;
};

const EMOJIS = ["📘", "📗", "📕", "📙", "📒", "🎯", "🚀", "⚡", "💡", "🔧", "📊", "🛒", "💰", "🤝", "📞", "✅"];

function SopsPage() {
  const qc = useQueryClient();
  const improveFn = useServerFn(improveSopText);

  const { data: sops = [], isLoading } = useQuery({
    queryKey: ["sops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sops" as any)
        .select("*")
        .order("categoria", { ascending: true })
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Sop[];
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Sop | null>(null);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const initialRef = useRef<string>("");

  // Dialogs
  const [folderDlg, setFolderDlg] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderEmoji, setFolderEmoji] = useState("📁");

  const [processDlg, setProcessDlg] = useState(false);
  const [processTitle, setProcessTitle] = useState("");
  const [processCat, setProcessCat] = useState("");
  const [processEmoji, setProcessEmoji] = useState("📘");

  const [aiDlg, setAiDlg] = useState(false);
  const [aiInstr, setAiInstr] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    sops.forEach((s) => set.add(s.categoria || "Geral"));
    return Array.from(set).sort();
  }, [sops]);

  const grouped = useMemo(() => {
    const filt = sops.filter((s) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.titulo.toLowerCase().includes(q) ||
        s.categoria.toLowerCase().includes(q) ||
        s.conteudo.toLowerCase().includes(q)
      );
    });
    const map = new Map<string, Sop[]>();
    for (const s of filt) {
      const k = s.categoria || "Geral";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sops, search]);

  useEffect(() => {
    if (!selectedId && sops.length > 0) setSelectedId(sops[0].id);
  }, [sops, selectedId]);

  useEffect(() => {
    const found = sops.find((s) => s.id === selectedId) ?? null;
    setDraft(found ? { ...found } : null);
    initialRef.current = found ? JSON.stringify(found) : "";
  }, [selectedId, sops]);

  const dirty = !!draft && JSON.stringify(draft) !== initialRef.current;

  async function createProcess() {
    const titulo = processTitle.trim() || "Novo processo";
    const categoria = (processCat.trim() || "Geral");
    const { data, error } = await supabase
      .from("sops" as any)
      .insert({ titulo, categoria, conteudo: "", emoji: processEmoji } as any)
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success("Processo criado");
    await qc.invalidateQueries({ queryKey: ["sops"] });
    setSelectedId((data as any).id);
    setProcessDlg(false);
    setProcessTitle("");
    setProcessCat("");
    setProcessEmoji("📘");
  }

  async function createFolder() {
    const nome = folderName.trim();
    if (!nome) return toast.error("Dá um nome pra pasta");
    const { error } = await supabase
      .from("sops" as any)
      .insert({
        titulo: "Processo inicial",
        categoria: nome,
        conteudo: `# ${nome}\n\nComece a documentar os processos desta pasta aqui.`,
        emoji: folderEmoji,
      } as any);
    if (error) return toast.error(error.message);
    toast.success(`Pasta "${nome}" criada`);
    await qc.invalidateQueries({ queryKey: ["sops"] });
    setFolderDlg(false);
    setFolderName("");
    setFolderEmoji("📁");
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    const { error } = await supabase
      .from("sops" as any)
      .update({
        categoria: draft.categoria || "Geral",
        titulo: draft.titulo || "Sem título",
        conteudo: draft.conteudo ?? "",
        emoji: draft.emoji,
      } as any)
      .eq("id", draft.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    initialRef.current = JSON.stringify(draft);
    qc.invalidateQueries({ queryKey: ["sops"] });
  }

  async function removeSop(id: string) {
    if (!window.confirm("Excluir este processo?")) return;
    const { error } = await supabase.from("sops" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    if (selectedId === id) setSelectedId(null);
    qc.invalidateQueries({ queryKey: ["sops"] });
  }

  async function runAiImprove() {
    if (!draft) return;
    if (!draft.conteudo.trim() && !aiInstr.trim()) {
      return toast.error("Escreve alguma coisa primeiro pra IA melhorar");
    }
    setAiLoading(true);
    try {
      const res: any = await improveFn({
        data: {
          titulo: draft.titulo,
          categoria: draft.categoria,
          conteudo: draft.conteudo,
          instrucao: aiInstr,
        },
      });
      setDraft({ ...draft, conteudo: res.conteudo });
      toast.success("Processo melhorado pela IA");
      setAiDlg(false);
      setAiInstr("");
    } catch (e: any) {
      toast.error(e?.message || "Falha na IA");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* Lista lateral */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card/30">
        <div className="border-b border-border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpenText className="h-5 w-5 text-accent" />
            <div className="font-semibold">SOPs / Processos</div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFolderDlg(true)}
              className="border-accent/30 hover:bg-accent/10"
            >
              <FolderPlus className="mr-1 h-4 w-4" /> Pasta
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setProcessCat(draft?.categoria || categorias[0] || "");
                setProcessDlg(true);
              }}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Plus className="mr-1 h-4 w-4" /> Processo
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-fancy p-2">
          {isLoading && (
            <div className="flex items-center justify-center p-6 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
            </div>
          )}
          {!isLoading && grouped.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum processo ainda. Crie sua primeira pasta!
            </div>
          )}
          {grouped.map(([cat, items]) => {
            const isCollapsed = collapsed[cat];
            return (
              <div key={cat} className="mb-2">
                <button
                  onClick={() => setCollapsed((p) => ({ ...p, [cat]: !p[cat] }))}
                  className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/5"
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  <Folder className="h-3.5 w-3.5" />
                  <span className="truncate">{cat}</span>
                  <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] normal-case">{items.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-border/50 pl-2">
                    {items.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedId(s.id)}
                        className={[
                          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          selectedId === s.id
                            ? "bg-accent/15 text-accent"
                            : "hover:bg-accent/5 text-foreground/80",
                        ].join(" ")}
                      >
                        <span className="text-base leading-none">{s.emoji || "📄"}</span>
                        <span className="truncate flex-1">{s.titulo || "Sem título"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Editor */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {!draft ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <BookOpenText className="h-12 w-12 opacity-30" />
            <div>Selecione um processo na lateral ou crie um novo.</div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border bg-card/30 p-3">
              <Input
                value={draft.emoji ?? ""}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value.slice(0, 2) })}
                placeholder="📘"
                className="w-14 text-center text-lg"
              />
              <Input
                value={draft.categoria}
                onChange={(e) => setDraft({ ...draft, categoria: e.target.value })}
                placeholder="Pasta / categoria"
                className="w-48"
              />
              <Input
                value={draft.titulo}
                onChange={(e) => setDraft({ ...draft, titulo: e.target.value })}
                placeholder="Título do processo"
                className="flex-1 font-semibold"
              />
              <Button
                variant="outline"
                onClick={() => setAiDlg(true)}
                className="shrink-0 border-purple-500/40 bg-purple-500/5 text-purple-300 hover:bg-purple-500/15 hover:text-purple-200"
              >
                <Sparkles className="mr-2 h-4 w-4" /> Melhorar com IA
              </Button>
              <Button onClick={saveDraft} disabled={!dirty || saving} className="shrink-0">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
              <Button variant="ghost" size="icon" onClick={() => removeSop(draft.id)} title="Excluir">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-fancy p-6">
              <Textarea
                value={draft.conteudo}
                onChange={(e) => setDraft({ ...draft, conteudo: e.target.value })}
                placeholder={`# Visão geral\n\nDescreva o processo passo a passo...\n\n## Passo 1\n...\n\n## Passo 2\n...`}
                className="min-h-[60vh] resize-none border-border bg-card/30 font-mono text-sm leading-relaxed"
              />
              <div className="mt-2 text-xs text-muted-foreground">
                Aceita Markdown. Última atualização: {new Date(draft.updated_at).toLocaleString("pt-BR")}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Dialog: Nova Pasta */}
      <Dialog open={folderDlg} onOpenChange={setFolderDlg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-accent" /> Nova pasta
            </DialogTitle>
            <DialogDescription>
              Organiza seus processos por função, departamento ou área da operação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Ícone</Label>
              <div className="flex flex-wrap gap-1">
                {["📁", "📂", "🎯", "💼", "🚀", "⚡", "💰", "🤝", "📞", "🛒", "🔧", "📊"].map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setFolderEmoji(e)}
                    className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition ${
                      folderEmoji === e
                        ? "border-accent bg-accent/15"
                        : "border-border hover:bg-accent/5"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-name">Nome da pasta</Label>
              <Input
                id="folder-name"
                autoFocus
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Ex: Vendas, Atendimento, Onboarding..."
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDlg(false)}>
              Cancelar
            </Button>
            <Button onClick={createFolder} disabled={!folderName.trim()}>
              <FolderPlus className="mr-2 h-4 w-4" /> Criar pasta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Novo Processo */}
      <Dialog open={processDlg} onOpenChange={setProcessDlg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-accent" /> Novo processo
            </DialogTitle>
            <DialogDescription>Documente um novo SOP da operação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Ícone</Label>
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setProcessEmoji(e)}
                    className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition ${
                      processEmoji === e
                        ? "border-accent bg-accent/15"
                        : "border-border hover:bg-accent/5"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-cat">Pasta</Label>
              <Input
                id="p-cat"
                list="cat-list"
                value={processCat}
                onChange={(e) => setProcessCat(e.target.value)}
                placeholder="Selecione ou digite uma pasta"
              />
              <datalist id="cat-list">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-title">Título do processo</Label>
              <Input
                id="p-title"
                autoFocus
                value={processTitle}
                onChange={(e) => setProcessTitle(e.target.value)}
                placeholder="Ex: Como qualificar um lead no X1"
                onKeyDown={(e) => e.key === "Enter" && createProcess()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessDlg(false)}>
              Cancelar
            </Button>
            <Button onClick={createProcess}>
              <Plus className="mr-2 h-4 w-4" /> Criar processo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Melhorar com IA */}
      <Dialog open={aiDlg} onOpenChange={(o) => !aiLoading && setAiDlg(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" /> Melhorar com IA
            </DialogTitle>
            <DialogDescription>
              A IA vai reescrever o seu texto deixando mais claro e organizado, mantendo a sua essência.
              Não inventa nada que não esteja no texto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="mb-1 font-semibold text-foreground">Texto atual ({(draft?.conteudo || "").length} caracteres)</div>
              <div className="line-clamp-3 whitespace-pre-wrap">
                {draft?.conteudo?.slice(0, 240) || "(vazio)"}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-instr">Instrução extra (opcional)</Label>
              <Textarea
                id="ai-instr"
                value={aiInstr}
                onChange={(e) => setAiInstr(e.target.value)}
                placeholder="Ex: Deixa mais curto, foca nos passos práticos, adiciona uma checklist no final..."
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDlg(false)} disabled={aiLoading}>
              Cancelar
            </Button>
            <Button onClick={runAiImprove} disabled={aiLoading} className="bg-purple-600 hover:bg-purple-500">
              {aiLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Melhorando...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" /> Melhorar agora
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
