import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function normalizeBrPhone(raw: string): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // Garante prefixo 55
  if (!digits.startsWith("55")) {
    if (digits.length === 11 || digits.length === 10) digits = "55" + digits;
  }
  // Após 55 + DDD (2 dígitos), celular deve ter 9 dígitos começando com 9.
  // Se vier no formato antigo (8 dígitos), insere o 9.
  if (digits.length === 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8) digits = "55" + ddd + "9" + rest;
  }
  return digits;
}


function todayBrtDateString(): string {
  // BRT = UTC-3
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600_000);
  return brt.toISOString().slice(0, 10);
}

function brtDayRange(dateStr?: string): { fromIso: string; toIso: string; label: string } {
  const d = dateStr || todayBrtDateString();
  // 00:00 BRT = 03:00 UTC; 23:59:59 BRT = 02:59:59 UTC next day
  const fromIso = `${d}T03:00:00.000Z`;
  const next = new Date(`${d}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const toIso = `${next.toISOString().slice(0, 10)}T03:00:00.000Z`;
  const [y, m, day] = d.split("-");
  return { fromIso, toIso, label: `${day}/${m}/${y}` };
}

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function generateDiagnostico(stats: {
  data: string;
  showUps: number;
  noShows: number;
  remarcadas: number;
  totalCalls: number;
  faturamento: number;
  taxaShow: number;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "IA indisponível no momento (chave OpenAI não configurada).";
  }

  const SYSTEM = `Você é um analista comercial direto e informal. Escreva em português brasileiro coloquial, tipo coach de vendas. Use no máximo 4 linhas. Nada de travessões (—), nada de robotizar. Cite o que foi bom, o que precisa melhorar amanhã. Use emojis com moderação (1 ou 2 no máximo). Não invente números.`;

  const user = `Resumo do dia ${stats.data}:
- Show ups: ${stats.showUps}
- No shows: ${stats.noShows}
- Calls remarcadas: ${stats.remarcadas}
- Total de calls realizadas: ${stats.totalCalls}
- Faturamento do dia: ${fmtBRL(stats.faturamento)}
- Taxa de comparecimento: ${stats.taxaShow.toFixed(1)}%

Faça uma análise rápida e prática.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[call-analytics] OpenAI error", res.status, t.slice(0, 300));
      return "Resumo automático indisponível agora, mas os números do dia tão aí em cima.";
    }
    const json: any = await res.json();
    const out: string = json?.choices?.[0]?.message?.content ?? "";
    return out.replace(/—/g, ",").trim() || "Sem análise gerada.";
  } catch (e: any) {
    console.error("[call-analytics] AI failure", e?.message);
    return "Não consegui gerar a análise agora, mas tá tudo registrado.";
  }
}

async function computeAndSend(db: any, dateStr?: string) {
  const { sendWA } = await import("@/lib/flow-engine.server");
  const { fromIso, toIso, label } = brtDayRange(dateStr);

  // 1. Métricas de comparecimento (kind = attendance) baseadas no status salvo pelo botão
  const { data: attendance } = await db
    .from("wa_call_reminders" as any)
    .select("status")
    .eq("kind", "attendance")
    .gte("created_at", fromIso)
    .lt("created_at", toIso);

  const rows: any[] = (attendance ?? []) as any[];
  const showUps = rows.filter((r) => {
    const s = String(r.status ?? "").toLowerCase();
    return s === "showup" || s === "show_up";
  }).length;
  const noShows = rows.filter((r) => {
    const s = String(r.status ?? "").toLowerCase();
    return s === "noshow" || s === "no_show";
  }).length;
  const remarcadas = rows.filter((r) => {
    const s = String(r.status ?? "").toLowerCase();
    return s === "remarcada" || s === "rescheduled";
  }).length;
  const totalCalls = rows.length;
  const taxaShow = totalCalls > 0 ? (showUps / totalCalls) * 100 : 0;

  // 2. Faturamento do dia (vendas com Data = hoje)
  const dia = dateStr || todayBrtDateString();
  const { data: vendas } = await db
    .from("vendas" as any)
    .select('"Ticket","Data","Evento"')
    .or(`Evento.eq.purchase_approved,Evento.ilike.%aprov%`);

  let faturamento = 0;
  for (const v of (vendas ?? []) as any[]) {
    const rawDate = String(v?.Data ?? "");
    let saleDay = "";
    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) saleDay = rawDate.slice(0, 10);
    else if (/^\d{2}\/\d{2}\/\d{4}/.test(rawDate)) {
      const [d, m, y] = rawDate.slice(0, 10).split("/");
      saleDay = `${y}-${m}-${d}`;
    } else if (/^\d{2}-\d{2}-\d{4}/.test(rawDate)) {
      const [d, m, y] = rawDate.slice(0, 10).split("-");
      saleDay = `${y}-${m}-${d}`;
    }
    if (saleDay !== dia) continue;
    const raw = String(v?.Ticket ?? "").replace(/[^0-9,.-]/g, "").replace(",", ".");
    const n = Number(raw);
    if (Number.isFinite(n)) faturamento += n;
  }

  // 3. Diagnóstico IA
  const diagnostico = await generateDiagnostico({
    data: label,
    showUps,
    noShows,
    remarcadas,
    totalCalls,
    faturamento,
    taxaShow,
  });

  // 4. Carrega template + destinatários
  const { data: tpl } = await db
    .from("wa_templates" as any)
    .select("*")
    .eq("slug", "analytics_call")
    .maybeSingle();
  if (!tpl) throw new Error("Template analytics_call não encontrado");

  const { data: recipients } = await db
    .from("wa_template_recipients" as any)
    .select("id, telefone, nome")
    .eq("template_id", (tpl as any).id)
    .eq("ativo", true);

  if (!recipients || recipients.length === 0) {
    return { sent: 0, skipped: "no_recipients", stats: { showUps, noShows, remarcadas, totalCalls, faturamento, taxaShow } };
  }

  // 5. Canal de notificação
  const { data: channels } = await db
    .from("wa_channels" as any)
    .select("id,kind,status,metadata,created_at")
    .eq("kind", "notification")
    .order("created_at", { ascending: false });
  const chRows: any[] = (channels ?? []) as any[];
  const active =
    chRows.find((r) => String(r.status ?? "").toLowerCase() === "connected" || r.metadata?.meta_connection) ?? chRows[0];
  const channelId = active?.id;
  if (!channelId) throw new Error("Nenhum canal de notificações conectado");

  const text = renderTemplate(String((tpl as any).conteudo ?? ""), {
    data: label,
    show_ups: String(showUps),
    no_shows: String(noShows),
    remarcadas: String(remarcadas),
    total_calls: String(totalCalls),
    faturamento: fmtBRL(faturamento),
    taxa_show: `${taxaShow.toFixed(1)}%`,
    diagnostico,
  });

  const body = { type: "text", text: { body: text } };
  let sent = 0;
  const errors: string[] = [];
  for (const r of recipients as any[]) {
    const phone = normalizeBrPhone(r.telefone);
    if (!phone) continue;
    try {
      await sendWA(channelId, phone, body, db);
      sent++;
    } catch (e: any) {
      errors.push(`${r.telefone}: ${e?.message ?? "erro"}`);
    }
  }

  return {
    sent,
    total: recipients.length,
    errors,
    stats: { showUps, noShows, remarcadas, totalCalls, faturamento, taxaShow },
  };
}

/** Disparo manual / botão "Testar envio" do painel */
export const sendCallAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { date?: string } | undefined) => ({ date: d?.date }))
  .handler(async (ctx: any) => {
    const data = ctx?.data ?? {};
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await computeAndSend(supabaseAdmin, data.date);
  });

/** Disparo via cron (sem auth — chamado pelo endpoint público) */
export async function runCallAnalyticsCron(dateStr?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return await computeAndSend(supabaseAdmin, dateStr);
}

/** CRUD simples de destinatários */
export const listTemplateRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string } | undefined) => ({ templateId: d?.templateId ?? "" }))
  .handler(async (ctx: any) => {
    const data = ctx?.data ?? {};
    const context = ctx?.context;
    if (!data?.templateId) return [];
    if (!context?.supabase) throw new Error("Contexto Supabase indisponível");
    const { data: rows, error } = await context.supabase
      .from("wa_template_recipients" as any)
      .select("*")
      .eq("template_id", data.templateId)
      .order("created_at");
    if (error) throw error;
    return rows ?? [];
  });

export const addTemplateRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string; telefone: string; nome?: string } | undefined) => ({
    templateId: d?.templateId ?? "",
    telefone: d?.telefone ?? "",
    nome: d?.nome,
  }))
  .handler(async (ctx: any) => {
    const data = ctx?.data ?? {};
    const context = ctx?.context;
    if (!data?.templateId) throw new Error("Template obrigatório");
    if (!context?.supabase) throw new Error("Contexto Supabase indisponível");
    const phone = normalizeBrPhone(data.telefone);
    if (!phone) throw new Error("Telefone inválido");
    const { data: row, error } = await context.supabase
      .from("wa_template_recipients" as any)
      .insert({ template_id: data.templateId, telefone: phone, nome: data.nome ?? null, ativo: true })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const removeTemplateRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } | undefined) => ({ id: d?.id ?? "" }))
  .handler(async (ctx: any) => {
    const data = ctx?.data ?? {};
    const context = ctx?.context;
    if (!data?.id) throw new Error("Destinatário obrigatório");
    if (!context?.supabase) throw new Error("Contexto Supabase indisponível");
    const { error } = await context.supabase
      .from("wa_template_recipients" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Lista vendedores + team_members que têm telefone, normalizando o 9 */
export const listRecipientCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx: any) => {
    const context = ctx?.context;
    if (!context?.supabase) throw new Error("Contexto Supabase indisponível");
    const [vRes, tRes] = await Promise.all([
      context.supabase.from("vendedores").select("id, nome, telefone, foto_url").eq("ativo", true),
      context.supabase.from("team_members").select("id, nome, telefone, foto_url, funcao").eq("ativo", true),
    ]);
    const out: Array<{ id: string; nome: string; telefone: string; origem: "vendedor" | "equipe"; subtitulo?: string; foto_url?: string | null }> = [];
    for (const v of vRes.data ?? []) {
      const tel = normalizeBrPhone((v as any).telefone ?? "");
      if (!tel) continue;
      out.push({ id: `v:${(v as any).id}`, nome: (v as any).nome, telefone: tel, origem: "vendedor", foto_url: (v as any).foto_url });
    }
    for (const t of tRes.data ?? []) {
      const tel = normalizeBrPhone((t as any).telefone ?? "");
      if (!tel) continue;
      out.push({ id: `t:${(t as any).id}`, nome: (t as any).nome, telefone: tel, origem: "equipe", subtitulo: (t as any).funcao, foto_url: (t as any).foto_url });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome));
  });

export const listNotificationDispatchLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => ({ limit: Math.min(Math.max(Number(d?.limit ?? 80), 1), 200) }))
  .handler(async (ctx: any) => {
    const context = ctx?.context;
    const limit = ctx?.data?.limit ?? 80;
    if (!context?.supabase) throw new Error("Contexto Supabase indisponível");

    const [callRes, taskRes] = await Promise.all([
      context.supabase
        .from("wa_call_reminders" as any)
        .select("id,event_id,channel_id,contact_wa,lead_nome,hora,convidados,status,sent_at,replied_at,wa_message_id,created_at,kind,error_message")
        .order("created_at", { ascending: false })
        .limit(limit),
      context.supabase
        .from("wa_task_notifications" as any)
        .select("id,task_id,member_id,kind,channel_id,contact_wa,wa_message_id,status,sent_at,created_at,error_message")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (callRes.error) throw callRes.error;
    if (taskRes.error) throw taskRes.error;

    const logs = [
      ...((callRes.data ?? []) as any[]).map((r) => ({
        id: `call:${r.id}`,
        sourceId: r.id,
        type: r.kind === "attendance" ? "Comparecimento de call" : "Lembrete de call",
        category: "call",
        recipientName: r.lead_nome ?? null,
        phone: r.contact_wa ?? null,
        status: r.status ?? "pending",
        waMessageId: r.wa_message_id ?? null,
        sentAt: r.sent_at ?? null,
        createdAt: r.created_at ?? null,
        repliedAt: r.replied_at ?? null,
        channelId: r.channel_id ?? null,
        errorMessage: r.error_message ?? null,
        details: [
          r.hora ? `Call ${r.hora}` : null,
          r.convidados ? `Convidados: ${r.convidados}` : null,
          r.event_id ? `Evento ${String(r.event_id).slice(0, 12)}` : null,
        ].filter(Boolean).join(" · "),
      })),
      ...((taskRes.data ?? []) as any[]).map((r) => ({
        id: `task:${r.id}`,
        sourceId: r.id,
        type: r.kind === "due_soon" ? "Tarefa perto do prazo" : r.kind === "overdue" ? "Tarefa vencida" : "Tarefa criada",
        category: "task",
        recipientName: null,
        phone: r.contact_wa ?? null,
        status: r.status ?? "pending",
        waMessageId: r.wa_message_id ?? null,
        sentAt: r.sent_at ?? null,
        createdAt: r.created_at ?? null,
        errorMessage: r.error_message ?? null,
        details: r.task_id ? `Task ${String(r.task_id).slice(0, 8)}` : "",
      })),
    ];

    return logs
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .slice(0, limit);
  });

export const retryNotificationDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { logId: string }) => ({ logId: String(d?.logId ?? "").trim() }))
  .handler(async (ctx: any) => {
    const context = ctx?.context;
    const logId = ctx?.data?.logId as string;
    if (!context?.supabase) throw new Error("Contexto Supabase indisponível");
    if (!logId || !logId.includes(":")) throw new Error("logId inválido");

    const [kind, rawId] = logId.split(":");
    const db = context.supabase;
    const { sendWA } = await import("@/lib/flow-engine.server");

    const renderTpl = (tpl: string, vars: Record<string, string>) =>
      String(tpl ?? "").replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

    const loadTpl = async (slug: string) => {
      const { data } = await db.from("wa_templates" as any).select("*").eq("slug", slug).maybeSingle();
      return data as any;
    };

    if (kind === "call") {
      const { data: row, error } = await db
        .from("wa_call_reminders" as any)
        .select("*")
        .eq("id", rawId)
        .maybeSingle();
      if (error || !row) throw new Error("Registro não encontrado");
      const r = row as any;
      if (!r.contact_wa) throw new Error("Sem telefone");
      if (!r.channel_id) throw new Error("Sem canal vinculado");

      const isAttendance = r.kind === "attendance";
      const slug = isAttendance ? "comparecimento_call" : "lembrete_call_v2";
      const tpl = (await loadTpl(slug)) ?? (await loadTpl("lembrete_call"));
      if (!tpl) throw new Error(`Template ${slug} não encontrado`);

      const text = renderTpl(String(tpl.conteudo ?? ""), {
        nome: r.lead_nome ?? "",
        hora: r.hora ?? "",
        convidados: r.convidados ?? "",
      });

      let body: any;
      if (isAttendance) {
        const tplButtons: Array<{ id: string; label: string }> =
          Array.isArray(tpl.buttons) && tpl.buttons.length > 0
            ? tpl.buttons
            : [
                { id: "showup", label: "✅ Show up" },
                { id: "noshow", label: "❌ No show" },
                { id: "remarcada", label: "🔄 Call remarcada" },
              ];
        body = {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text },
            action: {
              buttons: tplButtons.slice(0, 3).map((b) => ({
                type: "reply",
                reply: { id: `callack:${rawId}:${b.id}`, title: b.label.slice(0, 20) },
              })),
            },
          },
        };
      } else {
        body = { type: "text", text: { body: text } };
      }

      await db
        .from("wa_call_reminders" as any)
        .update({ status: "pending", error_message: null })
        .eq("id", rawId);

      try {
        const { waMsgId } = await sendWA(r.channel_id, r.contact_wa, body, db);
        await db
          .from("wa_call_reminders" as any)
          .update({ status: "sent", sent_at: new Date().toISOString(), wa_message_id: waMsgId, error_message: null })
          .eq("id", rawId);
        return { ok: true, waMsgId };
      } catch (e: any) {
        const msg = e?.message ?? "Falha ao reenviar";
        await db
          .from("wa_call_reminders" as any)
          .update({ status: "failed", error_message: msg })
          .eq("id", rawId);
        throw new Error(msg);
      }
    }

    if (kind === "task") {
      const { data: row, error } = await db
        .from("wa_task_notifications" as any)
        .select("*")
        .eq("id", rawId)
        .maybeSingle();
      if (error || !row) throw new Error("Registro não encontrado");
      const r = row as any;
      if (!r.contact_wa) throw new Error("Sem telefone");
      if (!r.channel_id) throw new Error("Sem canal vinculado");

      const { data: task } = await db
        .from("tasks" as any)
        .select("id,titulo,prioridade,prazo,created_at")
        .eq("id", r.task_id)
        .maybeSingle();
      const slug = r.kind === "due_soon" ? "task_due_soon" : r.kind === "overdue" ? "task_overdue" : "task_created";
      const tpl = await loadTpl(slug);
      if (!tpl) throw new Error(`Template ${slug} não encontrado`);

      const fmt = (iso: any) => {
        if (!iso) return "";
        try { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }); } catch { return ""; }
      };
      const vars = {
        titulo: String((task as any)?.titulo ?? ""),
        prioridade: String((task as any)?.prioridade ?? "normal"),
        criada: fmt((task as any)?.created_at),
        prazo: fmt((task as any)?.prazo),
      };
      const text = renderTpl(String(tpl.conteudo ?? ""), vars);
      const body = { type: "text", text: { body: text } };

      await db
        .from("wa_task_notifications" as any)
        .update({ status: "pending", error_message: null })
        .eq("id", rawId);

      try {
        const { waMsgId } = await sendWA(r.channel_id, r.contact_wa, body, db);
        await db
          .from("wa_task_notifications" as any)
          .update({ status: "sent", sent_at: new Date().toISOString(), wa_message_id: waMsgId, error_message: null })
          .eq("id", rawId);
        return { ok: true, waMsgId };
      } catch (e: any) {
        const msg = e?.message ?? "Falha ao reenviar";
        await db
          .from("wa_task_notifications" as any)
          .update({ status: "failed", error_message: msg })
          .eq("id", rawId);
        throw new Error(msg);
      }
    }

    throw new Error("Tipo de log não suportado");
  });



