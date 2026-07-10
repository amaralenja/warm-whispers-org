import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const SUPABASE_URL = "https://wvcwrozwnwdlpandwubp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3dyb3p3bndkbHBhbmR3dWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0ODksImV4cCI6MjA4NzcyMDQ4OX0.1eHNkL6pfcRpfrWsh_UyYTcnuNIT6LQLCrpmV2EgyFg";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function pickStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export const Route = createFileRoute("/api/public/ht-quiz/submit")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const m = auth.match(/^Bearer\s+(.+)$/i);
          const token = m?.[1]?.trim();
          if (!token) return json(401, { ok: false, error: "Token ausente. Use o header Authorization: Bearer <token>" });

          const token_hash = createHash("sha256").update(token, "utf8").digest("hex");

          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object") return json(400, { ok: false, error: "JSON inválido" });
          const b = body as Record<string, unknown>;

          const respostas = (b.respostas && typeof b.respostas === "object") ? b.respostas : null;
          const session_id = pickStr(b.session_id ?? b.sessionId);
          const rawStatus = pickStr(b.status);
          const status = rawStatus === "completed" ? "completed" : "partial";

          const supabasePublic = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });

          const { data: saved, error: saveErr } = await supabasePublic
            .rpc("submit_ht_quiz_submission" as any, {
              _token_hash: token_hash,
              _session_id: session_id,
              _status: status,
              _nome: pickStr(b.nome ?? b.name),
              _email: pickStr(b.email),
              _whatsapp: pickStr(b.whatsapp ?? b.phone ?? b.telefone),
              _instagram: pickStr(b.instagram),
              _utm_source: pickStr(b.utm_source),
              _utm_medium: pickStr(b.utm_medium),
              _utm_campaign: pickStr(b.utm_campaign),
              _utm_content: pickStr(b.utm_content),
              _fbc: pickStr(b.fbc),
              _fbp: pickStr(b.fbp),
              _fbclid: pickStr(b.fbclid),
              _gclid: pickStr(b.gclid),
              _respostas: respostas,
              _raw: b,
            })
            .single();

          if (saveErr) return json(500, { ok: false, error: "Erro ao salvar submissão: " + saveErr.message });

          const result = saved as { ok?: boolean; id?: string; received_at?: string; error?: string } | null;
          if (!result?.ok) return json(401, { ok: false, error: result?.error ?? "Token inválido ou revogado" });

          return json(200, { ok: true, id: result.id, received_at: result.received_at });

          const insert: Record<string, unknown> = {
            status,
            nome: pickStr(b.nome ?? b.name),
            email: pickStr(b.email),
            whatsapp: pickStr(b.whatsapp ?? b.phone ?? b.telefone),
            instagram: pickStr(b.instagram),
            utm_source: pickStr(b.utm_source),
            utm_medium: pickStr(b.utm_medium),
            utm_campaign: pickStr(b.utm_campaign),
            utm_content: pickStr(b.utm_content),
            fbc: pickStr(b.fbc),
            fbp: pickStr(b.fbp),
            fbclid: pickStr(b.fbclid),
            gclid: pickStr(b.gclid),
            respostas,
            raw: b,
            updated_at: new Date().toISOString(),
          };

          // Se veio session_id: upsert por (token_id, session_id) — nunca duplica o mesmo lead
          // e vai atualizando parcialmente até o completed.
          let sub: any = null;
          let insErr: any = null;
          if (session_id) {
            const res = await supabaseAdmin
              .from("ht_quiz_submissions" as any)
              .upsert(insert, { onConflict: "token_id,session_id" })
              .select("id, received_at")
              .single();
            sub = res.data; insErr = res.error;
          } else {
            const res = await supabaseAdmin
              .from("ht_quiz_submissions" as any)
              .insert(insert)
              .select("id, received_at")
              .single();
            sub = res.data; insErr = res.error;
          }

          if (insErr) return json(500, { ok: false, error: "Erro ao salvar submissão: " + insErr.message });


          // fire-and-forget update last_used_at
          void supabaseAdmin
            .from("ht_api_tokens" as any)
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", (tok as any).id);

          return json(200, { ok: true, id: (sub as any).id, received_at: (sub as any).received_at });
        } catch (e: any) {
          return json(500, { ok: false, error: e?.message ?? "erro interno" });
        }
      },
    },
  },
});
