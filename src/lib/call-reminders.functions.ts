import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendWA } from "@/lib/flow-engine.server";

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function normalizeBrPhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 11 || digits.length === 10) return "55" + digits;
  return digits;
}

async function findNotificationChannel(db: any): Promise<string | null> {
  const { data } = await db
    .from("wa_channels" as any)
    .select("id,kind,status,metadata")
    .eq("kind", "notification")
    .order("created_at", { ascending: false });
  const rows: any[] = (data ?? []) as any[];
  const active = rows.find((r) => String(r.status ?? "").toLowerCase() === "connected" || r.metadata?.meta_connection);
  return (active ?? rows[0])?.id ?? null;
}

export const sendCallReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    eventId: string;
    to: string;
    nome?: string;
    hora?: string;
    convidados?: string;
    leadEmail?: string;
    leadExternalId?: string;
    leadFbp?: string;
    leadFbc?: string;
    channelId?: string;
  }) => ({
    eventId: String(d?.eventId ?? "").trim(),
    to: String(d?.to ?? "").trim(),
    nome: String(d?.nome ?? "").trim(),
    hora: String(d?.hora ?? "").trim(),
    convidados: String(d?.convidados ?? "").trim(),
    leadEmail: d?.leadEmail ?? null,
    leadExternalId: d?.leadExternalId ?? null,
    leadFbp: d?.leadFbp ?? null,
    leadFbc: d?.leadFbc ?? null,
    channelId: d?.channelId ?? null,
  }))
  .handler(async ({ context, data }) => {
    if (!data.eventId) throw new Error("eventId obrigatório");
    if (!data.to) throw new Error("Telefone obrigatório");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    // Load template
    const { data: tpl, error: tplErr } = await db
      .from("wa_templates" as any)
      .select("*")
      .eq("slug", "lembrete_call")
      .maybeSingle();
    if (tplErr || !tpl) throw new Error("Template lembrete_call não encontrado");

    const channelId = data.channelId || (await findNotificationChannel(db));
    if (!channelId) throw new Error("Nenhum canal de notificações conectado");

    const contactWa = normalizeBrPhone(data.to);
    if (!contactWa) throw new Error("Telefone inválido");

    // Skip duplicate within last 6h for same event
    const { data: existing } = await db
      .from("wa_call_reminders" as any)
      .select("id,sent_at,status")
      .eq("event_id", data.eventId)
      .eq("contact_wa", contactWa)
      .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
      .limit(1);
    if ((existing ?? []).length > 0) {
      return { skipped: true, reason: "already_sent_recent", reminderId: (existing as any)[0].id };
    }

    // Insert reminder row to get id
    const { data: ins, error: insErr } = await db
      .from("wa_call_reminders" as any)
      .insert({
        event_id: data.eventId,
        channel_id: channelId,
        contact_wa: contactWa,
        lead_email: data.leadEmail,
        lead_nome: data.nome || null,
        lead_externalid: data.leadExternalId,
        lead_fbp: data.leadFbp,
        lead_fbc: data.leadFbc,
        hora: data.hora || null,
        convidados: data.convidados || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr || !ins) throw new Error(insErr?.message || "Falha ao criar lembrete");
    const reminderId = (ins as any).id as string;

    // Build interactive message
    const text = renderTemplate((tpl as any).conteudo as string, {
      nome: data.nome || "",
      hora: data.hora || "",
      convidados: data.convidados || "",
    });

    const tplButtons: Array<{ id: string; label: string }> =
      Array.isArray((tpl as any).buttons) && (tpl as any).buttons.length > 0
        ? (tpl as any).buttons
        : [
            { id: "showup", label: "✅ Show up" },
            { id: "noshow", label: "❌ No show" },
            { id: "remarcada", label: "🔄 Call remarcada" },
          ];

    const replyButtons = tplButtons.slice(0, 3).map((b) => ({
      type: "reply",
      reply: { id: `callack:${reminderId}:${b.id}`, title: b.label.slice(0, 20) },
    }));

    const body = {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: { buttons: replyButtons },
      },
    };

    try {
      const { waMsgId } = await sendWA(channelId, contactWa, body, db);
      await db
        .from("wa_call_reminders" as any)
        .update({ sent_at: new Date().toISOString(), wa_message_id: waMsgId })
        .eq("id", reminderId);
      return { reminderId, waMsgId, channelId };
    } catch (e: any) {
      await db
        .from("wa_call_reminders" as any)
        .update({ status: "failed" })
        .eq("id", reminderId);
      // Avoid leaking provider stack
      void context;
      throw new Error(e?.message ?? "Falha ao enviar lembrete");
    }
  });
