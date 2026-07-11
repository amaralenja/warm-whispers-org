import { Check, ChevronsUpDown, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWorkspace, ACCENTS, type Workspace } from "@/lib/workspace-context";
import { getVendorSession } from "@/lib/vendor-session";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function initials(s: string) {
  return s.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Gradiente suave a partir do hex do accent
function gradientStyle(hex: string): React.CSSProperties {
  return {
    backgroundImage: `linear-gradient(135deg, ${hex}33, ${hex}11)`,
    boxShadow: `inset 0 0 0 1px ${hex}55`,
  };
}

export function WorkspaceSwitcher() {
  const { workspaces, workspace, setWorkspaceId, addWorkspace, removeWorkspace, updateWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isVendor, setIsVendor] = useState(false);

  useEffect(() => {
    setIsVendor(!!getVendorSession());
  }, []);

  function handleCreate() {
    const n = name.trim();
    if (!n) return;
    addWorkspace(n);
    setName("");
    setCreating(false);
    setOpen(false);
  }

  const hex = workspace?.accent?.hex ?? "#e94560";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={{ ["--ws-accent" as any]: hex }}
          className="group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border border-border bg-card/40 px-3 py-2 text-left transition-all hover:border-[color:var(--ws-accent)]/40 hover:bg-[color:var(--ws-accent)]/[0.06] hover:shadow-[inset_0_0_0_1px_var(--ws-accent)]/20"
        >
          <Avatar ws={workspace} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </div>
            <div className="truncate text-sm font-medium text-foreground">
              {workspace?.nome}
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-[color:var(--ws-accent)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 border-border bg-popover p-1">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
            Workspaces
          </span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {workspaces.map((w) => {
            const active = w.id === workspace?.id;
            const isEditing = editingId === w.id;
            const wHex = w.accent?.hex ?? "#e94560";
            return (
              <div key={w.id} style={{ ["--ws-accent" as any]: wHex }} className={`rounded-md ${active ? "bg-[color:var(--ws-accent)]/[0.08]" : ""}`}>
                <div className="group/item flex items-center gap-2 px-1 transition-colors hover:bg-[color:var(--ws-accent)]/[0.07] rounded-md">
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceId(w.id);
                      setOpen(false);
                    }}
                    className="flex flex-1 items-center gap-3 py-2 pl-1 text-left"
                  >
                    <Avatar ws={w} size={28} />
                    <span className="flex-1 truncate text-sm text-foreground">{w.nome}</span>
                    {active && <Check className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(isEditing ? null : w.id);
                    }}
                    className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-secondary/70 hover:text-foreground group-hover/item:opacity-100"
                    aria-label={`Editar ${w.nome}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {w.custom && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeWorkspace(w.id);
                      }}
                      className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover/item:opacity-100"
                      aria-label={`Remover ${w.nome}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {isEditing && (
                  <EditPanel
                    ws={w}
                    onClose={() => setEditingId(null)}
                    onUpdate={(patch) => updateWorkspace(w.id, patch)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-1 border-t border-border p-1">
          {creating ? (
            <div className="flex items-center gap-1.5 p-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(false); setName(""); }
                }}
                placeholder="Nome do workspace"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handleCreate}
                className="rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-accent-foreground hover:brightness-110"
              >
                Criar
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setName(""); }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50"
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary/50"
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
              Novo workspace
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Avatar({ ws, size }: { ws: Workspace; size: number }) {
  const dim = { width: size, height: size };
  if (ws.photo) {
    return (
      <img
        src={ws.photo}
        alt={ws.nome}
        style={{ ...dim, boxShadow: `inset 0 0 0 1px ${ws.accent.hex}66` }}
        className="rounded-md object-cover"
      />
    );
  }
  return (
    <div
      style={{ ...dim, ...gradientStyle(ws.accent.hex), color: ws.accent.hex }}
      className="flex items-center justify-center rounded-md text-xs font-semibold"
    >
      {initials(ws.nome)}
    </div>
  );
}

function EditPanel({
  ws,
  onClose,
  onUpdate,
}: {
  ws: Workspace;
  onClose: () => void;
  onUpdate: (patch: { accentIndex?: number; photo?: string | null }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Imagem muito grande (máx 2MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onUpdate({ photo: reader.result as string });
    reader.readAsDataURL(file);
  }

  return (
    <div className="mb-1 ml-9 mr-2 rounded-md border border-border bg-background/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
          Personalizar
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-secondary/50"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Foto */}
      <div className="mt-2 flex items-center gap-3">
        <Avatar ws={ws} size={44} />
        <div className="flex flex-1 flex-col gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground hover:bg-secondary/50"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {ws.photo ? "Trocar foto" : "Enviar foto"}
          </button>
          {ws.photo && (
            <button
              type="button"
              onClick={() => onUpdate({ photo: null })}
              className="text-[0.65rem] text-muted-foreground hover:text-destructive"
            >
              Remover foto
            </button>
          )}
        </div>
      </div>

      {/* Cores */}
      <div className="mt-3">
        <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
          Cor
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ACCENTS.map((a, i) => {
            const active = ws.accentIndex === i;
            return (
              <button
                key={a.hex}
                type="button"
                onClick={() => onUpdate({ accentIndex: i })}
                aria-label={`Cor ${i + 1}`}
                className="relative h-6 w-6 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${a.hex}, ${a.hex}99)`,
                  boxShadow: active ? `0 0 0 2px ${a.hex}, 0 0 0 4px hsl(var(--background))` : `inset 0 0 0 1px ${a.hex}88`,
                }}
              >
                {active && <Check className="absolute inset-0 m-auto h-3 w-3 text-white" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
