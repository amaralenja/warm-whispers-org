import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ReactFlow, ReactFlowProvider, Background,
  addEdge, applyNodeChanges, applyEdgeChanges,
  useReactFlow, getBezierPath, EdgeLabelRenderer, BaseEdge,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  type NodeProps, type EdgeProps, Handle, Position,
} from "@xyflow/react";
// xyflow css é importado globalmente em src/styles.css
import {
  ArrowLeft, Save, Power, PowerOff, Send, Trash2, Copy, Scissors,
  MessageSquare, Image as ImageIcon, Video, FileText, Mic,
  MousePointerClick, Clock, GitBranch, Square as StopIcon, Play, Plus, X, Shuffle, Tag as TagIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCrmTags, type CrmTag } from "@/components/tags-manager-dialog";
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
import { listWhatsappChannels } from "@/lib/evohub.functions";

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
  random:         { label: "Randomização",     icon: Shuffle,            color: "#8b5cf6", description: "Escolhe uma saída aleatória por probabilidade" },
  tag_action:     { label: "Etiquetas",        icon: TagIcon,            color: "#10b981", description: "Adicionar ou remover etiquetas do lead" },
  end:            { label: "Fim",              icon: StopIcon,           color: "#ef4444", description: "Encerra o fluxo" },
};

const CONDITION_OPTIONS: { value: string; label: string; needsValue?: "text" | "number" }[] = [
  { value: "text_contains", label: "Texto contém", needsValue: "text" },
  { value: "text_equals", label: "Texto é igual a", needsValue: "text" },
  { value: "text_starts_with", label: "Texto começa com", needsValue: "text" },
  { value: "text_regex", label: "Texto bate com Regex", needsValue: "text" },
  { value: "text_word_count_gte", label: "Tem ao menos X palavras", needsValue: "number" },
  { value: "is_text", label: "Lead mandou texto" },
  { value: "is_audio", label: "Lead mandou áudio" },
  { value: "is_image", label: "Lead mandou imagem" },
  { value: "is_video", label: "Lead mandou vídeo" },
  { value: "is_document", label: "Lead mandou documento" },
  { value: "is_sticker", label: "Lead mandou figurinha" },
  { value: "is_location", label: "Lead mandou localização" },
  { value: "is_contact", label: "Lead mandou contato" },
  { value: "is_button_reply", label: "Lead clicou em algum botão" },
  { value: "button_id_equals", label: "Lead clicou no botão ID =", needsValue: "text" },
];

function conditionOption(op?: string) {
  return CONDITION_OPTIONS.find((o) => o.value === op) ?? CONDITION_OPTIONS[0];
}

function conditionSummary(d: any) {
  const opt = conditionOption(d?.operator);
  if (opt.needsValue) return `${opt.label} "${d?.value ?? ""}"`;
  return opt.label;
}

function CustomNode({ id, data, type, selected }: NodeProps) {
  const rf = useReactFlow();
  const meta = NODE_META[type as string] ?? NODE_META.send_text;
  const Icon = meta.icon;
  const isTrigger = type === "trigger";
  const isEnd = type === "end";
  const isButtons = type === "send_buttons";
  const isCondition = type === "condition";
  const isRandom = type === "random";
  const d = (data as any) ?? {};

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    rf.setNodes((ns) => ns.filter((n) => n.id !== id));
    rf.setEdges((es) => es.filter((ed) => ed.source !== id && ed.target !== id));
  }
  function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation();
    const orig = rf.getNode(id);
    if (!orig) return;
    const newId = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    rf.setNodes((ns) => [
      ...ns,
      { ...orig, id: newId, position: { x: orig.position.x + 40, y: orig.position.y + 40 }, selected: false } as Node,
    ]);
  }

  return (
    <div
      className={`group relative rounded-xl border-2 bg-card shadow-lg min-w-[300px] max-w-[340px] ${selected ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background" : ""}`}
      style={{ borderColor: meta.color }}
    >
      {/* Quick actions (hover) */}
      {!isTrigger && (
        <div className="absolute -top-3 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition z-10">
          <button
            onClick={handleDuplicate}
            title="Duplicar"
            className="h-7 w-7 rounded-full bg-card border border-border shadow flex items-center justify-center hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            title="Excluir"
            className="h-7 w-7 rounded-full bg-card border border-border shadow flex items-center justify-center hover:bg-destructive hover:text-white hover:border-destructive transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!isTrigger && (
        <Handle type="target" position={Position.Top} style={{ background: meta.color, width: 14, height: 14 }} />
      )}
      <div className="px-4 py-3 flex items-center gap-3 border-b" style={{ borderColor: `${meta.color}40` }}>
        <div className="rounded-lg p-2.5" style={{ backgroundColor: `${meta.color}25` }}>
          <Icon className="h-5 w-5" style={{ color: meta.color }} />
        </div>
        <span className="text-base font-semibold">{meta.label}</span>
      </div>

      {/* Body / preview */}
      <div className="px-4 py-3 text-sm text-muted-foreground space-y-2">
        {type === "send_text" && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-foreground whitespace-pre-wrap break-words text-[13px] leading-relaxed max-h-32 overflow-hidden">
            {d.text || <span className="italic text-muted-foreground">(sem texto)</span>}
          </div>
        )}
        {type === "send_image" && (
          d.mediaUrl
            ? <img src={d.mediaUrl} alt="" className="rounded-md w-full max-h-40 object-cover border" />
            : <div className="rounded-md border border-dashed h-24 flex items-center justify-center text-xs italic">sem imagem</div>
        )}
        {type === "send_video" && (
          d.mediaUrl
            ? <video src={d.mediaUrl} className="rounded-md w-full max-h-40 object-cover border" muted />
            : <div className="rounded-md border border-dashed h-24 flex items-center justify-center text-xs italic">sem vídeo</div>
        )}
        {type === "send_audio" && (
          d.mediaUrl
            ? <audio src={d.mediaUrl} controls className="w-full h-8" />
            : <div className="rounded-md border border-dashed h-12 flex items-center justify-center text-xs italic">sem áudio</div>
        )}
        {type === "send_document" && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 flex items-center gap-2 text-foreground text-[13px]">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{d.filename || (d.mediaUrl ? "documento" : "(sem arquivo)")}</span>
          </div>
        )}
        {type === "send_buttons" && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-foreground text-[13px] whitespace-pre-wrap break-words">
            {d.text || <span className="italic text-muted-foreground">(sem texto)</span>}
          </div>
        )}
        {type === "wait_message" && (
          <div className="text-[13px]">
            ⏳ {d.infinite ? "Aguarda indefinidamente" : `Timeout ${d.timeoutSeconds ?? 86400}s`}
            {d.remarketing?.enabled && <div className="text-[11px] text-yellow-700 mt-0.5">↪ Remarketing em {d.remarketing.afterSeconds}s</div>}
          </div>
        )}
        {type === "delay" && (() => {
          const t = Number(d.seconds ?? 2);
          const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
          const parts = [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(" ") || "0s";
          return <div className="text-[13px]">⏱ Espera {parts}</div>;
        })()}
        {type === "condition" && (
          <div className="text-[13px] bg-muted/40 rounded-md px-3 py-2">
            {conditionSummary(d)}
          </div>
        )}
        {type === "random" && (
          <div className="text-[13px] bg-muted/40 rounded-md px-3 py-2">
            🎲 {(d.outputs ?? []).length || 2} saídas aleatórias
          </div>
        )}
        {type === "tag_action" && (
          <div className="text-[13px] bg-emerald-500/10 rounded-md px-3 py-2 space-y-0.5">
            {(d.addTags ?? []).length > 0 && <div>➕ Adicionar {(d.addTags ?? []).length} etiqueta(s)</div>}
            {(d.removeTags ?? []).length > 0 && <div>➖ Remover {(d.removeTags ?? []).length} etiqueta(s)</div>}
            {(d.addTags ?? []).length === 0 && (d.removeTags ?? []).length === 0 && <div className="italic text-muted-foreground">Nenhuma etiqueta configurada</div>}
          </div>
        )}
        {type === "trigger" && <div className="text-[13px] italic">Disparado por gatilho</div>}
        {type === "end" && <div className="text-[13px] italic">Fim do fluxo</div>}
      </div>

      {/* Outputs */}
      {!isEnd && !isCondition && !isButtons && !isRandom && (
        <Handle type="source" position={Position.Bottom} id="out" style={{ background: meta.color, width: 14, height: 14 }} />
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
          {(d.buttons ?? []).slice(0, 6).map((b: any, i: number) => {
            const isUrl = b.type === "url";
            return (
              <div key={b.id ?? i} className="relative">
                <div className={`text-sm rounded-md px-3 py-2 text-center truncate border ${isUrl ? "bg-blue-500/10 border-blue-500/30 text-blue-600" : "bg-muted"}`}>
                  {isUrl ? "🔗 " : ""}{b.label || `Botão ${i + 1}`}
                </div>
                {!isUrl && (
                  <Handle
                    type="source" position={Position.Right} id={b.id}
                    style={{ top: "50%", background: meta.color, width: 12, height: 12 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {isRandom && (
        <div className="px-4 pb-3 space-y-2">
          {(d.outputs ?? []).map((o: any, i: number) => (
            <div key={o.id ?? i} className="relative">
              <div className="text-sm bg-muted rounded-md px-3 py-2 flex items-center justify-between border">
                <span className="truncate">Saída {i + 1}</span>
                <span className="text-xs font-semibold text-violet-500">{Number(o.weight ?? 0).toFixed(0)}%</span>
              </div>
              <Handle
                type="source" position={Position.Right} id={o.id}
                style={{ top: "50%", background: meta.color, width: 12, height: 12 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScissorsEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd }: EdgeProps) {
  const rf = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ stroke: "#10b981", strokeWidth: 2, ...style }} />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); rf.setEdges((es) => es.filter((ed) => ed.id !== id)); }}
          title="Desconectar"
          className="nodrag nopan absolute h-7 w-7 rounded-full bg-card border border-border shadow flex items-center justify-center hover:bg-destructive hover:text-white hover:border-destructive transition"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
        >
          <Scissors className="h-3.5 w-3.5" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {
  trigger: CustomNode, send_text: CustomNode, send_image: CustomNode, send_video: CustomNode,
  send_audio: CustomNode, send_document: CustomNode, send_buttons: CustomNode,
  wait_message: CustomNode, delay: CustomNode, condition: CustomNode, random: CustomNode, tag_action: CustomNode, end: CustomNode,
};

const edgeTypes = {
  default: ScissorsEdge,
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
  const [operacaoId, setOperacaoId] = useState<string | null>(null);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testChannel, setTestChannel] = useState("");

  const listChannelsFn = useServerFn(listWhatsappChannels);
  const { data: allChannels = [] } = useQuery({
    queryKey: ["wa-channels-all"],
    queryFn: () => listChannelsFn(),
  });
  const channels = useMemo(() => {
    if (!operacaoId) return allChannels as any[];
    return (allChannels as any[]).filter((c) => String(c?.metadata?.operacao_id ?? "") === String(operacaoId));
  }, [allChannels, operacaoId]);

  // Hydrate from server
  useEffect(() => {
    if (!flow) return;
    const f = flow as any;
    setName(f.nome ?? "");
    setAtivo(f.ativo ?? false);
    setOperacaoId(f.operacao_id ?? null);
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
        <Palette onAdd={addNode} triggers={triggers} setTriggers={setTriggers} channels={channels} operacaoId={operacaoId} />

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
            edgeTypes={edgeTypes}
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
  onAdd, triggers, setTriggers, channels, operacaoId,
}: { onAdd: (t: string) => void; triggers: any[]; setTriggers: (t: any[]) => void; channels: any[]; operacaoId: string | null }) {
  const groups: Array<{ label: string; types: string[] }> = [
    { label: "Conteúdo", types: ["send_text", "send_image", "send_video", "send_audio", "send_document"] },
    { label: "Interativo", types: ["send_buttons"] },
    { label: "Espera", types: ["wait_message", "delay"] },
    { label: "CRM", types: ["tag_action"] },
    { label: "Lógica", types: ["condition", "random", "end"] },
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
                    <SelectItem value="new_lead">Novo lead no CRM</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTriggers(triggers.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {t.tipo === "keyword" && (
                <>
                  <Select
                    value={t.match_mode ?? "contains"}
                    onValueChange={(v) => { const c = [...triggers]; c[i] = { ...t, match_mode: v }; setTriggers(c); }}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contém</SelectItem>
                      <SelectItem value="equals">Igual a</SelectItem>
                      <SelectItem value="starts_with">Começa com</SelectItem>
                      <SelectItem value="regex">Regex</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={t.valor ?? ""} onChange={(e) => { const c = [...triggers]; c[i] = { ...t, valor: e.target.value }; setTriggers(c); }}
                    placeholder="ex: oi, menu" className="h-7 text-xs"
                  />
                </>
              )}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Número (WhatsApp)</Label>
                <Select
                  value={t.channel_id ?? "__any__"}
                  onValueChange={(v) => { const c = [...triggers]; c[i] = { ...t, channel_id: v === "__any__" ? null : v }; setTriggers(c); }}
                >
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar número" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Qualquer número da operação</SelectItem>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name ?? c.display_phone_number ?? c.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!operacaoId && (
                  <p className="text-[10px] text-amber-500">Defina a operação do fluxo para listar apenas os números dela.</p>
                )}
                {operacaoId && channels.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">Nenhum número conectado nessa operação.</p>
                )}
              </div>
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

        {node.type === "send_buttons" && (() => {
          const list: any[] = d.buttons ?? [];
          const replyCount = list.filter((b) => (b.type ?? "reply") === "reply").length;
          return (
            <div className="space-y-2">
              <Label>Botões (até 3 de resposta + URLs)</Label>
              {list.map((b: any, i: number) => {
                const btype = b.type ?? "reply";
                return (
                  <div key={b.id ?? i} className="space-y-1.5 border rounded-md p-2">
                    <div className="flex gap-1.5 items-center">
                      <select
                        className="text-xs bg-background border rounded px-1.5 py-1"
                        value={btype}
                        onChange={(e) => {
                          const arr = [...list];
                          arr[i] = { ...arr[i], type: e.target.value };
                          onChange({ buttons: arr });
                        }}
                      >
                        <option value="reply">Resposta</option>
                        <option value="url">URL</option>
                      </select>
                      <Input
                        value={b.label ?? ""} placeholder={`Texto do botão ${i + 1}`}
                        maxLength={20}
                        onChange={(e) => {
                          const arr = [...list];
                          arr[i] = { ...arr[i], label: e.target.value };
                          onChange({ buttons: arr });
                        }}
                      />
                      <Button size="icon" variant="ghost" onClick={() => {
                        onChange({ buttons: list.filter((_: any, j: number) => j !== i) });
                      }}><X className="h-3 w-3" /></Button>
                    </div>
                    {btype === "url" && (
                      <Input
                        value={b.url ?? ""} placeholder="https://..."
                        onChange={(e) => {
                          const arr = [...list];
                          arr[i] = { ...arr[i], url: e.target.value };
                          onChange({ buttons: arr });
                        }}
                      />
                    )}
                  </div>
                );
              })}
              <div className="flex gap-1.5">
                {replyCount < 3 && (
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => {
                    onChange({ buttons: [...list, { id: `btn-${Date.now()}`, label: "", type: "reply" }] });
                  }}><Plus className="h-3 w-3 mr-1" /> Resposta</Button>
                )}
                <Button size="sm" variant="outline" className="flex-1" onClick={() => {
                  onChange({ buttons: [...list, { id: `btn-${Date.now()}`, label: "", type: "url", url: "" }] });
                }}><Plus className="h-3 w-3 mr-1" /> URL</Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Cada botão de <b>resposta</b> vira uma saída no canvas e o fluxo aguarda o clique. Botões de <b>URL</b> são apenas links clicáveis.</p>
            </div>
          );
        })()}

        {node.type === "wait_message" && (() => {
          const totalSecs = Number(d.timeoutSeconds ?? 86400);
          const h = Math.floor(totalSecs / 3600);
          const m = Math.floor((totalSecs % 3600) / 60);
          const s = totalSecs % 60;
          const setHMS = (nh: number, nm: number, ns: number) =>
            onChange({ timeoutSeconds: Math.max(1, nh * 3600 + nm * 60 + ns) });
          const rm = d.remarketing ?? { enabled: false, afterSeconds: 3600, text: "" };
          const rh = Math.floor((rm.afterSeconds ?? 0) / 3600);
          const rmin = Math.floor(((rm.afterSeconds ?? 0) % 3600) / 60);
          const rs = (rm.afterSeconds ?? 0) % 60;
          const setRm = (patch: any) => onChange({ remarketing: { ...rm, ...patch } });
          const setRmHMS = (nh: number, nm: number, ns: number) =>
            setRm({ afterSeconds: Math.max(1, nh * 3600 + nm * 60 + ns) });
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <Label className="text-xs">Aguardar indefinidamente</Label>
                  <p className="text-[10px] text-muted-foreground">Fica aguardando para sempre a resposta</p>
                </div>
                <Switch checked={!!d.infinite} onCheckedChange={(v) => onChange({ infinite: v })} />
              </div>

              {!d.infinite && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Tempo máximo de espera</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div><Input type="number" min={0} value={h} onChange={(e) => setHMS(Number(e.target.value), m, s)} /><p className="text-[10px] text-center text-muted-foreground mt-0.5">horas</p></div>
                    <div><Input type="number" min={0} max={59} value={m} onChange={(e) => setHMS(h, Number(e.target.value), s)} /><p className="text-[10px] text-center text-muted-foreground mt-0.5">min</p></div>
                    <div><Input type="number" min={0} max={59} value={s} onChange={(e) => setHMS(h, m, Number(e.target.value))} /><p className="text-[10px] text-center text-muted-foreground mt-0.5">seg</p></div>
                  </div>
                </div>
              )}

              <div className="rounded-md border p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs">Remarketing</Label>
                    <p className="text-[10px] text-muted-foreground">Enviar mensagem se o lead não responder</p>
                  </div>
                  <Switch checked={!!rm.enabled} onCheckedChange={(v) => setRm({ enabled: v })} />
                </div>
                {rm.enabled && (
                  <>
                    <Label className="text-xs">Disparar após</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div><Input type="number" min={0} value={rh} onChange={(e) => setRmHMS(Number(e.target.value), rmin, rs)} /><p className="text-[10px] text-center text-muted-foreground mt-0.5">horas</p></div>
                      <div><Input type="number" min={0} max={59} value={rmin} onChange={(e) => setRmHMS(rh, Number(e.target.value), rs)} /><p className="text-[10px] text-center text-muted-foreground mt-0.5">min</p></div>
                      <div><Input type="number" min={0} max={59} value={rs} onChange={(e) => setRmHMS(rh, rmin, Number(e.target.value))} /><p className="text-[10px] text-center text-muted-foreground mt-0.5">seg</p></div>
                    </div>
                    <Label className="text-xs">Mensagem de remarketing</Label>
                    <Textarea rows={3} value={rm.text ?? ""} onChange={(e) => setRm({ text: e.target.value })} placeholder="Ex: Oi! Vi que você não respondeu, ainda quer continuar?" />
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {node.type === "delay" && (() => {
          const total = Math.max(1, Math.min(86400, Number(d.seconds ?? 2)));
          const h = Math.floor(total / 3600);
          const m = Math.floor((total % 3600) / 60);
          const s = total % 60;
          const setHMS = (nh: number, nm: number, ns: number) =>
            onChange({ seconds: Math.max(1, Math.min(86400, nh * 3600 + nm * 60 + ns)) });
          return (
            <div className="space-y-1.5">
              <Label className="text-xs">Duração da espera (até 24h)</Label>
              <div className="grid grid-cols-3 gap-1.5">
                <div><Input type="number" min={0} max={24} value={h} onChange={(e) => setHMS(Number(e.target.value), m, s)} /><p className="text-[10px] text-center text-muted-foreground mt-0.5">horas</p></div>
                <div><Input type="number" min={0} max={59} value={m} onChange={(e) => setHMS(h, Number(e.target.value), s)} /><p className="text-[10px] text-center text-muted-foreground mt-0.5">min</p></div>
                <div><Input type="number" min={0} max={59} value={s} onChange={(e) => setHMS(h, m, Number(e.target.value))} /><p className="text-[10px] text-center text-muted-foreground mt-0.5">seg</p></div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Até 30s o fluxo aguarda no mesmo passo. Acima disso, é agendado e retomado depois.
              </p>
            </div>
          );
        })()}

        {node.type === "condition" && (() => {
          const opt = conditionOption(d.operator);
          return (
            <>
              <div className="space-y-1.5">
                <Label>Condição</Label>
                <Select
                  value={opt.value}
                  onValueChange={(v) => {
                    const next = conditionOption(v);
                    onChange({ operator: v, value: next.needsValue ? (d.value ?? "") : "" });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CONDITION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {opt.needsValue && (
                <div className="space-y-1.5">
                  <Label>Valor</Label>
                  <Input
                    type={opt.needsValue === "number" ? "number" : "text"}
                    value={d.value ?? ""}
                    onChange={(e) => onChange({ value: e.target.value })}
                    placeholder={
                      opt.value === "text_word_count_gte" ? "Ex: 5"
                      : opt.value === "text_regex" ? "Ex: ^oi"
                      : opt.value === "button_id_equals" ? "ID do botão"
                      : "Ex: preço"
                    }
                  />
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Saída <b className="text-emerald-500">verdadeiro</b> se a condição bater, senão <b className="text-red-500">falso</b>.
              </p>
            </>
          );
        })()}

        {node.type === "random" && (() => {
          const outs: Array<{ id: string; weight: number }> = Array.isArray(d.outputs) ? d.outputs : [];
          const total = outs.reduce((a, o) => a + Math.max(0, Number(o.weight ?? 0)), 0);
          function setCount(n: number) {
            const count = Math.max(2, Math.min(10, n));
            const equal = Math.floor((100 / count) * 100) / 100;
            const next: Array<{ id: string; weight: number }> = [];
            for (let i = 0; i < count; i++) {
              const prev = outs[i];
              next.push({
                id: prev?.id ?? `r-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
                weight: equal,
              });
            }
            // Ajusta resto pra somar 100
            const diff = 100 - next.reduce((a, o) => a + o.weight, 0);
            next[next.length - 1].weight = Math.round((next[next.length - 1].weight + diff) * 100) / 100;
            onChange({ outputs: next });
          }
          function setWeight(i: number, v: number) {
            const arr = outs.map((o) => ({ ...o }));
            arr[i].weight = Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
            onChange({ outputs: arr });
          }
          function distributeEqually() {
            setCount(outs.length || 2);
          }
          return (
            <>
              <div className="space-y-1.5">
                <Label>Número de saídas (2 a 10)</Label>
                <Input
                  type="number" min={2} max={10}
                  value={outs.length || 2}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Probabilidades (%)</Label>
                  <Button type="button" size="sm" variant="ghost" onClick={distributeEqually} className="h-6 text-xs">
                    Distribuir igualmente
                  </Button>
                </div>
                {outs.map((o, i) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Saída {i + 1}</span>
                    <Input
                      type="number" min={0} max={100} step={0.1}
                      value={o.weight}
                      onChange={(e) => setWeight(i, Number(e.target.value))}
                      className="h-8"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                ))}
                <p className={`text-[11px] ${Math.abs(total - 100) < 0.5 ? "text-muted-foreground" : "text-amber-500"}`}>
                  Total: {total.toFixed(1)}% {Math.abs(total - 100) >= 0.5 && "— pesos serão normalizados na execução"}
                </p>
              </div>
            </>
          );
        })()}

        {node.type === "trigger" && (
          <p className="text-xs text-muted-foreground">Configure os gatilhos no painel esquerdo. Conecte a saída deste nó pro primeiro bloco do fluxo.</p>
        )}
        {node.type === "end" && (
          <p className="text-xs text-muted-foreground">Encerra a execução do fluxo neste ponto.</p>
        )}
        {node.type === "tag_action" && <TagActionInspector d={d} onChange={onChange} />}
      </div>
    </aside>
  );
}

function TagActionInspector({ d, onChange }: { d: any; onChange: (patch: any) => void }) {
  const { data: tags = [], isLoading } = useCrmTags(undefined);
  const addSet = new Set<string>(d.addTags ?? []);
  const removeSet = new Set<string>(d.removeTags ?? []);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return Array.from(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Ações opcionais. Configura uma ou as duas — o bloco aplica ao lead do CRM (matching pelo telefone).
      </p>
      {isLoading && <p className="text-xs">Carregando etiquetas…</p>}
      {!isLoading && tags.length === 0 && (
        <p className="text-xs text-amber-600">Nenhuma etiqueta criada ainda. Vá no CRM → Etiquetas.</p>
      )}
      {tags.length > 0 && (
        <>
          <div>
            <Label className="text-xs text-emerald-600">➕ Adicionar etiquetas</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {tags.map((t: CrmTag) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange({ addTags: toggle(addSet, t.id) })}
                  className={`px-2 py-1 rounded-md text-xs border ${addSet.has(t.id) ? "ring-2 ring-emerald-500" : "opacity-60 hover:opacity-100"}`}
                  style={{ backgroundColor: t.cor, color: "white", borderColor: t.cor }}
                >
                  {t.nome}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-rose-600">➖ Remover etiquetas</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {tags.map((t: CrmTag) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange({ removeTags: toggle(removeSet, t.id) })}
                  className={`px-2 py-1 rounded-md text-xs border ${removeSet.has(t.id) ? "ring-2 ring-rose-500" : "opacity-60 hover:opacity-100"}`}
                  style={{ backgroundColor: t.cor, color: "white", borderColor: t.cor }}
                >
                  {t.nome}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function defaultDataFor(type: string, label: string): any {
  switch (type) {
    case "send_text": return { text: "Olá! 👋" };
    case "send_buttons": return { text: "Escolha uma opção:", buttons: [{ id: `btn-${Date.now()}-1`, label: "Opção 1" }] };
    case "wait_message": return { timeoutSeconds: 86400, infinite: false, remarketing: { enabled: false, afterSeconds: 3600, text: "" } };
    case "delay": return { seconds: 2 };
    case "condition": return { operator: "text_contains", value: "" };
    case "random": {
      const a = `r-${Date.now()}-a`;
      const b = `r-${Date.now()}-b`;
      return { outputs: [{ id: a, weight: 50 }, { id: b, weight: 50 }] };
    }
    case "tag_action": return { addTags: [], removeTags: [] };
    case "send_document": return { mediaUrl: "", filename: "" };
    default: return { label };
  }
}
