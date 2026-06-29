import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ReactFlow, ReactFlowProvider, Background,
  addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  type NodeProps, Handle, Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft, Save, Power, PowerOff, Send, Trash2,
  MessageSquare, Image as ImageIcon, Video, FileText, Mic,
  MousePointerClick, Clock, GitBranch, Square as StopIcon, Play, Plus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getFlow, saveFlow, saveTriggers, triggerFlowManually } from "@/lib/flow-engine.functions";

export const Route = createFileRoute("/_authenticated/flows/$flowId")({
  component: FlowEditorPage,
});

// ============================================================
// Node visuals
// ============================================================

const NODE_META: Record<string, { label: string; icon: any; color: string; description: string }> = {
  trigger:        { label: "Início",           icon: Play,               color: "#10b981", description: "Ponto inicial do fluxo" },
  send_text:      { label: "Texto",            icon: MessageSquare,      color: "#3b82f6", description: "Envia mensagem de texto" },
  send_image:     { label: "Imagem",           icon: ImageIcon,          color: "#a855f7", description: "Envia uma imagem" },
  send_video:     { label: "Vídeo",            icon: Video,              color: "#ec4899", description: "Envia um vídeo" },
  send_audio:     { label: "Áudio",            icon: Mic,                color: "#f59e0b", description: "Envia áudio" },
  send_document:  { label: "Documento",        icon: FileText,           color: "#64748b", description: "Envia documento" },
  send_buttons:   { label: "Botões",           icon: MousePointerClick,  color: "#06b6d4", description: "Mensagem com botões" },
  wait_message:   { label: "Esperar Mensagem", icon: Clock,              color: "#eab308", description: "Pausa até o contato responder" },
  delay:          { label: "Aguardar",         icon: Clock,              color: "#94a3b8", description: "Espera N segundos" },
  condition:      { label: "Condição",         icon: GitBranch,          color: "#f97316", description: "Ramifica se/senão" },
  end:            { label: "Fim",              icon: StopIcon,           color: "#ef4444", description: "Encerra o fluxo" },
};

function CustomNode({ data, type, selected }: NodeProps) {
  const meta = NODE_META[type as string] ?? NODE_META.send_text;
  const Icon = meta.icon;
  const isTrigger = type === "trigger";
  const isEnd = type === "end";
  const isButtons = type === "send_buttons";
  const isCondition = type === "condition";

  return (
    <div
      className={`rounded-xl border-2 bg-card shadow-lg min-w-[300px] max-w-[340px] ${selected ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background" : ""}`}
      style={{ borderColor: meta.color }}
    >
      {!isTrigger && (
        <Handle type="target" position={Position.Top} style={{ background: meta.color, width: 14, height: 14 }} />
      )}
      <div className="px-4 py-3 flex items-center gap-3 border-b" style={{ borderColor: `${meta.color}40` }}>
        <div className="rounded-lg p-2.5" style={{ backgroundColor: `${meta.color}25` }}>
          <Icon className="h-5 w-5" style={{ color: meta.color }} />
        </div>
        <span className="text-base font-semibold">{meta.label}</span>
      </div>
      <div className="px-4 py-3 text-sm text-muted-foreground min-h-[44px] leading-relaxed">
        {nodePreview(type as string, (data as any) ?? {})}
      </div>

      {/* Outputs */}
      {!isEnd && !isCondition && !isButtons && (
        <Handle type="source" position={Position.Bottom} id="out" style={{ background: meta.color, width: 10, height: 10 }} />
      )}
      {isCondition && (
        <>
          <Handle type="source" position={Position.Bottom} id="true" style={{ left: "30%", background: "#10b981", width: 14, height: 14 }} />
          <Handle type="source" position={Position.Bottom} id="false" style={{ left: "70%", background: "#ef4444", width: 14, height: 14 }} />
          <div className="flex justify-between px-4 pb-2 text-xs font-medium">
            <span className="text-emerald-500">verdadeiro</span>
            <span className="text-red-500">falso</span>
          </div>
        </>
      )}
      {isButtons && (
        <div className="px-4 pb-3 space-y-2">
          {((data as any)?.buttons ?? []).slice(0, 3).map((b: any, i: number) => (
            <div key={b.id ?? i} className="relative">
              <div className="text-sm bg-muted rounded-md px-3 py-2 text-center truncate border">{b.label || `Botão ${i + 1}`}</div>
              <Handle
                type="source" position={Position.Right} id={b.id}
                style={{ top: "50%", background: meta.color, width: 12, height: 12 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function nodePreview(type: string, data: any): string {
  switch (type) {
    case "trigger": return "Disparado por gatilho";
    case "send_text": return (data?.text ?? "(sem texto)").slice(0, 60);
    case "send_image": return data?.mediaUrl ? "📷 mídia anexada" : "(sem mídia)";
    case "send_video": return data?.mediaUrl ? "🎬 vídeo anexado" : "(sem mídia)";
    case "send_audio": return data?.mediaUrl ? "🎤 áudio anexado" : "(sem mídia)";
    case "send_document": return data?.mediaUrl ? `📄 ${data?.filename ?? "documento"}` : "(sem mídia)";
    case "send_buttons": return (data?.text ?? "(sem texto)").slice(0, 50);
    case "wait_message": return `Aguarda resposta (timeout ${data?.timeoutSeconds ?? 86400}s)`;
    case "delay": return `${data?.seconds ?? 2}s`;
    case "condition": {
      const op = data?.operator ?? "contains";
      return `texto ${op} "${data?.value ?? ""}"`;
    }
    case "end": return "Fim do fluxo";
    default: return "";
  }
}

const nodeTypes = {
  trigger: CustomNode, send_text: CustomNode, send_image: CustomNode, send_video: CustomNode,
  send_audio: CustomNode, send_document: CustomNode, send_buttons: CustomNode,
  wait_message: CustomNode, delay: CustomNode, condition: CustomNode, end: CustomNode,
};

// ============================================================
// Page
// ============================================================

function FlowEditorPage() {
  const { flowId } = Route.useParams();
  return (
    <ReactFlowProvider>
      <Editor flowId={flowId} />
    </ReactFlowProvider>
  );
}

function Editor({ flowId }: { flowId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getFlowFn = useServerFn(getFlow);
  const saveFlowFn = useServerFn(saveFlow);
  const saveTriggersFn = useServerFn(saveTriggers);
  const triggerFn = useServerFn(triggerFlowManually);

  const { data: flow, isLoading } = useQuery({
    queryKey: ["wa-flow", flowId],
    queryFn: () => getFlowFn({ data: { id: flowId } }),
  });

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [name, setName] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testChannel, setTestChannel] = useState("");

  // Hydrate from server
  useEffect(() => {
    if (!flow) return;
    const f = flow as any;
    setName(f.nome ?? "");
    setAtivo(f.ativo ?? false);
    setNodes((f.nodes ?? []) as Node[]);
    setEdges((f.edges ?? []) as Edge[]);
    setTriggers(f.wa_flow_triggers ?? []);
  }, [flow]);

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes((n) => applyNodeChanges(c, n)), []);
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((e) => applyEdgeChanges(c, e)), []);
  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true, style: { stroke: "#10b981", strokeWidth: 2 } }, eds)),
    []
  );

  const onNodeClick = useCallback((_: any, n: Node) => setSelectedNode(n), []);

  const addNode = useCallback((type: string) => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const meta = NODE_META[type];
    const node: Node = {
      id,
      type,
      position: { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
      data: defaultDataFor(type, meta.label),
    };
    setNodes((ns) => [...ns, node]);
  }, []);

  const updateSelectedData = useCallback((patch: any) => {
    if (!selectedNode) return;
    setNodes((ns) => ns.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n));
    setSelectedNode((s) => s ? { ...s, data: { ...s.data, ...patch } } as Node : s);
  }, [selectedNode]);

  const deleteSelected = useCallback(() => {
    if (!selectedNode || selectedNode.type === "trigger") return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedNode.id));
    setEdges((es) => es.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  }, [selectedNode]);

  const saveMut = useMutation({
    mutationFn: async () => {
      await saveFlowFn({
        data: {
          id: flowId,
          nome: name,
          ativo,
          entry_node_id: nodes.find((n) => n.type === "trigger")?.id ?? null,
          nodes: nodes as any,
          edges: edges as any,
        },
      });
      await saveTriggersFn({
        data: {
          flow_id: flowId,
          triggers: triggers.map((t) => ({
            tipo: t.tipo,
            valor: t.valor,
            match_mode: t.match_mode ?? "contains",
            channel_id: t.channel_id,
            ativo: t.ativo ?? true,
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Fluxo salvo");
      qc.invalidateQueries({ queryKey: ["wa-flow", flowId] });
      qc.invalidateQueries({ queryKey: ["wa-flows"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const testMut = useMutation({
    mutationFn: () => triggerFn({ data: { flow_id: flowId, channel_id: testChannel, contact_wa_id: testPhone } }),
    onSuccess: () => { toast.success("Fluxo disparado!"); setTestOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  async function uploadMedia(file: File) {
    const ext = file.name.split(".").pop() || "bin";
    const path = `flows/${flowId}/${Date.now()}.${ext}`;
    const up = await supabase.storage.from("wa-media").upload(path, file, { contentType: file.type });
    if (up.error) { toast.error(up.error.message); return null; }
    const s = await supabase.storage.from("wa-media").createSignedUrl(path, 60 * 60 * 24 * 365);
    return s.data?.signedUrl ?? null;
  }

  if (isLoading) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  return (
    <div className="h-[calc(100vh-1rem)] flex flex-col">
      {/* Topbar */}
      <header className="px-4 py-2 border-b flex items-center gap-3 bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/flows" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={name} onChange={(e) => setName(e.target.value)}
          className="max-w-xs font-semibold"
        />
        <Badge className={ativo ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}>
          {ativo ? "Ativo" : "Inativo"}
        </Badge>
        <div className="flex items-center gap-2 ml-2">
          <Switch checked={ativo} onCheckedChange={setAtivo} />
          <span className="text-xs">{ativo ? <Power className="h-3.5 w-3.5 inline" /> : <PowerOff className="h-3.5 w-3.5 inline" />}</span>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
            <Send className="h-4 w-4 mr-1.5" /> Testar
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="h-4 w-4 mr-1.5" /> Salvar
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Palette */}
        <Palette onAdd={addNode} triggers={triggers} setTriggers={setTriggers} />

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background gap={16} color="#374151" />
          </ReactFlow>
        </div>

        {/* Inspector */}
        {selectedNode && (
          <Inspector
            key={selectedNode.id}
            node={selectedNode}
            onChange={updateSelectedData}
            onDelete={deleteSelected}
            onUpload={uploadMedia}
          />
        )}
      </div>

      {/* Test dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Testar fluxo</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Channel ID (EvoHub)</Label>
              <Input value={testChannel} onChange={(e) => setTestChannel(e.target.value)} placeholder="ch_xxx" />
            </div>
            <div className="space-y-1.5">
              <Label>Número de destino (E.164)</Label>
              <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="5511999999999" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => testMut.mutate()} disabled={!testChannel || !testPhone || testMut.isPending}>
              Disparar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Palette + Triggers
// ============================================================

function Palette({
  onAdd, triggers, setTriggers,
}: { onAdd: (t: string) => void; triggers: any[]; setTriggers: (t: any[]) => void }) {
  const groups: Array<{ label: string; types: string[] }> = [
    { label: "Conteúdo", types: ["send_text", "send_image", "send_video", "send_audio", "send_document"] },
    { label: "Interativo", types: ["send_buttons"] },
    { label: "Espera", types: ["wait_message", "delay"] },
    { label: "Lógica", types: ["condition", "end"] },
  ];

  return (
    <aside className="w-64 border-r overflow-y-auto bg-card">
      <div className="p-3 border-b">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Gatilhos</h3>
        <div className="space-y-2">
          {triggers.map((t, i) => (
            <div key={i} className="border rounded p-2 space-y-1.5 bg-background">
              <div className="flex items-center justify-between">
                <Select
                  value={t.tipo}
                  onValueChange={(v) => {
                    const copy = [...triggers]; copy[i] = { ...t, tipo: v }; setTriggers(copy);
                  }}
                >
                  <SelectTrigger className="h-7 text-xs flex-1 mr-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">Palavra-chave</SelectItem>
                    <SelectItem value="new_conversation">Nova conversa</SelectItem>
                    <SelectItem value="any_message">Qualquer mensagem</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTriggers(triggers.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {t.tipo === "keyword" && (
                <Input
                  value={t.valor ?? ""} onChange={(e) => { const c = [...triggers]; c[i] = { ...t, valor: e.target.value }; setTriggers(c); }}
                  placeholder="ex: oi, menu" className="h-7 text-xs"
                />
              )}
            </div>
          ))}
          <Button
            variant="outline" size="sm" className="w-full"
            onClick={() => setTriggers([...triggers, { tipo: "keyword", valor: "", match_mode: "contains", ativo: true }])}
          >
            <Plus className="h-3 w-3 mr-1" /> Gatilho
          </Button>
        </div>
      </div>

      <div className="p-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Blocos</h3>
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground/70 mb-1.5">{g.label}</p>
            <div className="space-y-1">
              {g.types.map((t) => {
                const meta = NODE_META[t];
                const Icon = meta.icon;
                return (
                  <button
                    key={t}
                    onClick={() => onAdd(t)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/10 border border-transparent hover:border-border text-left"
                  >
                    <div className="rounded p-1" style={{ backgroundColor: `${meta.color}25` }}>
                      <Icon className="h-3 w-3" style={{ color: meta.color }} />
                    </div>
                    <span className="text-xs">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ============================================================
// Inspector
// ============================================================

function Inspector({
  node, onChange, onDelete, onUpload,
}: {
  node: Node;
  onChange: (patch: any) => void;
  onDelete: () => void;
  onUpload: (f: File) => Promise<string | null>;
}) {
  const meta = NODE_META[node.type as string] ?? NODE_META.send_text;
  const d: any = node.data ?? {};

  return (
    <aside className="w-80 border-l overflow-y-auto bg-card">
      <div className="p-3 border-b flex items-center gap-2">
        <div className="rounded p-1.5" style={{ backgroundColor: `${meta.color}25` }}>
          <meta.icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{meta.label}</h3>
          <p className="text-[10px] text-muted-foreground">{meta.description}</p>
        </div>
        {node.type !== "trigger" && (
          <Button size="icon" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {(node.type === "send_text" || node.type === "send_buttons") && (
          <div className="space-y-1.5">
            <Label>Texto</Label>
            <Textarea
              value={d.text ?? ""} onChange={(e) => onChange({ text: e.target.value })}
              rows={5} placeholder="Use {{contato.telefone}} ou {{input.texto}}"
            />
          </div>
        )}

        {(node.type === "send_image" || node.type === "send_video" || node.type === "send_audio" || node.type === "send_document") && (
          <>
            <div className="space-y-1.5">
              <Label>Mídia (upload)</Label>
              <Input
                type="file"
                accept={
                  node.type === "send_image" ? "image/*" :
                  node.type === "send_video" ? "video/*" :
                  node.type === "send_audio" ? "audio/*" : "*"
                }
                onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const url = await onUpload(f);
                  if (url) onChange({ mediaUrl: url, filename: f.name });
                }}
              />
              {d.mediaUrl && <p className="text-[10px] text-muted-foreground truncate">✓ {d.filename ?? "anexado"}</p>}
            </div>
            {node.type !== "send_audio" && (
              <div className="space-y-1.5">
                <Label>Legenda (opcional)</Label>
                <Textarea value={d.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} rows={2} />
              </div>
            )}
          </>
        )}

        {node.type === "send_buttons" && (
          <div className="space-y-2">
            <Label>Botões (até 3)</Label>
            {(d.buttons ?? []).map((b: any, i: number) => (
              <div key={b.id ?? i} className="flex gap-1.5">
                <Input
                  value={b.label} placeholder={`Botão ${i + 1}`}
                  maxLength={20}
                  onChange={(e) => {
                    const arr = [...(d.buttons ?? [])];
                    arr[i] = { ...arr[i], label: e.target.value };
                    onChange({ buttons: arr });
                  }}
                />
                <Button size="icon" variant="ghost" onClick={() => {
                  const arr = (d.buttons ?? []).filter((_: any, j: number) => j !== i);
                  onChange({ buttons: arr });
                }}><X className="h-3 w-3" /></Button>
              </div>
            ))}
            {(d.buttons ?? []).length < 3 && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => {
                const arr = [...(d.buttons ?? []), { id: `btn-${Date.now()}`, label: "" }];
                onChange({ buttons: arr });
              }}><Plus className="h-3 w-3 mr-1" /> Adicionar botão</Button>
            )}
            <p className="text-[10px] text-muted-foreground">Cada botão é uma saída separada no canvas.</p>
          </div>
        )}

        {node.type === "wait_message" && (
          <div className="space-y-1.5">
            <Label>Timeout (segundos)</Label>
            <Input type="number" value={d.timeoutSeconds ?? 86400} onChange={(e) => onChange({ timeoutSeconds: Number(e.target.value) })} />
          </div>
        )}

        {node.type === "delay" && (
          <div className="space-y-1.5">
            <Label>Segundos (máx 30)</Label>
            <Input type="number" max={30} value={d.seconds ?? 2} onChange={(e) => onChange({ seconds: Math.min(30, Number(e.target.value)) })} />
          </div>
        )}

        {node.type === "condition" && (
          <>
            <div className="space-y-1.5">
              <Label>Operador</Label>
              <Select value={d.operator ?? "contains"} onValueChange={(v) => onChange({ operator: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="starts_with">Começa com</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input value={d.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />
            </div>
          </>
        )}

        {node.type === "trigger" && (
          <p className="text-xs text-muted-foreground">Configure os gatilhos no painel esquerdo. Conecte a saída deste nó pro primeiro bloco do fluxo.</p>
        )}
        {node.type === "end" && (
          <p className="text-xs text-muted-foreground">Encerra a execução do fluxo neste ponto.</p>
        )}
      </div>
    </aside>
  );
}

function defaultDataFor(type: string, label: string): any {
  switch (type) {
    case "send_text": return { text: "Olá! 👋" };
    case "send_buttons": return { text: "Escolha uma opção:", buttons: [{ id: `btn-${Date.now()}-1`, label: "Opção 1" }] };
    case "wait_message": return { timeoutSeconds: 86400 };
    case "delay": return { seconds: 2 };
    case "condition": return { operator: "contains", value: "" };
    case "send_document": return { mediaUrl: "", filename: "" };
    default: return { label };
  }
}
