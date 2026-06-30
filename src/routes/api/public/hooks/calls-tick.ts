import { createFileRoute } from "@tanstack/react-router";

const SUPABASE_FUNCTIONS_BASE = "https://wvcwrozwnwdlpandwubp.supabase.co/functions/v1";

/**
 * Public cron hook. The actual call scan/send runs in Supabase Edge Functions,
 * where SUPABASE_SERVICE_ROLE_KEY is available natively. This TanStack worker
 * only proxies the request, so it no longer depends on the app runtime service
 * role env var.
 */
export const Route = createFileRoute("/api/public/hooks/calls-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const res = await fetch(`${SUPABASE_FUNCTIONS_BASE}/calls-tick`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: await request.text().catch(() => "{}"),
          });

          const text = await res.text();
          return new Response(text || JSON.stringify({ ok: res.ok }), {
            status: res.status,
            headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "erro" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
