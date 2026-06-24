import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Workspace = {
  id: string; // "all" | expert name
  nome: string;
  accent: { ring: string; bar: string; text: string; bg: string; border: string };
};

export const WORKSPACES: Workspace[] = [
  {
    id: "all",
    nome: "Geral",
    accent: {
      ring: "ring-accent/60",
      bar: "bg-accent",
      text: "text-accent",
      bg: "bg-accent/10",
      border: "border-accent/30",
    },
  },
  {
    id: "Caio",
    nome: "Caio",
    accent: {
      ring: "ring-blue-500/60",
      bar: "bg-blue-500",
      text: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
    },
  },
  {
    id: "Gustavo",
    nome: "Gustavo",
    accent: {
      ring: "ring-orange-500/60",
      bar: "bg-orange-500",
      text: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
    },
  },
  {
    id: "Jessica",
    nome: "Jessica",
    accent: {
      ring: "ring-emerald-500/60",
      bar: "bg-emerald-500",
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    },
  },
];

const STORAGE_KEY = "multium.workspace";

type Ctx = {
  workspace: Workspace;
  setWorkspaceId: (id: string) => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string>("all");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && WORKSPACES.some((w) => w.id === saved)) setId(saved);
    } catch {}
  }, []);

  function setWorkspaceId(next: string) {
    setId(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  const workspace = WORKSPACES.find((w) => w.id === id) ?? WORKSPACES[0];

  return (
    <WorkspaceContext.Provider value={{ workspace, setWorkspaceId }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
