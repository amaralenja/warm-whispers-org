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
  const firstName = sessNome.split(/\s+/)[0] ?? "";
  if (!sessEmail && !firstName) return true;

  const c = typeof candidate === "string" ? { nome: candidate } : (candidate ?? {});
  const email = norm(c.email);
  const nome = norm(c.nome);
  const disp = norm(c.displayName);

  if (sessEmail && (email === sessEmail || disp.includes(sessEmail) || nome.includes(sessEmail))) return true;
  if (!firstName) return false;
  const hay = `${nome} ${disp} ${email}`;
  return hay.includes(firstName);
}
