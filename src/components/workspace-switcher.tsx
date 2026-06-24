import { Check, ChevronsUpDown, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function WorkspaceSwitcher() {
  const { workspaces, workspace, setWorkspaceId, addWorkspace, removeWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const initials = (s: string) =>
    s.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  function handleCreate() {
    const n = name.trim();
    if (!n) return;
    addWorkspace(n);
    setName("");
    setCreating(false);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 text-left transition-colors hover:bg-card"
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-md ${workspace.accent.bg} ${workspace.accent.text} ring-1 ${workspace.accent.ring} text-xs font-semibold`}
          >
            {initials(workspace.nome)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </div>
            <div className="truncate text-sm font-medium text-foreground">
              {workspace.nome}
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 border-border bg-popover p-1">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
            Workspaces
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {workspaces.map((w) => {
            const active = w.id === workspace.id;
            return (
              <div
                key={w.id}
                className={`group/item flex items-center gap-2 rounded-md px-1 transition-colors hover:bg-secondary/50 ${active ? "bg-secondary/30" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceId(w.id);
                    setOpen(false);
                  }}
                  className="flex flex-1 items-center gap-3 py-2 text-left"
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${w.accent.bg} ${w.accent.text} ring-1 ${w.accent.ring} text-[0.65rem] font-semibold`}
                  >
                    {initials(w.nome)}
                  </div>
                  <span className="flex-1 truncate text-sm text-foreground">{w.nome}</span>
                  {active && <Check className="h-4 w-4 text-muted-foreground" />}
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
