import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type WorkspaceAccent = {
  ring: string;
  bar: string;
  text: string;
  bg: string;
  border: string;
};

export type Workspace = {
  id: string; // "all" | expert nome | custom slug
  nome: string;
  accent: WorkspaceAccent;
  custom?: boolean;
};

const ACCENTS: WorkspaceAccent[] = [
  { ring: "ring-blue-500/60",    bar: "bg-blue-500",    text: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
  { ring: "ring-orange-500/60",  bar: "bg-orange-500",  text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30" },
  { ring: "ring-emerald-500/60", bar: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  { ring: "ring-fuchsia-500/60", bar: "bg-fuchsia-500", text: "text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30" },
  { ring: "ring-amber-500/60",   bar: "bg-amber-500",   text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  { ring: "ring-rose-500/60",    bar: "bg-rose-500",    text: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30" },
  { ring: "ring-cyan-500/60",    bar: "bg-cyan-500",    text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/30" },
  { ring: "ring-violet-500/60",  bar: "bg-violet-500",  text: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30" },
];

const ACCENT_ALL: WorkspaceAccent = {
  ring: "ring-accent/60", bar: "bg-accent", text: "text-accent", bg: "bg-accent/10", border: "border-accent/30",
};

export const BASE_WORKSPACES: Workspace[] = [
  { id: "all",     nome: "Geral",   accent: ACCENT_ALL },
  { id: "Caio",    nome: "Caio",    accent: ACCENTS[0] },
  { id: "Gustavo", nome: "Gustavo", accent: ACCENTS[1] },
  { id: "Jessica", nome: "Jessica", accent: ACCENTS[2] },
];

const LIST_KEY = "multium.workspace.list";
const ACTIVE_KEY = "multium.workspace";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `ws-${Date.now()}`;
}

type Ctx = {
  workspaces: Workspace[];
  workspace: Workspace;
  setWorkspaceId: (id: string) => void;
  addWorkspace: (nome: string) => Workspace;
  removeWorkspace: (id: string) => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [custom, setCustom] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string>("all");

  useEffect(() => {
    try {
      const rawList = localStorage.getItem(LIST_KEY);
      if (rawList) {
        const parsed: Array<{ id: string; nome: string; accentIndex: number }> = JSON.parse(rawList);
        setCustom(
          parsed.map((p) => ({
            id: p.id,
            nome: p.nome,
            accent: ACCENTS[p.accentIndex % ACCENTS.length],
            custom: true,
          })),
        );
      }
      const saved = localStorage.getItem(ACTIVE_KEY);
      if (saved) setActiveId(saved);
    } catch {}
  }, []);

  const workspaces = [...BASE_WORKSPACES, ...custom];
  const workspace = workspaces.find((w) => w.id === activeId) ?? BASE_WORKSPACES[0];

  function persistList(next: Workspace[]) {
    try {
      const serializable = next.map((w) => ({
        id: w.id,
        nome: w.nome,
        accentIndex: Math.max(0, ACCENTS.findIndex((a) => a.bar === w.accent.bar)),
      }));
      localStorage.setItem(LIST_KEY, JSON.stringify(serializable));
    } catch {}
  }

  function setWorkspaceId(next: string) {
    setActiveId(next);
    try { localStorage.setItem(ACTIVE_KEY, next); } catch {}
  }

  function addWorkspace(nome: string): Workspace {
    const cleanName = nome.trim();
    let id = slugify(cleanName);
    const taken = new Set(workspaces.map((w) => w.id));
    let i = 2;
    while (taken.has(id)) { id = `${slugify(cleanName)}-${i++}`; }
    const accent = ACCENTS[(custom.length + 3) % ACCENTS.length];
    const ws: Workspace = { id, nome: cleanName, accent, custom: true };
    const nextCustom = [...custom, ws];
    setCustom(nextCustom);
    persistList(nextCustom);
    setWorkspaceId(id);
    return ws;
  }

  function removeWorkspace(id: string) {
    const nextCustom = custom.filter((w) => w.id !== id);
    setCustom(nextCustom);
    persistList(nextCustom);
    if (activeId === id) setWorkspaceId("all");
  }

  return (
    <WorkspaceContext.Provider value={{ workspaces, workspace, setWorkspaceId, addWorkspace, removeWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

// Back-compat: anywhere still importing WORKSPACES gets the base list.
export const WORKSPACES = BASE_WORKSPACES;
