// Estado compartilhado do Kanban HT (SDR + Closer) persistido no Supabase.
// Antes tudo ficava só no localStorage do SDR, então o Closer não enxergava
// os agendamentos. Agora esse módulo mantém um cache em memória sincronizado
// com a tabela `ht_kanban_state` e emite os mesmos eventos do window que os
// hooks existentes já escutam.
import { supabase } from "@/integrations/supabase/client";

export type HtKanbanRow = {
  lead_id: string;
  scheduled_at: string | null;
  closer_email: string | null;
  sdr_stage: string | null;
  closer_stage: string | null;
  is_fake: boolean;
};

type Cache = Map<string, HtKanbanRow>;

const cache: Cache = new Map();
let initPromise: Promise<void> | null = null;
let realtimeStarted = false;

function emit(evt: string) {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new Event(evt)); } catch {}
}

function upsertCache(row: HtKanbanRow) {
  cache.set(row.lead_id, {
    lead_id: row.lead_id,
    scheduled_at: row.scheduled_at ?? null,
    closer_email: row.closer_email ?? null,
    sdr_stage: row.sdr_stage ?? null,
    closer_stage: row.closer_stage ?? null,
    is_fake: !!row.is_fake,
  });
}

export function ensureHtKanbanState(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const { data } = await supabase
        .from("ht_kanban_state")
        .select("lead_id, scheduled_at, closer_email, sdr_stage, closer_stage, is_fake");
      for (const r of (data ?? []) as any[]) upsertCache(r);
    } catch {}
    if (!realtimeStarted && typeof window !== "undefined") {
      realtimeStarted = true;
      try {
        supabase.channel("ht_kanban_state")
          .on("postgres_changes", { event: "*", schema: "public", table: "ht_kanban_state" }, (payload: any) => {
            if (payload.eventType === "DELETE") {
              cache.delete(payload.old?.lead_id);
            } else if (payload.new) {
              upsertCache(payload.new as HtKanbanRow);
            }
            emit("ht-sdr-updated");
            emit("ht-fake-updated");
            emit("ht-sched-updated");
            emit("ht-closer-email-updated");
            emit("ht-closer-updated");
          })
          .subscribe();
      } catch {}
    }
  })();
  return initPromise;
}

export function snapshotSdrStages(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of cache.values()) if (r.sdr_stage) out[r.lead_id] = r.sdr_stage;
  return out;
}
export function snapshotFakeSet(): Set<string> {
  const s = new Set<string>();
  for (const r of cache.values()) if (r.is_fake) s.add(r.lead_id);
  return s;
}
export function snapshotSched(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of cache.values()) if (r.scheduled_at) out[r.lead_id] = r.scheduled_at;
  return out;
}
export function snapshotCloserEmail(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of cache.values()) if (r.closer_email) out[r.lead_id] = r.closer_email;
  return out;
}
export function snapshotCloserStages(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of cache.values()) if (r.closer_stage) out[r.lead_id] = r.closer_stage;
  return out;
}

async function upsertPatch(leadId: string, patch: Partial<HtKanbanRow>) {
  const cur = cache.get(leadId) ?? {
    lead_id: leadId,
    scheduled_at: null,
    closer_email: null,
    sdr_stage: null,
    closer_stage: null,
    is_fake: false,
  };
  const next: HtKanbanRow = { ...cur, ...patch, lead_id: leadId };
  upsertCache(next);
  try {
    await supabase.from("ht_kanban_state").upsert({
      lead_id: leadId,
      scheduled_at: next.scheduled_at,
      closer_email: next.closer_email,
      sdr_stage: next.sdr_stage,
      closer_stage: next.closer_stage,
      is_fake: next.is_fake,
      updated_at: new Date().toISOString(),
    }, { onConflict: "lead_id" });
  } catch {}
}

export function setSdrStage(leadId: string, stage: string | null) {
  void upsertPatch(leadId, { sdr_stage: stage ?? null });
  emit("ht-sdr-updated");
}
export function setFake(leadId: string, fake: boolean) {
  void upsertPatch(leadId, { is_fake: fake });
  emit("ht-fake-updated");
}
export function setScheduled(leadId: string, iso: string | null) {
  void upsertPatch(leadId, { scheduled_at: iso });
  emit("ht-sched-updated");
}
export function setCloserEmail(leadId: string, email: string | null) {
  void upsertPatch(leadId, { closer_email: email });
  emit("ht-closer-email-updated");
}
export function setCloserStage(leadId: string, stage: string | null) {
  void upsertPatch(leadId, { closer_stage: stage ?? null });
  emit("ht-closer-updated");
}
