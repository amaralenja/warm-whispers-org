// Estado compartilhado do Kanban HT (SDR + Closer) persistido no Supabase + localStorage.
import { supabase } from "@/integrations/supabase/client";
import { saveKanbanStateServer } from "@/lib/ht-api.functions";

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

const LS_KEY = "multium_ht_kanban_state_v2";

function emit(evt: string) {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new Event(evt)); } catch {}
}

function loadLocalBackup(): Record<string, HtKanbanRow> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveLocalBackup() {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, HtKanbanRow> = {};
    for (const [id, row] of cache.entries()) {
      obj[id] = row;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch {}
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
    // 1. Carrega primeiro do backup local (garante que nada do SDR suma se o banco demorar)
    const localMap = loadLocalBackup();
    for (const row of Object.values(localMap)) {
      if (row?.lead_id) upsertCache(row);
    }

    // 2. Busca do Supabase e mescla
    try {
      const { data, error } = await supabase
        .from("ht_kanban_state")
        .select("lead_id, scheduled_at, closer_email, sdr_stage, closer_stage, is_fake");
      if (!error && data) {
        for (const r of data as any[]) {
          const localRow = localMap[r.lead_id];
          const merged: HtKanbanRow = {
            lead_id: r.lead_id,
            scheduled_at: r.scheduled_at ?? localRow?.scheduled_at ?? null,
            closer_email: r.closer_email ?? localRow?.closer_email ?? null,
            sdr_stage: r.sdr_stage ?? localRow?.sdr_stage ?? null,
            closer_stage: r.closer_stage ?? localRow?.closer_stage ?? null,
            is_fake: r.is_fake ?? localRow?.is_fake ?? false,
          };
          upsertCache(merged);
        }
      }
    } catch {}

    saveLocalBackup();

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
            saveLocalBackup();
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
  saveLocalBackup();

  try {
    const { error } = await supabase.from("ht_kanban_state").upsert({
      lead_id: leadId,
      scheduled_at: next.scheduled_at,
      closer_email: next.closer_email,
      sdr_stage: next.sdr_stage,
      closer_stage: next.closer_stage,
      is_fake: next.is_fake,
      updated_at: new Date().toISOString(),
    }, { onConflict: "lead_id" });

    if (error) {
      console.warn("[ht-kanban-state] Client upsert error, using serverFn fallback:", error.message);
      await saveKanbanStateServer({ data: next }).catch((e) => {
        console.error("[ht-kanban-state] ServerFn fallback error:", e);
      });
    }
  } catch (err) {
    console.warn("[ht-kanban-state] Exception during upsert, using serverFn fallback:", err);
    await saveKanbanStateServer({ data: next }).catch((e) => {
      console.error("[ht-kanban-state] ServerFn fallback error:", e);
    });
  }
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
export function setScheduledAndCloser(leadId: string, iso: string | null, email: string | null) {
  void upsertPatch(leadId, { scheduled_at: iso, closer_email: email });
  emit("ht-sched-updated");
  emit("ht-closer-email-updated");
}
