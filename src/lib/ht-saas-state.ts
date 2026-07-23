// Estado e persistência local/servidor para SaaS em Construção
export type SaasFase = "planejamento" | "desenvolvimento" | "testes" | "lancado" | "pausado";

export type SaasNote = {
  id: string;
  saasId: string;
  autor: string;
  tipo: "anotacao" | "dev_update" | "bug" | "milestone";
  conteudo: string;
  created_at: string;
};

export type SaasProject = {
  id: string;
  nome: string;
  linkSaas?: string | null;
  nomeGrupo?: string | null;
  linkGrupo?: string | null;
  fase: SaasFase;
  devResponsavel?: string | null;
  progressoPct?: number;
  descricao?: string | null;
  created_at: string;
  updated_at: string;
  notes?: SaasNote[];
};

const LS_KEY_PROJECTS = "multium_ht_saas_projects_v1";
const LS_KEY_NOTES = "multium_ht_saas_notes_v1";

function emitChange() {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event("multium-ht-saas-updated"));
    } catch {}
  }
}

export function loadLocalSaasProjects(): SaasProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY_PROJECTS);
    if (!raw) return getInitialDefaultSaasProjects();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : getInitialDefaultSaasProjects();
  } catch {
    return getInitialDefaultSaasProjects();
  }
}

export function saveLocalSaasProjects(projects: SaasProject[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY_PROJECTS, JSON.stringify(projects));
    emitChange();
  } catch {}
}

export function loadLocalSaasNotes(saasId: string): SaasNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY_NOTES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, SaasNote[]>;
    return parsed[saasId] || [];
  } catch {
    return [];
  }
}

export function saveLocalSaasNote(note: SaasNote) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_KEY_NOTES);
    const parsed: Record<string, SaasNote[]> = raw ? JSON.parse(raw) : {};
    const list = parsed[note.saasId] || [];
    parsed[note.saasId] = [note, ...list];
    localStorage.setItem(LS_KEY_NOTES, JSON.stringify(parsed));
    emitChange();
  } catch {}
}

export function deleteLocalSaasNote(saasId: string, noteId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_KEY_NOTES);
    if (!raw) return;
    const parsed: Record<string, SaasNote[]> = JSON.parse(raw);
    if (parsed[saasId]) {
      parsed[saasId] = parsed[saasId].filter((n) => n.id !== noteId);
      localStorage.setItem(LS_KEY_NOTES, JSON.stringify(parsed));
      emitChange();
    }
  } catch {}
}

function getInitialDefaultSaasProjects(): SaasProject[] {
  const now = new Date().toISOString();
  const initial: SaasProject[] = [
    {
      id: "saas-multium-ai",
      nome: "Multium AI Chatbot & Agent",
      linkSaas: "https://multium.vercel.app/chat",
      nomeGrupo: "Grupo Dev Multium",
      linkGrupo: "https://chat.whatsapp.com/demo",
      fase: "desenvolvimento",
      devResponsavel: "Equipe Antigravity / Victor",
      progressoPct: 75,
      descricao: "Plataforma de disparo e atendimento automatizado com Webhook e IA integrada.",
      created_at: now,
      updated_at: now,
    },
    {
      id: "saas-cakto-hub",
      nome: "Cakto Sales Hub & Webhook PV24H",
      linkSaas: "https://multium.vercel.app/pv24h-analytics",
      nomeGrupo: "VIP Operação PV24H",
      linkGrupo: "https://chat.whatsapp.com/demo2",
      fase: "testes",
      devResponsavel: "DEV Principal",
      progressoPct: 90,
      descricao: "Hub de recepção de pagamentos com rastreamento detalhado de UTMs Orgânicas vs Tráfego Pago.",
      created_at: now,
      updated_at: now,
    },
  ];
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LS_KEY_PROJECTS, JSON.stringify(initial));
    } catch {}
  }
  return initial;
}
