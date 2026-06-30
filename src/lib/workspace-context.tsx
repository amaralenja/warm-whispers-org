import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { allowedWorkspaceIdsFromSession, getVendorSession, type VendorSession } from "@/lib/vendor-session";

export type WorkspaceAccent = {
  ring: string;
  bar: string;
  text: string;
  bg: string;
  border: string;
  // Hex usado pra gradiente suave nos cards e no avatar
  hex: string;
};

export type Workspace = {
  id: string; // "all" | expert nome | custom slug
  nome: string;
  accent: WorkspaceAccent;
  accentIndex: number; // índice em ACCENTS
  photo?: string | null; // dataURL
  custom?: boolean;
};

export const ACCENTS: WorkspaceAccent[] = [
  { ring: "ring-blue-500/60",    bar: "bg-blue-500",    text: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30",    hex: "#3b82f6" },
  { ring: "ring-orange-500/60",  bar: "bg-orange-500",  text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  hex: "#f97316" },
  { ring: "ring-emerald-500/60", bar: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", hex: "#10b981" },
  { ring: "ring-fuchsia-500/60", bar: "bg-fuchsia-500", text: "text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30", hex: "#d946ef" },
  { ring: "ring-amber-500/60",   bar: "bg-amber-500",   text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   hex: "#f59e0b" },
  { ring: "ring-rose-500/60",    bar: "bg-rose-500",    text: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30",    hex: "#f43f5e" },
  { ring: "ring-cyan-500/60",    bar: "bg-cyan-500",    text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/30",    hex: "#06b6d4" },
  { ring: "ring-violet-500/60",  bar: "bg-violet-500",  text: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30",  hex: "#8b5cf6" },
];

const ACCENT_ALL: WorkspaceAccent = {
  ring: "ring-accent/60", bar: "bg-accent", text: "text-accent", bg: "bg-accent/10", border: "border-accent/30", hex: "#e94560",
};

export const BASE_WORKSPACES: Workspace[] = [
  { id: "all",     nome: "Geral",   accent: ACCENT_ALL,  accentIndex: -1 },
  { id: "Caio",    nome: "Caio",    accent: ACCENTS[0],  accentIndex: 0 },
  { id: "Gustavo", nome: "Gustavo", accent: ACCENTS[1],  accentIndex: 1 },
  { id: "Jessica", nome: "Jessica", accent: ACCENTS[2],  accentIndex: 2 },
];

const LIST_KEY = "multium.workspace.list";
const ACTIVE_KEY = "multium.workspace";
const OVERRIDES_KEY = "multium.workspace.overrides"; // edição de base workspaces

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `ws-${Date.now()}`;
}

type Override = { accentIndex?: number; photo?: string | null };
type Overrides = Record<string, Override>;

type Ctx = {
  workspaces: Workspace[];
  workspace: Workspace;
  setWorkspaceId: (id: string) => void;
  addWorkspace: (nome: string) => Workspace;
  removeWorkspace: (id: string) => void;
  updateWorkspace: (id: string, patch: { accentIndex?: number; photo?: string | null }) => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

type StoredCustom = { id: string; nome: string; accentIndex: number; photo?: string | null };

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [custom, setCustom] = useState<StoredCustom[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [activeId, setActiveId] = useState<string>("all");
  const [vendorSession, setVendorSession] = useState<VendorSession | null>(null);

  useEffect(() => {
    try {
      const rawList = localStorage.getItem(LIST_KEY);
      if (rawList) {
        const parsed = JSON.parse(rawList);
        if (Array.isArray(parsed)) setCustom(parsed);
      }
      const rawOver = localStorage.getItem(OVERRIDES_KEY);
      if (rawOver) {
        const parsed = JSON.parse(rawOver);
        if (parsed && typeof parsed === "object") setOverrides(parsed);
      }
      const saved = localStorage.getItem(ACTIVE_KEY);
      if (saved) setActiveId(saved);
      setVendorSession(getVendorSession());
    } catch {}
  }, []);

  useEffect(() => {
    const refreshVendor = () => setVendorSession(getVendorSession());
    window.addEventListener("storage", refreshVendor);
    window.addEventListener("vendor-session-updated", refreshVendor as EventListener);
    return () => {
      window.removeEventListener("storage", refreshVendor);
      window.removeEventListener("vendor-session-updated", refreshVendor as EventListener);
    };
  }, []);

  function applyOverride(base: Workspace): Workspace {
    const o = overrides[base.id];
    if (!o) return base;
    const idx = o.accentIndex != null ? o.accentIndex : base.accentIndex;
    return {
      ...base,
      accentIndex: idx,
      accent: idx >= 0 && idx < ACCENTS.length ? ACCENTS[idx] : base.accent,
      photo: o.photo ?? base.photo ?? null,
    };
  }

  const baseWithOverrides = BASE_WORKSPACES.map(applyOverride);
  const customResolved: Workspace[] = (custom ?? [])
    .filter((p) => p && typeof p.id === "string" && typeof p.nome === "string")
    .map((p) => {
      const idx = typeof p.accentIndex === "number" && p.accentIndex >= 0 ? p.accentIndex : 0;
      return {
        id: p.id,
        nome: p.nome,
        accentIndex: idx,
        accent: ACCENTS[idx % ACCENTS.length] ?? ACCENTS[0],
        photo: p.photo ?? null,
        custom: true,
      };
    });
  const allWorkspaces = useMemo(() => [...baseWithOverrides, ...customResolved], [baseWithOverrides, customResolved]);
  const workspaces = useMemo(() => {
    if (!vendorSession) return allWorkspaces;
    const allowed = new Set(allowedWorkspaceIdsFromSession(vendorSession));
    return allWorkspaces.filter((w) => w.id !== "all" && (allowed.has(w.id) || allowed.has(w.nome)));
  }, [allWorkspaces, vendorSession]);
  const fallbackWorkspace = allWorkspaces.find((w) => w.id !== "all") ?? allWorkspaces[0];
  const workspace = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? fallbackWorkspace;

  useEffect(() => {
    if (!workspace) return;
    if (!workspaces.some((w) => w.id === activeId)) {
      setActiveId(workspace.id);
      try { localStorage.setItem(ACTIVE_KEY, workspace.id); } catch {}
    }
  }, [activeId, workspace?.id, workspaces]);

  function persistCustom(next: StoredCustom[]) {
    try { localStorage.setItem(LIST_KEY, JSON.stringify(next)); } catch {}
  }
  function persistOverrides(next: Overrides) {
    try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next)); } catch {}
  }

  function setWorkspaceId(next: string) {
    const target = workspaces.find((w) => w.id === next);
    if (vendorSession && !target) return;
    setActiveId(next);
    try { localStorage.setItem(ACTIVE_KEY, next); } catch {}
  }

  function addWorkspace(nome: string): Workspace {
    const cleanName = nome.trim();
    let id = slugify(cleanName);
    const taken = new Set(workspaces.map((w) => w.id));
    let i = 2;
    while (taken.has(id)) { id = `${slugify(cleanName)}-${i++}`; }
    const accentIndex = (custom.length + 3) % ACCENTS.length;
    const stored: StoredCustom = { id, nome: cleanName, accentIndex, photo: null };
    const nextCustom = [...custom, stored];
    setCustom(nextCustom);
    persistCustom(nextCustom);
    setWorkspaceId(id);
    return { ...stored, accent: ACCENTS[accentIndex], custom: true };
  }

  function removeWorkspace(id: string) {
    const nextCustom = custom.filter((w) => w.id !== id);
    setCustom(nextCustom);
    persistCustom(nextCustom);
    if (activeId === id) setWorkspaceId("all");
  }

  function updateWorkspace(id: string, patch: { accentIndex?: number; photo?: string | null }) {
    // Custom workspace? altera no array
    const inCustom = custom.find((c) => c.id === id);
    if (inCustom) {
      const next = custom.map((c) =>
        c.id === id
          ? { ...c, accentIndex: patch.accentIndex ?? c.accentIndex, photo: patch.photo !== undefined ? patch.photo : c.photo }
          : c,
      );
      setCustom(next);
      persistCustom(next);
      return;
    }
    // Base workspace? salva override
    const prev = overrides[id] ?? {};
    const merged: Override = {
      accentIndex: patch.accentIndex ?? prev.accentIndex,
      photo: patch.photo !== undefined ? patch.photo : prev.photo,
    };
    const nextOver = { ...overrides, [id]: merged };
    setOverrides(nextOver);
    persistOverrides(nextOver);
  }

  return (
    <WorkspaceContext.Provider value={{ workspaces, workspace, setWorkspaceId, addWorkspace, removeWorkspace, updateWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export const WORKSPACES = BASE_WORKSPACES;
