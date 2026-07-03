import { createFileRoute } from "@tanstack/react-router";

// Called by pg_cron every ~10s to process queued flow runs in background.
// Public endpoint (auth bypassed at edge) — protected by a shared secret header.
export const Route = createFileRoute("/api/public/hooks/dispatch-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.DISPATCH_WORKER_SECRET;
        if (secret) {
          const provided = request.headers.get("x-worker-secret");
          if (provided !== secret) {
            return new Response(JSON.stringify({ error: "unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        try {
          const { processQueuedFlowRuns, processExpiredTimerRuns } = await import("@/lib/flow-engine.server");
          const [queued, timers] = await Promise.all([
            processQueuedFlowRuns(20),
            processExpiredTimerRuns(20),
          ]);
          return new Response(JSON.stringify({ ok: true, queued, timers }), {
            headers: { "Content-Type": "application/json" },
          });

        } catch (err: any) {
          console.error("[dispatch-worker] error", err);
          return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () =>
        new Response(JSON.stringify({ ok: true, hint: "POST to run worker" }), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
