import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendWA } from "@/lib/flow-engine.server";

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
    if (!rest.startsWith("9")) digits = "55" + ddd + "9" + rest;
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
  const { fromIso, toIso, label } = brtDayRange(dateStr);

  // 1. Métricas de comparecimento (kind = attendance) baseadas em ack_button
  const { data: attendance } = await db
    .from("wa_call_reminders" as any)
    .select("ack_button, status")
    .eq("kind", "attendance")
    .gte("created_at", fromIso)
    .lt("created_at", toIso);

  const rows: any[] = (attendance ?? []) as any[];
  const showUps = rows.filter((r) => String(r.ack_button ?? "").includes("showup")).length;
  const noShows = rows.filter((r) => String(r.ack_button ?? "").includes("noshow")).length;
  const remarcadas = rows.filter((r) => String(r.ack_button ?? "").includes("remarcada")).length;
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
  .handler(async ({ data }) => {
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
  .inputValidator((d: { templateId: string }) => d)
  .handler(async ({ data, context }) => {
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
  .inputValidator((d: { templateId: string; telefone: string; nome?: string }) => d)
  .handler(async ({ data, context }) => {
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
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_template_recipients" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

