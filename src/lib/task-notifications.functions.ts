import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendWA } from "@/lib/flow-engine.server";

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function normalizeBrPhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  let local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 10) {
    // Adiciona 9º dígito em celular sem ele
    local = local.slice(0, 2) + "9" + local.slice(2);
  }
  return "55" + local;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "sem prazo";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

async function findNotificationChannel(db: any): Promise<string | null> {
  const { data } = await db
    .from("wa_channels" as any)
    .select("id,kind,status,metadata")
    .eq("kind", "notification")
    .order("created_at", { ascending: false });
  const rows: any[] = (data ?? []) as any[];
  const active = rows.find(
    (r) => String(r.status ?? "").toLowerCase() === "connected" || r.metadata?.meta_connection,
  );
  return (active ?? rows[0])?.id ?? null;
}

async function loadTemplate(db: any, slug: string) {
  const { data: tpl } = await db.from("wa_templates" as any).select("*").eq("slug", slug).maybeSingle();
  return tpl as any;
}

async function sendToMember(
  db: any,
  taskId: string,
  memberId: string,
  kind: "created" | "due_soon" | "overdue",
  contactWa: string,
  text: string,
) {
  // Dedup: já enviado?
  const { data: existing } = await db
    .from("wa_task_notifications" as any)
    .select("id,status")
    .eq("task_id", taskId)
    .eq("member_id", memberId)
    .eq("kind", kind)
    .maybeSingle();
  if (existing && (existing as any).status === "sent") {
    return { skipped: true, id: (existing as any).id };
  }

  const channelId = await findNotificationChannel(db);
  if (!channelId) throw new Error("Nenhum canal de notificações conectado");

  const { data: ins, error: insErr } = await db
    .from("wa_task_notifications" as any)
    .upsert(
      {
        task_id: taskId,
        member_id: memberId,
        kind,
        channel_id: channelId,
        contact_wa: contactWa,
        status: "pending",
      },
      { onConflict: "task_id,member_id,kind" },
    )
    .select("id")
    .single();
  if (insErr || !ins) throw new Error(insErr?.message || "Falha ao registrar notificação");
  const notifId = (ins as any).id as string;

  try {
    const { waMsgId } = await sendWA(channelId, contactWa, { type: "text", text: { body: text } }, db);
    await db
      .from("wa_task_notifications" as any)
      .update({ status: "sent", sent_at: new Date().toISOString(), wa_message_id: waMsgId })
      .eq("id", notifId);
    return { id: notifId, waMsgId };
  } catch (e: any) {
    await db.from("wa_task_notifications" as any).update({ status: "failed" }).eq("id", notifId);
    throw new Error(e?.message ?? "Falha ao enviar notificação");
  }
}

async function loadAssigneePhones(db: any, ids: string[]): Promise<Array<{ id: string; phone: string; nome: string }>> {
  if (!ids.length) return [];
  const { data } = await db
    .from("team_members" as any)
    .select("id,nome,telefone,ativo")
    .in("id", ids);
  return ((data ?? []) as any[])
    .filter((m) => m.telefone && m.ativo !== false)
    .map((m) => ({ id: m.id, phone: normalizeBrPhone(m.telefone), nome: String(m.nome ?? "") }))
    .filter((m) => m.phone.length >= 12);
}

/**
 * Dispara o template "task_created" para todos os assignees com telefone.
 * Chamado logo após criar uma task.
 */
export const notifyTaskCreated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => ({ taskId: String(d?.taskId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.taskId) throw new Error("taskId obrigatório");
    const db = context.supabase;


    const { data: task } = await db
      .from("tasks" as any)
      .select("id,titulo,prioridade,prazo,assignee_ids,created_at")
      .eq("id", data.taskId)
      .maybeSingle();
    if (!task) throw new Error("Tarefa não encontrada");

    const tpl = await loadTemplate(db, "task_created");
    if (!tpl) throw new Error("Template task_created não encontrado");

    const members = await loadAssigneePhones(db, (task as any).assignee_ids ?? []);
    if (!members.length) return { sent: 0, reason: "sem assignees com telefone" };

    const text = renderTemplate(String(tpl.conteudo ?? ""), {
      titulo: String((task as any).titulo ?? ""),
      prioridade: String((task as any).prioridade ?? "normal"),
      criada: fmtDateTime((task as any).created_at),
      prazo: fmtDateTime((task as any).prazo),
    });

    let sent = 0;
    const errors: string[] = [];
    for (const m of members) {
      try {
        const r = await sendToMember(db, data.taskId, m.id, "created", m.phone, text);
        if (!(r as any).skipped) sent += 1;
      } catch (e: any) {
        errors.push(`${m.nome}: ${e?.message ?? "erro"}`);
      }
    }
    return { sent, total: members.length, errors };
  });

/**
 * Verifica tarefas que vencem em ~24h (due_soon) e tarefas vencidas (overdue).
 * Chamado pelo cron.
 */
export async function runTaskDueChecks(db: any) {
  const now = Date.now();
  const in24h = new Date(now + 24 * 3600_000).toISOString();
  const in23h = new Date(now + 23 * 3600_000).toISOString();
  const nowIso = new Date(now).toISOString();

  const tplSoon = await loadTemplate(db, "task_due_soon");
  const tplOver = await loadTemplate(db, "task_overdue");

  // Due soon: prazo entre 23h e 24h a partir de agora
  const { data: soonTasks } = await db
    .from("tasks" as any)
    .select("id,titulo,prazo,assignee_ids,concluida")
    .gte("prazo", in23h)
    .lte("prazo", in24h)
    .or("concluida.is.false,concluida.is.null");

  // Overdue: prazo já passou, não concluída
  const { data: overTasks } = await db
    .from("tasks" as any)
    .select("id,titulo,prazo,assignee_ids,concluida")
    .lt("prazo", nowIso)
    .or("concluida.is.false,concluida.is.null");

  let sent = 0;
  for (const [tasks, tpl, kind] of [
    [soonTasks ?? [], tplSoon, "due_soon" as const],
    [overTasks ?? [], tplOver, "overdue" as const],
  ] as const) {
    if (!tpl) continue;
    for (const t of tasks as any[]) {
      const members = await loadAssigneePhones(db, t.assignee_ids ?? []);
      if (!members.length) continue;
      const text = renderTemplate(String(tpl.conteudo ?? ""), {
        titulo: String(t.titulo ?? ""),
        prazo: fmtDateTime(t.prazo),
      });
      for (const m of members) {
        try {
          const r = await sendToMember(db, t.id, m.id, kind, m.phone, text);
          if (!(r as any).skipped) sent += 1;
        } catch {
          // continua
        }
      }
    }
  }
  return { sent };
}
