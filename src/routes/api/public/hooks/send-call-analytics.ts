import { createFileRoute } from "@tanstack/react-router";
import { runCallAnalyticsCron } from "@/lib/call-analytics.functions";

export const Route = createFileRoute("/api/public/hooks/send-call-analytics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth simples via apikey (anon do Supabase)
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (expected && apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let date: string | undefined;
        try {
          const body = (await request.json()) as { date?: string };
          date = body?.date;
        } catch {
          /* body opcional */
        }

        try {
          const result = await runCallAnalyticsCron(date);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          console.error("[send-call-analytics] error", e?.message);
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "internal" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
