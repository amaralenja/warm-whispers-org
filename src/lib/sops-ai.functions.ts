import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1";

const SYSTEM_IMPROVE = `Você é um editor de processos internos (SOPs) de uma empresa brasileira de vendas digitais.

Sua missão: pegar o texto bruto que o usuário escreveu e devolver uma versão MELHORADA, mais clara, organizada e profissional, SEM mudar a essência, o tom ou as ideias originais.

Regras OBRIGATÓRIAS:
- Mantenha 100% o sentido e as informações do que o usuário escreveu. Não invente passos, ferramentas, números ou políticas que não estavam ali.
- Português brasileiro natural, direto, de gente real. Pode usar "a gente", "tá", linguagem do dia a dia se o original já era assim.
- NUNCA use travessão (— ou –). Use vírgula, dois pontos, ponto final ou parênteses no lugar.
- Evite frases robóticas e clichês de IA tipo "no mundo de hoje", "é importante notar", "vamos mergulhar", "em conclusão".
- Estruture em Markdown: títulos com ##, listas com -, negrito com ** quando ajudar a destacar passos críticos.
- Se o original já tem estrutura, respeite. Só reorganize se ficar muito mais claro.
- Devolva APENAS o markdown do processo melhorado. Sem comentários seus, sem "aqui está", sem explicações fora do conteúdo.`;

const SYSTEM_CREATE = `Você é um redator de SOPs (processos operacionais) de uma empresa brasileira de vendas digitais.
Recebe uma ideia curta ou um pedido do usuário e gera um SOP completo, prático e claro em Markdown.

Regras:
- Português BR informal mas profissional, sem clichês de IA.
- NUNCA use travessão (— ou –).
- Estrutura: um # título curto no topo, seções com ##, passos numerados ou bullets, e uma checklist final se fizer sentido.
- Não invente números, ferramentas ou pessoas específicas. Se faltar contexto, escreve de forma genérica ("a ferramenta de CRM", "o gestor responsável").
- Devolva APENAS o markdown. Sem introdução, sem "aqui está".`;

function requireLovableKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY não configurada");
  return k;
}

async function callGateway(system: string, user: string): Promise<string> {
  const apiKey = requireLovableKey();
  const res = await fetch(`${LOVABLE_GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI ${res.status}: ${t.slice(0, 300)}`);
  }
  const json: any = await res.json();
  let out: string = json?.choices?.[0]?.message?.content ?? "";
  out = out.replace(/—/g, ",").replace(/–/g, "-");
  return out.trim();
}

export const improveSopText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { titulo?: string; categoria?: string; conteudo: string; instrucao?: string }) => d)
  .handler(async ({ data }) => {
    const userMsg = [
      data.categoria ? `Categoria: ${data.categoria}` : "",
      data.titulo ? `Título: ${data.titulo}` : "",
      data.instrucao ? `Instrução extra do autor: ${data.instrucao}` : "",
      "",
      "Texto bruto do processo:",
      "---",
      data.conteudo || "(vazio)",
      "---",
      "",
      "Devolva o processo reescrito em markdown, mantendo o sentido original.",
    ].filter(Boolean).join("\n");
    return { conteudo: await callGateway(SYSTEM_IMPROVE, userMsg) };
  });

export const createSopWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string; categoria?: string }) => d)
  .handler(async ({ data }) => {
    const userMsg = [
      data.categoria ? `Pasta / categoria: ${data.categoria}` : "",
      "",
      "Pedido:",
      data.prompt,
      "",
      "Gere o SOP completo em markdown. A primeira linha deve ser um # Título curto e claro.",
    ].filter(Boolean).join("\n");
    const conteudo = await callGateway(SYSTEM_CREATE, userMsg);
    const firstLine = conteudo.split("\n").find((l) => l.trim().startsWith("#")) ?? "";
    const titulo = firstLine.replace(/^#+\s*/, "").trim() || "Novo processo";
    return { titulo, conteudo };
  });

export const transcribeSopAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { audioBase64: string; mime?: string }) => d)
  .handler(async ({ data }) => {
    const apiKey = requireLovableKey();
    const mime = data.mime || "audio/webm";
    const ext =
      mime.includes("wav") ? "wav" :
      mime.includes("mp4") || mime.includes("m4a") ? "mp4" :
      mime.includes("mpeg") || mime.includes("mp3") ? "mp3" :
      mime.includes("ogg") ? "ogg" : "webm";

    const bin = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bin], { type: mime });

    const fd = new FormData();
    fd.append("model", "openai/gpt-4o-mini-transcribe");
    fd.append("file", blob, `recording.${ext}`);

    const res = await fetch(`${LOVABLE_GATEWAY}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`STT ${res.status}: ${t.slice(0, 300)}`);
    }
    const json: any = await res.json();
    return { text: String(json?.text ?? "").trim() };
  });

export const listSopHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sopId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sops_history" as any)
      .select("*")
      .eq("sop_id", data.sopId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const emails = Array.from(new Set((rows ?? []).map((r: any) => r.user_email).filter(Boolean)));
    let members: any[] = [];
    if (emails.length) {
      const { data: tm } = await context.supabase
        .from("team_members")
        .select("email, nome, foto_url, cor")
        .in("email", emails);
      members = tm ?? [];
    }
    const byEmail = new Map(members.map((m: any) => [String(m.email).toLowerCase(), m]));
    return {
      items: (rows ?? []).map((r: any) => {
        const m = r.user_email ? byEmail.get(String(r.user_email).toLowerCase()) : null;
        return {
          id: r.id,
          action: r.action,
          created_at: r.created_at,
          changed_fields: r.changed_fields ?? [],
          old_data: r.old_data,
          new_data: r.new_data,
          user_email: r.user_email,
          user_name: m?.nome ?? r.user_email ?? "Usuário",
          user_photo: m?.foto_url ?? null,
          user_color: m?.cor ?? null,
        };
      }),
    };
  });
