import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `Você é um editor de processos internos (SOPs) de uma empresa brasileira de vendas digitais.

Sua missão: pegar o texto bruto que o usuário escreveu e devolver uma versão MELHORADA, mais clara, organizada e profissional — SEM mudar a essência, o tom ou as ideias originais.

Regras OBRIGATÓRIAS:
- Mantenha 100% o sentido e as informações do que o usuário escreveu. Não invente passos, ferramentas, números ou políticas que não estavam ali.
- Português brasileiro natural, direto, de gente real. Pode usar "a gente", "tá", linguagem do dia a dia se o original já era assim.
- NUNCA use travessão (— ou –). Use vírgula, dois pontos, ponto final ou parênteses no lugar.
- Evite frases robóticas e clichês de IA tipo "no mundo de hoje", "é importante notar", "vamos mergulhar", "em conclusão".
- Estruture em Markdown: títulos com ##, listas com -, negrito com ** quando ajudar a destacar passos críticos.
- Se o original já tem estrutura, respeite. Só reorganize se ficar muito mais claro.
- Devolva APENAS o markdown do processo melhorado. Sem comentários seus, sem "aqui está", sem explicações fora do conteúdo.`;

export const improveSopText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { titulo?: string; categoria?: string; conteudo: string; instrucao?: string }) => d)
  .handler(async ({ data }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

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
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
    }
    const json: any = await res.json();
    let out: string = json?.choices?.[0]?.message?.content ?? "";
    // Garante: nada de travessão
    out = out.replace(/—/g, ",").replace(/–/g, "-");
    return { conteudo: out.trim() };
  });
