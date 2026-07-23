import { createFileRoute } from "@tanstack/react-router";

async function runWorkerTasks() {
  const { processQueuedFlowRuns, processExpiredTimerRuns, processStaleRunningDelayRuns, processExpiredWaitingRuns, processStaleRunningSendRuns } = await import("@/lib/flow-engine.server");
  const { processDueBulkDispatchItems } = await import("@/lib/crm-bulk-dispatch.server");
  const { processDueRemarketing } = await import("@/lib/remarketing.server");
  const stale = await processStaleRunningDelayRuns(10, 20);
  const [queued, timers, expiredWaiting, staleSend, bulk, remarketing] = await Promise.all([
    processQueuedFlowRuns(20),
    processExpiredTimerRuns(20),
    processExpiredWaitingRuns(60, 100),
    processStaleRunningSendRuns(60, 20),
    processDueBulkDispatchItems(10),
    processDueRemarketing(),
  ]);
  return { stale, queued, timers, expiredWaiting, staleSend, bulk, remarketing };
}

// Called by pg_cron / cron every ~10s to process queued flow runs in background.
export const Route = createFileRoute("/api/public/hooks/dispatch-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey = request.headers.get("apikey") || request.headers.get("x-api-key");
        const expectedKeys = [
          process.env.SUPABASE_PUBLISHABLE_KEY,
          process.env.SUPABASE_ANON_KEY,
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ].filter(Boolean);
        if (expectedKeys.length > 0 && providedKey && !expectedKeys.includes(providedKey)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const res = await runWorkerTasks();
          return new Response(JSON.stringify({ ok: true, ...res }), {
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
      GET: async () => {
        try {
          const res = await runWorkerTasks();
          return new Response(JSON.stringify({ ok: true, ...res }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
