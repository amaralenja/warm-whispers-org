// Background worker: processes due items from crm_bulk_dispatches, calling
// runFlowAdmin for each and updating counters. Idempotent per-item via row lock
// pattern (claim by scheduled_at + status='pending').

import { runFlowAdmin } from "@/lib/flow-engine.server";

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function processDueBulkDispatchItems(limit = 10) {
  const db = await getAdminDb();
  const nowIso = new Date().toISOString();

  // Claim items: fetch a small batch of due pending items and flip them to
  // 'processing' one-by-one to avoid double-send. Postgres doesn't give us a
  // SKIP LOCKED via PostgREST, so we do compare-and-swap on status.
  const { data: candidates, error } = await db
    .from("crm_bulk_dispatch_items" as any)
    .select("id,dispatch_id,lead_id,contact_wa_id,conversation_id")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const list = (candidates ?? []) as Array<any>;
  if (list.length === 0) return { picked: 0 };

  // Load dispatch metadata in bulk
  const dispatchIds = Array.from(new Set(list.map((i) => i.dispatch_id)));
  const { data: dispatches } = await db
    .from("crm_bulk_dispatches" as any)
    .select("id,flow_id,channel_id,status")
    .in("id", dispatchIds);
  const dispMap = new Map<string, any>();
  for (const d of (dispatches ?? []) as any[]) dispMap.set(String(d.id), d);

  let sent = 0;
  let failed = 0;
  for (const item of list) {
    const disp = dispMap.get(String(item.dispatch_id));
    if (!disp || disp.status !== "running") {
      await db.from("crm_bulk_dispatch_items" as any)
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", item.id).eq("status", "pending");
      continue;
    }

    // Compare-and-swap: only take it if still pending.
    const { data: claimed, error: claimErr } = await db
      .from("crm_bulk_dispatch_items" as any)
      .update({ status: "processing" })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimErr || !claimed) continue;

    try {
      const res = await runFlowAdmin({
        flowId: String(disp.flow_id),
        channelId: String(disp.channel_id),
        contactWaId: String(item.contact_wa_id),
        conversationId: item.conversation_id ? String(item.conversation_id) : null,
        db,
        triggerContext: { manual: true, bulk_dispatch_id: item.dispatch_id },
        queueOnly: true,
      });
      await db.from("crm_bulk_dispatch_items" as any).update({
        status: "sent",
        run_id: (res as any)?.runId ?? null,
        processed_at: new Date().toISOString(),
      }).eq("id", item.id);
      await db.rpc("increment_crm_bulk_dispatch_counter" as any, {
        _id: item.dispatch_id, _field: "sent_count",
      }).then(() => {}, async () => {
        // Fallback if RPC missing: manual update
        const { data: cur } = await db.from("crm_bulk_dispatches" as any).select("sent_count").eq("id", item.dispatch_id).maybeSingle();
        await db.from("crm_bulk_dispatches" as any).update({ sent_count: ((cur as any)?.sent_count ?? 0) + 1 }).eq("id", item.dispatch_id);
      });
      sent++;
    } catch (err: any) {
      await db.from("crm_bulk_dispatch_items" as any).update({
        status: "failed",
        error: String(err?.message ?? err).slice(0, 500),
        processed_at: new Date().toISOString(),
      }).eq("id", item.id);
      const { data: cur } = await db.from("crm_bulk_dispatches" as any).select("failed_count").eq("id", item.dispatch_id).maybeSingle();
      await db.from("crm_bulk_dispatches" as any).update({ failed_count: ((cur as any)?.failed_count ?? 0) + 1 }).eq("id", item.dispatch_id);
      failed++;
    }
  }

  // Complete dispatches that have no pending/processing items left.
  for (const dispatchId of dispatchIds) {
    const { count } = await db
      .from("crm_bulk_dispatch_items" as any)
      .select("id", { count: "exact", head: true })
      .eq("dispatch_id", dispatchId)
      .in("status", ["pending", "processing"]);
    if ((count ?? 0) === 0) {
      await db.from("crm_bulk_dispatches" as any)
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", dispatchId).eq("status", "running");
    }
  }

  return { picked: list.length, sent, failed };
}
