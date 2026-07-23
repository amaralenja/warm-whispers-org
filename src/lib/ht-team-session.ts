// Sessão do closer/SDR (ht_team) salva no localStorage pelo /auth
export type HtTeamSession = {
  id: number;
  nome?: string | null;
  tipo?: string | null; // "closer" | "sdr"
  email?: string | null;
  telefone?: string | null;
  foto_url?: string | null;
  codigo?: string | null;
  ativo?: boolean | null;
  permissoes?: unknown;
};

export function getHtTeamSession(): HtTeamSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("ht_team_session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    return s as HtTeamSession;
  } catch {
    return null;
  }
}

function norm(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

// True quando `haystack` (nome, email, displayName) casa com o closer da sessão.
// Regras: email exato > primeiro nome contido no displayName/email/nome.
export function matchesHtCloser(
  session: HtTeamSession | null,
  candidate: { nome?: string | null; email?: string | null; displayName?: string | null } | string | null | undefined,
): boolean {
  if (!session) return true; // sem sessão HT => admin/vendedor vê tudo
  const sessEmail = norm(session.email);
  const sessNome = norm(session.nome);
  const sessFirstName = sessNome.split(/\s+/)[0] ?? "";
  if (!sessEmail && !sessFirstName) return true;

  const c = typeof candidate === "string"
    ? (candidate.includes("@") ? { email: candidate } : { nome: candidate })
    : (candidate ?? {});

  const email = norm(c.email);
  const nome = norm(c.nome);
  const disp = norm(c.displayName);

  // 1. Match de e-mail (exato ou contido)
  if (sessEmail && email) {
    if (email === sessEmail || email.includes(sessEmail) || sessEmail.includes(email)) return true;
  }

  // 2. E-mail contido no nome/displayName do candidato
  if (sessEmail && (disp.includes(sessEmail) || nome.includes(sessEmail))) return true;
  if (email && (sessNome.includes(email) || sessFirstName.includes(email))) return true;

  // 3. Match por Primeiro Nome (ambas as direções)
  if (sessFirstName && sessFirstName.length >= 2) {
    const hay = `${nome} ${disp} ${email}`;
    if (hay.includes(sessFirstName)) return true;
    const candFirstName = (nome || disp || "").split(/\s+/)[0] ?? "";
    if (candFirstName && candFirstName.length >= 2 && sessNome.includes(candFirstName)) return true;
  }

  return false;
}
