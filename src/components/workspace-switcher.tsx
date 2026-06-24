import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useWorkspace, WORKSPACES } from "@/lib/workspace-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function WorkspaceSwitcher() {
  const { workspace, setWorkspaceId } = useWorkspace();
  const [open, setOpen] = useState(false);

  const initials = workspace.nome
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
            {initials}
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
      <PopoverContent
        align="start"
        className="w-64 border-border bg-popover p-1"
      >
        <div className="px-2 py-1.5 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
          Trocar workspace
        </div>
        {WORKSPACES.map((w) => {
          const wInitials = w.nome
            .split(" ")
            .map((c) => c[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const active = w.id === workspace.id;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                setWorkspaceId(w.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary/50"
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-md ${w.accent.bg} ${w.accent.text} ring-1 ${w.accent.ring} text-[0.65rem] font-semibold`}
              >
                {wInitials}
              </div>
              <span className="flex-1 text-sm text-foreground">{w.nome}</span>
              {active && <Check className="h-4 w-4 text-muted-foreground" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
