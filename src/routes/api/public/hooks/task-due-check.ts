import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/task-due-check")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runTaskDueChecks } = await import("@/lib/task-notifications.functions");
          const res = await runTaskDueChecks(supabaseAdmin);
          return new Response(JSON.stringify({ ok: true, ...res }), {
            headers: { "Content-Type": "application/json" },
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
