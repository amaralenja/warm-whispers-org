import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/transcribe")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            return new Response(JSON.stringify({ error: "OPENAI_API_KEY não configurado" }), {
              status: 500,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File) || file.size < 1024) {
            return new Response(JSON.stringify({ error: "Arquivo de áudio inválido ou vazio" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          if (file.size > 24 * 1024 * 1024) {
            return new Response(JSON.stringify({ error: "Áudio maior que 24MB — divida em pedaços menores" }), {
              status: 413,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }

          const upstream = new FormData();
          upstream.append("model", "gpt-4o-transcribe");
          upstream.append("file", file, file.name || "call.webm");

          const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: upstream,
          });
          const bodyText = await res.text();
          if (!res.ok) {
            return new Response(
              JSON.stringify({ error: `Gateway ${res.status}: ${bodyText.slice(0, 300)}` }),
              { status: res.status, headers: { "Content-Type": "application/json", ...CORS } },
            );
          }
          const json = JSON.parse(bodyText);
          return new Response(JSON.stringify({ text: json.text || "" }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: String(e?.message || e) }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
