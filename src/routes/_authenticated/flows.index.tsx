import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Workflow, Plus, Trash2, Power, PowerOff, Pencil,
  Copy, Upload, Download, ClipboardCopy, FileJson, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listFlows, createFlow, deleteFlow, saveFlow,
  duplicateFlow, exportFlow, importFlow,
} from "@/lib/flow-engine.functions";
import { importZapVoiceBackup } from "@/lib/zapvoice-import.functions";
import { useWorkspace } from "@/lib/workspace-context";

export const Route = createFileRoute("/_authenticated/flows/")({
  component: FlowsListPage,
});

function FlowsListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { workspace, workspaces } = useWorkspace();
  const listFn = useServerFn(listFlows);
  const createFn = useServerFn(createFlow);
  const deleteFlowFn = useServerFn(deleteFlow);
  const saveFn = useServerFn(saveFlow);
  const duplicateFn = useServerFn(duplicateFlow);
  const exportFn = useServerFn(exportFlow);
  const importFn = useServerFn(importFlow);
  const importZvFn = useServerFn(importZapVoiceBackup);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [op, setOp] = useState<string>(workspace.id === "all" ? "" : workspace.id);
  const [folder, setFolder] = useState<string>("");

  // Import
  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importName, setImportName] = useState("");
  const [importOp, setImportOp] = useState<string>(workspace.id === "all" ? "" : workspace.id);

  // ZapVoice import
  const [zvOpen, setZvOpen] = useState(false);
  const [zvOp, setZvOp] = useState<string>(workspace.id === "all" ? "" : workspace.id);
  const [zvReplace, setZvReplace] = useState(false);
  const [zvFile, setZvFile] = useState<File | null>(null);
  const [zvSummary, setZvSummary] = useState<any>(null);

  // Export
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCode, setExportCode] = useState("");
  const [exportFlowName, setExportFlowName] = useState("");

  const { data: flows = [] } = useQuery({
    queryKey: ["wa-flows"],
    queryFn: () => listFn(),
  });

  const createMut = useMutation({
    mutationFn: (v: { nome: string; operacao_id: string | null; folder: string | null }) => createFn({ data: v }),
    onSuccess: (r: any) => {
      toast.success("Fluxo criado");
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
      setOpen(false);
      setName("");
      setFolder("");
      navigate({ to: "/flows/$flowId", params: { flowId: r.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar fluxo"),
  });

  const moveFolderMut = useMutation({
    mutationFn: (v: { id: string; folder: string | null }) => saveFn({ data: v }),
    onSuccess: () => {
      toast.success("Pasta atualizada");
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFlowFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Fluxo removido");
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => saveFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-flows"] }),
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => duplicateFn({ data: { id } }),
    onSuccess: (r: any) => {
      toast.success(`Duplicado como "${r.nome}"`);
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao duplicar"),
  });

  const exportMut = useMutation({
    mutationFn: (id: string) => exportFn({ data: { id } }),
    onSuccess: (r: any) => {
      setExportCode(r.code);
      setExportFlowName(r.nome);
      setExportOpen(true);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao exportar"),
  });

  const importMut = useMutation({
    mutationFn: (v: { code: string; operacao_id: string | null; nome: string | null }) =>
      importFn({ data: v }),
    onSuccess: (r: any) => {
      toast.success(`Fluxo importado como "${r.nome}"`);
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
      setImportOpen(false);
      setImportCode("");
      setImportName("");
      navigate({ to: "/flows/$flowId", params: { flowId: r.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao importar"),
  });

  const [zvProgress, setZvProgress] = useState<string>("");

  async function runZvImport() {
    if (!zvFile) return toast.error("Selecione o arquivo .json");
    let parsed: any;
    try {
      parsed = JSON.parse(await zvFile.text());
    } catch (e: any) {
      return toast.error("JSON inválido: " + (e?.message ?? e));
    }
    if (!Array.isArray(parsed?.funnels)) return toast.error("JSON sem 'funnels[]'");

    setZvSummary(null);
    const allIds: string[] = parsed.funnels.map((f: any) => String(f?.id)).filter(Boolean);
    const total = allIds.length;
    // chunk pra evitar timeout do worker (cada chunk processa N funis com upload de mídia)
    const CHUNK = 25;
    const acc: any = { funnels: 0, steps: 0, uploads: 0, errors: [] };

    const t = toast.loading(`Importando 0 / ${total} funis…`);
    try {
      for (let i = 0; i < allIds.length; i += CHUNK) {
        const slice = allIds.slice(i, i + CHUNK);
        const chunkIdx = Math.floor(i / CHUNK);
        setZvProgress(`${i} / ${total}`);
        toast.loading(`Importando ${i} / ${total} funis…`, { id: t });
        const r: any = await importZvFn({
          data: {
            backup: parsed,
            operacao_id: zvOp || null,
            // só apaga existentes no PRIMEIRO chunk
            replace: zvReplace && chunkIdx === 0,
            funnelIds: slice,
          },
        });
        acc.funnels += r?.funnels ?? 0;
        acc.steps += r?.steps ?? 0;
        acc.uploads += r?.uploads ?? 0;
        if (Array.isArray(r?.errors)) acc.errors.push(...r.errors);
      }
      setZvSummary(acc);
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
      toast.success(`Importado: ${acc.funnels} funis · ${acc.steps} etapas · ${acc.uploads} arquivos`, { id: t });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao importar ZapVoice", { id: t });
    } finally {
      setZvProgress("");
    }
  }


  const filtered = (flows as any[]).filter((f) =>
    workspace.id === "all" ? true : f.operacao_id === workspace.id
  );

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportCode);
      toast.success("Código copiado!");
    } catch {
      toast.error("Não foi possível copiar — selecione e copie manualmente.");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Workflow className="h-6 w-6 text-emerald-500" /> Fluxos
          </h1>
          <p className="text-sm text-muted-foreground">
            Crie automações conectando blocos visuais. Disparadas por gatilhos (palavra-chave, nova conversa, etc).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setZvSummary(null); setZvOpen(true); }}>
            <FileJson className="h-4 w-4 mr-2" /> Importar ZapVoice
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Importar código
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
                <Plus className="h-4 w-4 mr-2" /> Novo fluxo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo fluxo</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Boas-vindas" />
                </div>
                <div className="space-y-1.5">
                  <Label>Operação (opcional)</Label>
                  <Select value={op} onValueChange={setOp}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {workspaces.filter((o) => o.id !== "all").map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!name.trim() || createMut.isPending}
                  onClick={() => createMut.mutate({ nome: name.trim(), operacao_id: op || null })}
                >Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          Nenhum fluxo criado ainda. Clique em <strong>Novo fluxo</strong> ou <strong>Importar código</strong>.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f: any) => {
            const triggers = f.wa_flow_triggers ?? [];
            return (
              <div key={f.id} className="border border-border rounded-lg p-4 bg-card hover:border-emerald-500/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{f.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(f.nodes?.length ?? 0)} nós · {(f.edges?.length ?? 0)} conexões
                    </p>
                  </div>
                  <Badge className={f.ativo ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                    {f.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {triggers.length === 0 && <Badge variant="outline" className="text-xs">Sem gatilho</Badge>}
                  {triggers.map((t: any) => (
                    <Badge key={t.id} variant="outline" className="text-xs">
                      {t.tipo === "keyword" ? `🔑 ${t.valor}` : t.tipo === "new_conversation" ? "🆕 Nova conversa" : t.tipo === "any_message" ? "💬 Qualquer msg" : t.tipo === "new_lead" ? "👤 Novo lead" : "✋ Manual"}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/flows/$flowId" params={{ flowId: f.id }}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                    </Link>
                  </Button>
                  <Button
                    size="sm" variant="outline" title="Duplicar"
                    disabled={dupMut.isPending}
                    onClick={() => dupMut.mutate(f.id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm" variant="outline" title="Exportar código"
                    disabled={exportMut.isPending}
                    onClick={() => exportMut.mutate(f.id)}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm" variant="outline" title={f.ativo ? "Desativar" : "Ativar"}
                    onClick={() => toggleMut.mutate({ id: f.id, ativo: !f.ativo })}
                  >
                    {f.ativo ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm" variant="outline" title="Remover"
                    onClick={() => { if (confirm("Remover fluxo?")) delMut.mutate(f.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Importar fluxo</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Código do fluxo</Label>
              <Textarea
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                placeholder="Cole aqui o código que começa com FLOWV1:..."
                rows={6}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nome (opcional)</Label>
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Deixe em branco para usar o nome original"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Operação</Label>
              <Select value={importOp} onValueChange={setImportOp}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {workspaces.filter((o) => o.id !== "all").map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Se já existir um fluxo com esse nome, será criado como "cópia 1", "cópia 2"... automaticamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button
              disabled={!importCode.trim() || importMut.isPending}
              onClick={() => importMut.mutate({
                code: importCode.trim(),
                operacao_id: importOp || null,
                nome: importName.trim() || null,
              })}
            >
              <Upload className="h-4 w-4 mr-2" /> Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ZapVoice Import Dialog */}
      <Dialog open={zvOpen} onOpenChange={setZvOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-emerald-500" /> Importar backup do ZapVoice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Arquivo .json do ZapVoice</Label>
              <Input
                type="file"
                accept="application/json,.json"
                onChange={(e) => setZvFile(e.target.files?.[0] ?? null)}
              />
              {zvFile && (
                <p className="text-[11px] text-muted-foreground">
                  {zvFile.name} · {(zvFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Operação (opcional)</Label>
              <Select value={zvOp} onValueChange={setZvOp}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {workspaces.filter((o) => o.id !== "all").map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={zvReplace} onCheckedChange={(v) => setZvReplace(!!v)} />
              Substituir importações anteriores do ZapVoice (apaga fluxos com prefixo [ZV])
            </label>
            <p className="text-xs text-muted-foreground">
              Cada funil vira um fluxo com gatilho manual. Mensagens viram nós de texto, mídias são enviadas para o Storage e linkadas no nó correspondente.
            </p>

            {zvSummary && (
              <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-md p-3 text-sm space-y-1">
                <div>✅ <strong>{zvSummary.funnels}</strong> funis · <strong>{zvSummary.steps}</strong> etapas · <strong>{zvSummary.uploads}</strong> arquivos</div>
                {zvSummary.errors?.length > 0 && (
                  <details className="text-xs text-amber-600 mt-1">
                    <summary>{zvSummary.errors.length} erro(s) — clique para ver</summary>
                    <ul className="mt-1 max-h-40 overflow-auto space-y-0.5 pl-3 list-disc">
                      {zvSummary.errors.slice(0, 30).map((e: any, i: number) => (
                        <li key={i}>{e.funnel ? `[${e.funnel}] ` : ""}{e.item ? `${e.item}: ` : ""}{e.message}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZvOpen(false)}>Fechar</Button>
            <Button disabled={!zvFile || !!zvProgress} onClick={runZvImport}>
              {zvProgress
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando {zvProgress}…</>
                : <><Upload className="h-4 w-4 mr-2" /> Importar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Exportar "{exportFlowName}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Copie o código abaixo. Ele pode ser importado em outra operação ou conta.
            </p>
            <Textarea
              readOnly value={exportCode}
              rows={8} className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Fechar</Button>
            <Button onClick={copyExport}>
              <ClipboardCopy className="h-4 w-4 mr-2" /> Copiar código
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
