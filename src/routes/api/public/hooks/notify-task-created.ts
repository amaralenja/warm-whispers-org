import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/notify-task-created")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const taskId = String((body as any)?.taskId ?? "").trim();
          if (!taskId) {
            return new Response(JSON.stringify({ ok: false, error: "taskId obrigatório" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runTaskCreatedDispatch } = await import("@/lib/task-notifications.functions");
          const res = await runTaskCreatedDispatch(supabaseAdmin, taskId);
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
