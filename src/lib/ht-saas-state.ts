// Estado e persistência local/servidor para SaaS em Construção + Ajustes Urgentes / Por Fora
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

export type AjustePrioridade = "urgente" | "alta" | "media" | "baixa";
export type AjusteStatus = "pendente" | "em_andamento" | "resolvido";

export type AjusteMedia = {
  id: string;
  type: "image" | "video";
  url: string;
  name?: string;
};

export type AjusteUrgente = {
  id: string;
  saasId?: string | null;
  saasNome?: string | null;
  titulo: string;
  solicitante?: string | null;
  devResponsavel?: string | null;
  prioridade: AjustePrioridade;
  status: AjusteStatus;
  descricao?: string | null;
  prazo?: string | null;
  midias?: AjusteMedia[];
  created_at: string;
  updated_at: string;
};

const LS_KEY_PROJECTS = "multium_ht_saas_projects_v1";
const LS_KEY_NOTES = "multium_ht_saas_notes_v1";
const LS_KEY_AJUSTES = "multium_ht_saas_ajustes_v1";

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

// PERSISTÊNCIA DE AJUSTES URGENTES / POR FORA
export function loadLocalAjustesUrgentes(): AjusteUrgente[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY_AJUSTES);
    if (!raw) return getInitialDefaultAjustes();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : getInitialDefaultAjustes();
  } catch {
    return getInitialDefaultAjustes();
  }
}

export function saveLocalAjustesUrgentes(ajustes: AjusteUrgente[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY_AJUSTES, JSON.stringify(ajustes));
    emitChange();
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

function getInitialDefaultAjustes(): AjusteUrgente[] {
  const now = new Date().toISOString();
  const initial: AjusteUrgente[] = [
    {
      id: "ajuste-1",
      saasId: "saas-multium-ai",
      saasNome: "Multium AI Chatbot & Agent",
      titulo: "Fix no travamento de digitação no Chat ao Vivo e busca por texto",
      solicitante: "Vendedores / Victor",
      devResponsavel: "Antigravity DEV",
      prioridade: "urgente",
      status: "resolvido",
      descricao: "Vendedores relataram travamento ao digitar. Aplicado debounce e otimização de busca em mensagens.",
      prazo: "Imediato",
      created_at: now,
      updated_at: now,
    },
    {
      id: "ajuste-2",
      saasId: "saas-cakto-hub",
      saasNome: "Cakto Sales Hub & Webhook PV24H",
      titulo: "Filtro de Vendas da Cakto por e-mail no PV24H Analytics",
      solicitante: "Gerência",
      devResponsavel: "DEV Principal",
      prioridade: "alta",
      status: "resolvido",
      descricao: "Remover testes do e-mail john.doe@example.com para trazer apenas vendas reais.",
      prazo: "Hoje",
      created_at: now,
      updated_at: now,
    },
    {
      id: "ajuste-3",
      saasId: "saas-multium-ai",
      saasNome: "Multium AI Chatbot & Agent",
      titulo: "Alerta visual de lead repetido / atendido por outro vendedor",
      solicitante: "Closers & SDRs",
      devResponsavel: "Antigravity DEV",
      prioridade: "alta",
      status: "em_andamento",
      descricao: "Exibir aviso destacado quando o lead já foi atendido por outro vendedor em qualquer canal.",
      prazo: "Amanhã",
      created_at: now,
      updated_at: now,
    },
  ];
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LS_KEY_AJUSTES, JSON.stringify(initial));
    } catch {}
  }
  return initial;
}
