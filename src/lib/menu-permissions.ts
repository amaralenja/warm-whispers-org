// Estrutura compartilhada do menu/permissões para vendedores.
// Mantém a mesma forma usada no app-sidebar e no dialog de gerenciamento.

export type MenuLeaf = { key: string; title: string; url: string };
export type MenuGroup = { key: string; title: string; children: MenuLeaf[] };
export type MenuNode = MenuLeaf | MenuGroup;

export const MENU_TREE: MenuNode[] = [
  { key: "dashboard", title: "Dashboard", url: "/dashboard" },
  { key: "relatorios", title: "Relatórios", url: "/relatorios" },
  { key: "ranking", title: "Ranking", url: "/ranking" },
  { key: "ranking-tv", title: "Ranking TV", url: "/ranking-tv" },
  { key: "financeiro", title: "Financeiro", url: "/financeiro" },
  { key: "tasks", title: "Tarefas", url: "/tasks" },
  { key: "comissoes", title: "Comissões", url: "/comissoes" },
  { key: "sops", title: "SOPs / Processos", url: "/sops" },
  {
    key: "operacao-x1",
    title: "Operação X1",
    children: [
      { key: "crm", title: "CRM Leads X1", url: "/crm" },
      { key: "vendedores", title: "Vendedores", url: "/vendedores" },
      { key: "whatsapp", title: "WhatsApp", url: "/whatsapp" },
      { key: "chat", title: "Chat ao Vivo", url: "/chat" },
      { key: "flows", title: "Fluxos", url: "/flows" },
      { key: "x1-analytics", title: "Analytics X1", url: "/x1-analytics" },
      { key: "remarketing", title: "Remarketing 24h", url: "/remarketing" },
    ],
  },
  {
    key: "high-ticket",
    title: "High Ticket",
    children: [
      { key: "ht-analytics", title: "Analytics", url: "/ht-analytics" },
      { key: "ht-utm", title: "Gerador de UTM", url: "/ht-utm" },
      { key: "ht-sdr-metrics", title: "Métricas SDR", url: "/ht-sdr-metrics" },
      { key: "ht-kanban-sdr", title: "Kanban SDR", url: "/ht-kanban-sdr" },
      { key: "ht-kanban-closer", title: "Kanban Closer", url: "/ht-kanban-closer" },
      { key: "calendar", title: "Calendário Calls", url: "/calendar" },
      { key: "ht-customer-success", title: "Sucesso do Cliente", url: "/ht-customer-success" },
      { key: "quiz", title: "Quiz", url: "/quiz" },
      { key: "meta-ads", title: "Facebook Ads", url: "/meta-ads" },
      { key: "ht-saas", title: "SaaS em Construção", url: "/ht-saas" },
      { key: "ht-api", title: "API", url: "/ht-api" },
    ],
  },
  {
    key: "pv24h",
    title: "Operação PV24H",
    children: [
      { key: "pv24h-analytics", title: "Analytics", url: "/pv24h-analytics" },
    ],
  },

];

export type Permissoes = Record<string, boolean | Record<string, boolean>>;

/** Admin (sem permissoes setadas) enxerga tudo via canSee. Esta é a baseline para NOVOS vendedores. */
export function defaultPermissoes(): Permissoes {
  const p: Permissoes = {};
  for (const n of MENU_TREE) {
    if ("children" in n) {
      const sub: Record<string, boolean> = {};
      // Por padrão tudo desligado…
      for (const c of n.children) sub[c.key] = false;
      // …menos os essenciais de Operação X1: CRM e WhatsApp.
      if (n.key === "operacao-x1") {
        sub["crm"] = true;
        sub["whatsapp"] = true;
      }
      p[n.key] = sub;
    } else {
      if (n.key === "tasks") { p[n.key] = true; continue; }
      p[n.key] = false;
    }
  }
  return p;
}

/** Default para SDRs e Closers: só enxergam High Ticket com o Analytics + o kanban da função. */
export function htDefaultPermissoes(tipo: "sdr" | "closer"): Permissoes {
  const p: Permissoes = {};
  for (const n of MENU_TREE) {
    if ("children" in n) {
      const sub: Record<string, boolean> = {};
      for (const c of n.children) sub[c.key] = false;
      if (n.key === "high-ticket") {
        sub["ht-analytics"] = true;
        sub["ht-utm"] = true;
        sub[tipo === "sdr" ? "ht-kanban-sdr" : "ht-kanban-closer"] = true;
        if (tipo === "sdr") {
          sub["quiz"] = true;
          sub["ht-sdr-metrics"] = true;
        }
      }
      p[n.key] = sub;
    } else {
      p[n.key] = n.key === "tasks";
    }
  }
  return p;
}

export function mergePermissoes(base: Permissoes, cur: Permissoes): Permissoes {
  const merged = { ...base };
  for (const k of Object.keys(base)) {
    const val = cur[k];
    if (val !== undefined && val !== null) {
      if (typeof base[k] === "object" && typeof val === "object" && val !== null) {
        merged[k] = { ...base[k] as any, ...val as any };
      } else {
        merged[k] = val;
      }
    }
  }
  for (const k of Object.keys(cur)) {
    if (merged[k] === undefined && cur[k] !== null && cur[k] !== undefined) {
      merged[k] = cur[k];
    }
  }
  return merged;
}

/** Grupos/leaves que são exclusivos do admin — vendedor NUNCA vê, mesmo sem permissão setada. */
const ADMIN_ONLY_GROUPS = new Set(["pv24h"]);
const ADMIN_ONLY_LEAVES = new Set(["pv24h-analytics", "comissoes", "ht-team", "ht-customer-success", "ht-saas"]);

/** Default = true se não setado (admin enxerga tudo), exceto grupos/leaves admin-only. */
export function canSee(perm: Permissoes | null | undefined, groupKey: string, leafKey?: string): boolean {
  if (!perm || typeof perm !== "object") return true;
  if (groupKey === "comissoes" && !leafKey) {
    const opX1 = perm["operacao-x1"];
    if (opX1 && typeof opX1 === "object") {
      return (opX1 as any)["comissoes"] === true;
    }
    return false;
  }
  if (ADMIN_ONLY_GROUPS.has(groupKey) && (perm[groupKey] === undefined || perm[groupKey] === null)) return false;
  if (leafKey && ADMIN_ONLY_LEAVES.has(leafKey)) {
    const node = perm[groupKey];
    if (node === undefined || node === null || typeof node === "boolean") return false;
    return (node as any)[leafKey] === true;
  }
  const node = perm[groupKey];
  if (node === undefined || node === null) return true;
  if (typeof node === "boolean") return node;
  if (leafKey == null) {
    if (typeof node !== "object") return !!node;
    return Object.values(node).some((v) => v !== false);
  }
  if (typeof node !== "object") return !!node;
  const v = (node as any)[leafKey];
  return v === undefined ? true : !!v;
}

