import { createFileRoute } from "@tanstack/react-router";
import { runAdsAnalyticsCron } from "@/lib/ads-analytics.functions";

export const Route = createFileRoute("/api/public/hooks/send-ads-analytics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (expected && apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        let preset: string | undefined;
        try {
          const body = (await request.json()) as { preset?: string };
          preset = body?.preset;
        } catch { /* opcional */ }
        try {
          const result = await runAdsAnalyticsCron(preset);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          console.error("[send-ads-analytics] error", e?.message);
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "internal" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
