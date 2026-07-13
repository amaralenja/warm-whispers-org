// Background worker: fires remarketing flows N minutes before each 24h window
// closes, gated by tag/stage conditions matched against crm_leads.

import { runFlowAdmin } from "@/lib/flow-engine.server";

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function digits(s: unknown) {
  return String(s ?? "").replace(/\D+/g, "");
}
function phoneVariants(raw: string): string[] {
  const d = digits(raw);
  if (!d) return [];
  const set = new Set<string>([d]);
  if (d.startsWith("55") && d.length === 12) set.add(`${d.slice(0, 4)}9${d.slice(4)}`);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") set.add(`${d.slice(0, 4)}${d.slice(5)}`);
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 10 || local.length === 11) set.add(`55${local}`);
  if (local.length === 10) {
    const withNine = `${local.slice(0, 2)}9${local.slice(2)}`;
    set.add(withNine); set.add(`55${withNine}`);
  }
  return Array.from(set);
}

type Rule = {
  id: string;
  nome: string;
  ativo: boolean;
  operacao: string;
  channel_id: string | null;
  flow_id: string;
  minutes_before_close: number;
  conditions: Array<{ type: "tag" | "stage"; value: string }>;
  owner_vendor_id: number | null;
};

// Tick window: consider conversations whose last inbound was between
// (now - 24h + minutes_before) and (now - 24h + minutes_before + toleranceMin).
// toleranceMin covers gaps between worker ticks so we don't miss anyone.
const TOLERANCE_MIN = 15;

export async function processDueRemarketing() {
  const db = await getAdminDb();
  const { data: rulesRaw, error } = await db
    .from("wa_remarketing_rules" as any)
    .select("*")
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  const rules = (rulesRaw ?? []) as Rule[];
  if (rules.length === 0) return { rules: 0, fired: 0 };

  const now = Date.now();
  let fired = 0;

  for (const rule of rules) {
    try {
      // Regra de vendedor precisa estar amarrada num canal — sem canal, ignora.
      if (rule.owner_vendor_id && !rule.channel_id) {
        console.warn("[remarketing] vendor rule sem channel_id, pulando", { rule: rule.id });
        continue;
      }
      const rem = rule.minutes_before_close;
      // Inbound must be older than (24h - rem) so window closes within `rem` minutes.
      const upperTs = new Date(now - (24 * 60 - rem) * 60 * 1000).toISOString();
      const lowerTs = new Date(now - (24 * 60 - rem + TOLERANCE_MIN) * 60 * 1000).toISOString();

      // Find candidate conversations: any inbound msg in that window on allowed channels.
      let msgQ = db
        .from("wa_messages" as any)
        .select("channel_id, from_wa_id, conversation_id, created_at")
        .eq("direction", "inbound")
        .gte("created_at", lowerTs)
        .lt("created_at", upperTs);
      if (rule.channel_id) msgQ = msgQ.eq("channel_id", rule.channel_id);

      const { data: msgs, error: msgErr } = await msgQ.limit(500);
      if (msgErr) { console.error("[remarketing] msg query", msgErr); continue; }
      const candidates = (msgs ?? []) as any[];
      if (candidates.length === 0) continue;

      // Keep only the earliest inbound per conversation in that window (the "window opener").
      const byConv = new Map<string, { channel_id: string; from_wa_id: string; conversation_id: string; created_at: string }>();
      for (const m of candidates) {
        const key = String(m.conversation_id ?? "");
        if (!key) continue;
        const prev = byConv.get(key);
        if (!prev || new Date(m.created_at).getTime() < new Date(prev.created_at).getTime()) {
          byConv.set(key, m);
        }
      }
      const convIds = Array.from(byConv.keys());
      if (convIds.length === 0) continue;

      // Load conversations for operacao check + validate they still exist.
      const { data: convs } = await db
        .from("wa_conversations" as any)
        .select("id, channel_id, contact_wa_id, operacao_id")
        .in("id", convIds);
      const convMap = new Map<string, any>();
      for (const c of (convs ?? []) as any[]) convMap.set(String(c.id), c);

      // Filter by operacao (matches wa_channels.operacao_id via wa_conversations.operacao_id).
      const normOp = rule.operacao.trim().toLowerCase();
      const eligible: Array<{ conv: any; msg: any }> = [];
      for (const [convId, msg] of byConv) {
        const conv = convMap.get(convId);
        if (!conv) continue;
        if (String(conv.operacao_id ?? "").trim().toLowerCase() !== normOp) continue;
        eligible.push({ conv, msg });
      }
      if (eligible.length === 0) continue;

      // Skip already-fired for this window (uniqueness = day-bucket of upperTs).
      const windowKey = new Date(now).toISOString().slice(0, 13); // hour-level key
      const { data: alreadyFired } = await db
        .from("wa_remarketing_dispatches" as any)
        .select("conversation_id")
        .eq("rule_id", rule.id)
        .in("conversation_id", eligible.map((e) => e.conv.id));
      const firedSet = new Set(((alreadyFired ?? []) as any[]).map((r) => String(r.conversation_id)));

      // Match conditions against crm_leads (by phone variant + operacao)
      for (const { conv, msg } of eligible) {
        if (firedSet.has(String(conv.id))) continue;

        const variants = phoneVariants(String(conv.contact_wa_id ?? ""));
        if (variants.length === 0) continue;

        let matches = true;
        if (rule.conditions.length > 0) {
          const { data: leads } = await db
            .from("crm_leads" as any)
            .select("id, tags, status, expert, telefone")
            .eq("expert", rule.operacao)
            .in("telefone", variants);
          const leadList = ((leads ?? []) as any[]).filter((l) => {
            const digitsPhone = String(l.telefone ?? "").replace(/\D+/g, "");
            return variants.includes(digitsPhone);
          });
          if (leadList.length === 0) {
            matches = false;
          } else {
            const lead = leadList[0];
            const tags = (Array.isArray(lead.tags) ? lead.tags : []).map((t: any) => String(t).toLowerCase());
            const stage = String(lead.status ?? "");
            // OR semantics: qualquer condição que bater já libera o disparo.
            matches = rule.conditions.some((cond) => {
              if (cond.type === "tag") return tags.includes(String(cond.value).toLowerCase());
              if (cond.type === "stage") return stage === String(cond.value);
              return false;
            });
          }
        }
        if (!matches) continue;

        // Fire the flow
        try {
          const res = await runFlowAdmin({
            flowId: rule.flow_id,
            channelId: String(conv.channel_id),
            contactWaId: String(conv.contact_wa_id),
            conversationId: String(conv.id),
            db,
            triggerContext: { manual: true, remarketing_rule_id: rule.id },
            queueOnly: true,
          });
          await db.from("wa_remarketing_dispatches" as any).insert({
            rule_id: rule.id,
            conversation_id: conv.id,
            channel_id: conv.channel_id,
            contact_wa_id: conv.contact_wa_id,
            window_key: windowKey,
            run_id: (res as any)?.runId ?? null,
          });
          fired++;
        } catch (err: any) {
          // Unique-constraint duplicates are expected during retries — swallow.
          if (!String(err?.message ?? "").includes("duplicate")) {
            console.error("[remarketing] fire failed", { rule: rule.id, conv: conv.id, err: err?.message });
          }
        }
      }

      await db.from("wa_remarketing_rules" as any).update({ last_run_at: new Date().toISOString() }).eq("id", rule.id);
    } catch (err) {
      console.error("[remarketing] rule failed", { ruleId: rule.id, err });
    }
  }

  return { rules: rules.length, fired };
}
