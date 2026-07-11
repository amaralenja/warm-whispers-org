// Background worker: processes due items from crm_bulk_dispatches, calling
// runFlowAdmin for each and updating counters. Uses optimistic CAS on the
// item status to avoid double-send when multiple workers run in parallel.

import { runFlowAdmin } from "@/lib/flow-engine.server";

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function bumpCounter(db: any, dispatchId: string, field: "sent_count" | "failed_count") {
  const { data: cur } = await db
    .from("crm_bulk_dispatches" as any)
    .select(field)
    .eq("id", dispatchId)
    .maybeSingle();
  const next = ((cur as any)?.[field] ?? 0) + 1;
  await db.from("crm_bulk_dispatches" as any).update({ [field]: next }).eq("id", dispatchId);
}

export async function processDueBulkDispatchItems(limit = 10) {
  const db = await getAdminDb();
  const nowIso = new Date().toISOString();

  const { data: candidates, error } = await db
    .from("crm_bulk_dispatch_items" as any)
    .select("id,dispatch_id,lead_id,contact_wa_id,conversation_id")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const list = (candidates ?? []) as Array<any>;
  if (list.length === 0) return { picked: 0, sent: 0, failed: 0 };

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

    // Optimistic claim: flip pending→sent atomically. Only the winning update
    // returns a row; concurrent workers get no rows and skip.
    const { data: claimed } = await db
      .from("crm_bulk_dispatch_items" as any)
      .update({ status: "sent", processed_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

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
      await db.from("crm_bulk_dispatch_items" as any)
        .update({ run_id: (res as any)?.runId ?? null })
        .eq("id", item.id);
      await bumpCounter(db, item.dispatch_id, "sent_count");
      sent++;
    } catch (err: any) {
      await db.from("crm_bulk_dispatch_items" as any).update({
        status: "failed",
        error: String(err?.message ?? err).slice(0, 500),
        processed_at: new Date().toISOString(),
      }).eq("id", item.id);
      await bumpCounter(db, item.dispatch_id, "failed_count");
      failed++;
    }
  }

  // Complete dispatches with no pending items remaining.
  for (const dispatchId of dispatchIds) {
    const { count } = await db
      .from("crm_bulk_dispatch_items" as any)
      .select("id", { count: "exact", head: true })
      .eq("dispatch_id", dispatchId)
      .eq("status", "pending");
    if ((count ?? 0) === 0) {
      await db.from("crm_bulk_dispatches" as any)
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", dispatchId).eq("status", "running");
    }
  }

  return { picked: list.length, sent, failed };
}
