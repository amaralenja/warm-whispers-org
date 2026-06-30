// Lightweight OpenAI endpoint used by the Supabase webhook when Edge secrets
// do not contain OPENAI_API_KEY. It does not access the database.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/notification-ai/reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.EVOHUB_WEBHOOK_SECRET;
        const auth = request.headers.get("authorization") || "";
        if (secret && auth !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { userText, snapshot } = await request.json().catch(() => ({}));
        const clean = String(userText || "").trim();
        if (!clean) return Response.json({ reply: "Opa, tudo bem? Como posso te ajudar hoje?" });

        const key = process.env.OPENAI_API_KEY;
        if (!key) {
          return Response.json({
            reply: snapshot
              ? `Fechou, chefe. Segue o que achei:\n\n${snapshot}`
              : "Opa, tudo bem? Como posso te ajudar hoje?",
          });
        }

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.35,
            messages: [
              {
                role: "system",
                content:
                  "Você é a IA da Multum no WhatsApp do número de notificações. Responda em PT-BR natural, curto e útil, com linguagem informal profissional. Nunca invente métricas: use só o contexto real quando houver. Se pedirem uma ação ou dado ambíguo, peça o detalhe faltante.",
              },
              ...(snapshot ? [{ role: "system", content: String(snapshot) }] : []),
              { role: "user", content: clean },
            ],
          }),
        });
        if (!res.ok) {
          return Response.json({ reply: "Fechou, chefe. Tive uma instabilidade na IA agora, mas recebi sua mensagem. Me manda de novo em instantes." });
        }
        const json = await res.json();
        return Response.json({ reply: String(json.choices?.[0]?.message?.content || "Opa, tudo bem? Como posso te ajudar hoje?").trim() });
      },
    },
  },
});