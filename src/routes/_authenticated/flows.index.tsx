import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    const allowedOps = new Set(workspaces.filter((o) => o.id !== "all").map((o) => o.id));
    const preferred = workspace.id !== "all" ? workspace.id : "";
    if (preferred && (!op || !allowedOps.has(op))) setOp(preferred);
    if (preferred && (!importOp || !allowedOps.has(importOp))) setImportOp(preferred);
    if (preferred && (!zvOp || !allowedOps.has(zvOp))) setZvOp(preferred);
  }, [workspace.id, workspaces, op, importOp, zvOp]);

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
    const t = toast.loading("Lendo arquivo…");
    setZvProgress("lendo");
    let parsed: any;
    try {
      const raw = await zvFile.text();
      parsed = JSON.parse(raw);
    } catch (e: any) {
      console.error("[zv-import] parse fail", e);
      setZvProgress("");
      return toast.error("JSON inválido: " + (e?.message ?? e), { id: t });
    }
    if (!Array.isArray(parsed?.funnels)) {
      setZvProgress("");
      return toast.error("JSON sem 'funnels[]'", { id: t });
    }

    setZvSummary(null);
    const allFunnels: any[] = parsed.funnels;
    const total = allFunnels.length;
    // Reduzido: cada request carrega o backup enxuto só dos funis do chunk (mídias base64 são pesadas)
    const CHUNK = 3;
    const acc: any = { funnels: 0, steps: 0, uploads: 0, errors: [] };

    // Index helpers para montar backup slim por chunk
    const byId = (arr: any) => {
      const m = new Map<string, any>();
      if (Array.isArray(arr)) for (const it of arr) if (it?.id) m.set(String(it.id), it);
      return m;
    };
    const messagesIdx = byId(parsed.messages);
    const audiosIdx = byId(parsed.audios);
    const mediasIdx = byId(parsed.medias);
    const docsIdx = byId(parsed.docs);
    const objectsIdx = byId(parsed.objectsList);

    toast.loading(`Importando 0 / ${total} funis…`, { id: t });
    try {
      for (let i = 0; i < allFunnels.length; i += CHUNK) {
        const chunkFunnels = allFunnels.slice(i, i + CHUNK);
        const chunkIdx = Math.floor(i / CHUNK);
        setZvProgress(`${i} / ${total}`);
        toast.loading(`Importando ${i} / ${total} funis…`, { id: t });

        // Coleta apenas os itemIds referenciados pelos funis deste chunk
        const itemIds = new Set<string>();
        for (const f of chunkFunnels) {
          const seq = Array.isArray(f?.itemsSequence) ? f.itemsSequence : [];
          for (const s of seq) if (s?.itemId) itemIds.add(String(s.itemId));
        }
        const pick = (idx: Map<string, any>) => {
          const out: any[] = [];
          for (const id of itemIds) {
            const v = idx.get(id);
            if (v) out.push(v);
          }
          return out;
        };
        const slimBackup = {
          funnels: chunkFunnels,
          messages: pick(messagesIdx),
          audios: pick(audiosIdx),
          medias: pick(mediasIdx),
          docs: pick(docsIdx),
          objectsList: pick(objectsIdx),
        };

        try {
          const r: any = await importZvFn({
            data: {
              backup: slimBackup,
              operacao_id: zvOp || null,
              replace: zvReplace && chunkIdx === 0,
              funnelIds: null,
            },
          });
          acc.funnels += r?.funnels ?? 0;
          acc.steps += r?.steps ?? 0;
          acc.uploads += r?.uploads ?? 0;
          if (Array.isArray(r?.errors)) acc.errors.push(...r.errors);
        } catch (chunkErr: any) {
          console.error("[zv-import] chunk fail", { chunkIdx, error: chunkErr });
          for (const f of chunkFunnels) {
            acc.errors.push({ funnel: f?.name ?? f?.id, message: chunkErr?.message ?? String(chunkErr) });
          }
        }
      }
      setZvSummary(acc);
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
      if (acc.funnels === 0) {
        const firstErr = acc.errors[0]?.message ?? "Nenhum funil foi importado";
        toast.error(`Falhou: ${firstErr}${acc.errors.length > 1 ? ` (+${acc.errors.length - 1} erros)` : ""}`, { id: t });
      } else if (acc.errors.length > 0) {
        toast.success(`Importado: ${acc.funnels} funis · ${acc.steps} etapas · ${acc.uploads} arquivos — ${acc.errors.length} avisos`, { id: t });
      } else {
        toast.success(`Importado: ${acc.funnels} funis · ${acc.steps} etapas · ${acc.uploads} arquivos`, { id: t });
      }
    } catch (e: any) {
      console.error("[zv-import] server fail", e);
      toast.error(e?.message ?? "Erro ao importar ZapVoice", { id: t });
    } finally {
      setZvProgress("");
    }
  }





  // Fluxos sem operação são considerados "globais" e aparecem em qualquer workspace
  // (importante pra vendedor enxergar fluxos compartilhados).
  const scoped = (flows as any[]).filter((f) =>
    workspace.id === "all" ? true : (!f.operacao_id || f.operacao_id === workspace.id),
  );

  const q = search.trim().toLowerCase();
  const filtered = !q ? scoped : scoped.filter((f: any) => {
    const hay: string[] = [
      String(f?.nome ?? ""),
      String(f?.folder ?? ""),
      String(f?.operacao_id ?? ""),
    ];
    for (const t of (f?.wa_flow_triggers ?? [])) {
      const val = t?.valor == null ? "" : (typeof t.valor === "object" ? JSON.stringify(t.valor) : String(t.valor));
      hay.push(String(t?.tipo ?? ""), val);
    }
    return hay.some((s) => s.toLowerCase().includes(q));
  });

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportCode);
      toast.success("Código copiado!");
    } catch {
      toast.error("Não foi possível copiar — selecione e copie manualmente.");
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Workflow className="h-6 w-6 shrink-0 text-emerald-500" /> <span className="truncate">Fluxos</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Automações conectando blocos. Gatilhos: palavra-chave, nova conversa, etc.
          </p>
        </div>
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-auto">
          <Button variant="outline" size="sm" onClick={() => { setZvSummary(null); setZvOpen(true); }}>
            <FileJson className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Importar ZapVoice</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Importar código</span>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                <Plus className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Novo fluxo</span>
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
                <div className="space-y-1.5">
                  <Label>Pasta (opcional)</Label>
                  <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Ex.: Onboarding, Recuperação..." />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!name.trim() || createMut.isPending}
                  onClick={() => createMut.mutate({ nome: name.trim(), operacao_id: op || null, folder: folder.trim() || null })}
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
        <FlowsGrouped
          flows={filtered}
          showOp={workspace.id === "all"}
          workspaces={workspaces}
          renderCard={(f: any) => {
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
                  {triggers.map((t: any) => {
                    const val = t?.valor == null ? "" : (typeof t.valor === "object" ? JSON.stringify(t.valor) : String(t.valor));
                    return (
                      <Badge key={t.id} variant="outline" className="text-xs">
                        {t.tipo === "keyword" ? `🔑 ${val}` : t.tipo === "new_conversation" ? "🆕 Nova conversa" : t.tipo === "any_message" ? "💬 Qualquer msg" : t.tipo === "new_lead" ? "👤 Novo lead" : "✋ Manual"}
                      </Badge>
                    );
                  })}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/flows/$flowId" params={{ flowId: f.id }}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                    </Link>
                  </Button>
                  <Button
                    size="sm" variant="outline" title="Mover para pasta"
                    onClick={() => {
                      const v = prompt("Nome da pasta (vazio = sem pasta):", f.folder ?? "");
                      if (v === null) return;
                      moveFolderMut.mutate({ id: f.id, folder: v.trim() || null });
                    }}
                  >
                    📁
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
          }}
        />
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

function FlowsGrouped({
  flows,
  showOp,
  workspaces,
  renderCard,
}: {
  flows: any[];
  showOp: boolean;
  workspaces: { id: string; nome: string; accent?: { hex: string; text: string; ring: string; border: string; bg: string } }[];
  renderCard: (f: any) => any;
}) {
  const opsMap = new Map<string, Map<string, any[]>>();
  for (const f of flows) {
    const opId = String(f.operacao_id ?? "__sem_op__");
    const fld = (f.folder && String(f.folder).trim()) || "__sem_pasta__";
    if (!opsMap.has(opId)) opsMap.set(opId, new Map());
    const fm = opsMap.get(opId)!;
    if (!fm.has(fld)) fm.set(fld, []);
    fm.get(fld)!.push(f);
  }
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const opName = (id: string) => {
    if (id === "__sem_op__") return "Sem operação";
    const w = wsById.get(id);
    return String(w?.nome ?? id);
  };
  const opAccent = (id: string): { hex: string; text: string; ring: string; border: string; bg: string } => {
    const w = wsById.get(id);
    if (w?.accent) return w.accent as any;
    return { hex: "#64748b", text: "text-slate-400", ring: "ring-slate-500/40", border: "border-slate-500/30", bg: "bg-slate-500/10" };
  };

  const opEntries = Array.from(opsMap.entries()).sort((a, b) => opName(a[0]).localeCompare(opName(b[0])));

  return (
    <div className="space-y-6">
      {opEntries.map(([opId, foldersMap]) => {
        const isOperacao = opId !== "__sem_op__";
        const namedFolders = Array.from(foldersMap.entries())
          .filter(([k]) => k !== "__sem_pasta__")
          .sort((a, b) => a[0].localeCompare(b[0]));
        const semPasta = foldersMap.get("__sem_pasta__") ?? [];
        const totalFluxos = Array.from(foldersMap.values()).reduce((a, b) => a + b.length, 0);
        const c = opAccent(opId);
        const nomeOp = opName(opId);
        const initial = nomeOp.charAt(0).toUpperCase();

        return (
          <OperacaoSection
            key={opId}
            opId={opId}
            nomeOp={nomeOp}
            initial={initial}
            hex={c.hex}
            totalFluxos={totalFluxos}
            namedFolders={namedFolders}
            semPasta={semPasta}
            isOperacao={isOperacao}
            showOp={showOp}
            renderCard={renderCard}
          />
        );
      })}
    </div>
  );
}

function OperacaoSection({
  opId, nomeOp, initial, hex, totalFluxos, namedFolders, semPasta, isOperacao, showOp, renderCard,
}: {
  opId: string;
  nomeOp: string;
  initial: string;
  hex: string;
  totalFluxos: number;
  namedFolders: [string, any[]][];
  semPasta: any[];
  isOperacao: boolean;
  showOp: boolean;
  renderCard: (f: any) => any;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const gradient = `linear-gradient(135deg, ${hex}22 0%, ${hex}0a 45%, transparent 100%)`;

  return (
    <section
      className="rounded-2xl border overflow-hidden backdrop-blur-sm"
      style={{ borderColor: `${hex}55`, background: gradient }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 sm:px-7 py-5 sm:py-6 border-b text-left hover:bg-background/30 transition-colors"
        style={{ borderColor: `${hex}33`, backgroundColor: `${hex}14` }}
      >
        <div
          className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-2xl grid place-items-center font-bold text-white text-2xl sm:text-3xl"
          style={{ backgroundColor: hex, boxShadow: `0 6px 20px ${hex}66` }}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <h2
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight truncate leading-tight"
            style={{ color: hex }}
          >
            {nomeOp}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground truncate mt-1">
            {totalFluxos} fluxo{totalFluxos === 1 ? "" : "s"}
            {namedFolders.length > 0 && ` · ${namedFolders.length} pasta${namedFolders.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-sm font-bold tabular-nums"
            style={{ backgroundColor: `${hex}25`, color: hex, border: `1px solid ${hex}55` }}
          >
            {totalFluxos}
          </span>
          <span className="text-muted-foreground text-lg">{collapsed ? "▸" : "▾"}</span>
        </div>
      </button>


      {!collapsed && (
        <div className="p-4 sm:p-5 space-y-6">
          {semPasta.length > 0 && (
            <FolderBlock
              title={isOperacao ? "Diretos" : "Sem operação"}
              items={semPasta}
              hex={hex}
              renderCard={renderCard}
              showLabel={namedFolders.length > 0 || !isOperacao}
              icon={isOperacao ? "📌" : "📂"}
            />
          )}
          {namedFolders.map(([fld, items]) => (
            <FolderBlock
              key={fld}
              title={fld}
              items={items}
              hex={hex}
              renderCard={renderCard}
              showLabel
              icon="📁"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FolderBlock({
  title, items, hex, renderCard, showLabel, icon,
}: {
  title: string;
  items: any[];
  hex: string;
  renderCard: (f: any) => any;
  showLabel: boolean;
  icon: string;
}) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 3;
  const visible = showAll ? items : items.slice(0, LIMIT);
  const hidden = items.length - visible.length;

  return (
    <div className="space-y-3">
      {showLabel && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{open ? "▾" : "▸"}</span>
          <span>{icon} {title}</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
            style={{ backgroundColor: `${hex}20`, color: hex }}
          >
            {items.length}
          </span>
        </button>
      )}
      {open && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {visible.map((f: any) => renderCard(f))}
          </div>
          {items.length > LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm sm:text-base font-bold border-2 border-dashed hover:scale-[1.01] active:scale-[0.99] transition-transform"
              style={{
                color: hex,
                borderColor: `${hex}66`,
                backgroundColor: `${hex}12`,
              }}
            >
              {showAll
                ? "▲  Ver menos"
                : `▼  Ver mais ${hidden} fluxo${hidden === 1 ? "" : "s"}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}


