import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

function SopsPage() {
  const qc = useQueryClient();
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
  const initialRef = useRef<string>("");

  // Agrupar por categoria
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

  // Selecionar primeiro automaticamente
  useEffect(() => {
    if (!selectedId && sops.length > 0) setSelectedId(sops[0].id);
  }, [sops, selectedId]);

  // Carregar rascunho ao trocar seleção
  useEffect(() => {
    const found = sops.find((s) => s.id === selectedId) ?? null;
    setDraft(found ? { ...found } : null);
    initialRef.current = found ? JSON.stringify(found) : "";
  }, [selectedId, sops]);

  const dirty = draft && JSON.stringify(draft) !== initialRef.current;

  async function createSop(categoria = "Geral") {
    const { data, error } = await supabase
      .from("sops" as any)
      .insert({ categoria, titulo: "Novo processo", conteudo: "" } as any)
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success("Processo criado");
    await qc.invalidateQueries({ queryKey: ["sops"] });
    setSelectedId((data as any).id);
  }

  async function createCategory() {
    const nome = window.prompt("Nome da função / categoria:");
    if (!nome?.trim()) return;
    await createSop(nome.trim());
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

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* Lista lateral */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card/30">
        <div className="border-b border-border p-3 space-y-2">
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
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={createCategory}>
              <FolderPlus className="mr-1 h-4 w-4" /> Função
            </Button>
            <Button size="sm" className="flex-1" onClick={() => createSop(draft?.categoria || "Geral")}>
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
              Nenhum processo ainda. Crie o primeiro!
            </div>
          )}
          {grouped.map(([cat, items]) => (
            <div key={cat} className="mb-3">
              <div className="px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {cat}
              </div>
              <div className="space-y-1">
                {items.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={[
                      "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      selectedId === s.id
                        ? "bg-accent/15 text-accent"
                        : "hover:bg-accent/5 text-foreground/80",
                    ].join(" ")}
                  >
                    <FileText className="h-4 w-4 shrink-0 opacity-70" />
                    <span className="truncate flex-1">{s.titulo || "Sem título"}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {!draft ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Selecione um processo na lateral ou crie um novo.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border bg-card/30 p-3">
              <Input
                value={draft.emoji ?? ""}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value.slice(0, 2) })}
                placeholder="📘"
                className="w-16 text-center text-lg"
              />
              <Input
                value={draft.categoria}
                onChange={(e) => setDraft({ ...draft, categoria: e.target.value })}
                placeholder="Função / categoria"
                className="w-56"
              />
              <Input
                value={draft.titulo}
                onChange={(e) => setDraft({ ...draft, titulo: e.target.value })}
                placeholder="Título do processo"
                className="flex-1 font-semibold"
              />
              <Button
                onClick={saveDraft}
                disabled={!dirty || saving}
                className="shrink-0"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeSop(draft.id)}
                title="Excluir"
              >
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
    </div>
  );
}
