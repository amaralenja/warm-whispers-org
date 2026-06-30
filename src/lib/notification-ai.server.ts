// Notification AI assistant — handles WhatsApp conversations from the
// notification channel after a call-reminder button is pressed.
// Uses OpenAI directly (already configured) with tool calling.

import { sendWA } from "@/lib/flow-engine.server";

const EVOHUB_BASE = "https://api.evohub.ai";

type AnyDb = any;

// ---- Phone normalization & allowlist ----
// Gera variantes possíveis (com/sem 9º dígito, com/sem 55) pra um número BR.
function brPhoneVariants(raw: string): string[] {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return [];
  let local = digits.startsWith("55") ? digits.slice(2) : digits;
  // remove zeros à esquerda de DDD se houver
  local = local.replace(/^0+/, "");
  if (local.length < 10 || local.length > 11) return [digits];
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  // versão sem 9 (10 dígitos) e com 9 (11 dígitos)
  const sem9 = rest.length === 9 && rest.startsWith("9") ? rest.slice(1) : rest.length === 8 ? rest : null;
  const com9 = rest.length === 8 ? "9" + rest : rest.length === 9 ? rest : null;
  const out = new Set<string>();
  if (sem9) {
    out.add(`55${ddd}${sem9}`);
    out.add(`${ddd}${sem9}`);
  }
  if (com9) {
    out.add(`55${ddd}${com9}`);
    out.add(`${ddd}${com9}`);
  }
  out.add(digits);
  return Array.from(out);
}

async function isAllowedContact(db: AnyDb, contactWa: string): Promise<boolean> {
  const variants = brPhoneVariants(contactWa);
  if (!variants.length) return false;
  const [{ data: vend }, { data: team }] = await Promise.all([
    db.from("vendedores").select("id,telefone").not("telefone", "is", null),
    db.from("team_members").select("id,telefone").not("telefone", "is", null),
  ]);
  const allPhones: string[] = [];
  for (const r of (vend ?? []) as any[]) allPhones.push(...brPhoneVariants(r.telefone));
  for (const r of (team ?? []) as any[]) allPhones.push(...brPhoneVariants(r.telefone));
  const set = new Set(allPhones);
  return variants.some((v) => set.has(v));
}

type SessionRow = {
  id: string;
  channel_id: string;
  contact_wa: string;
  contact_name: string | null;
  reminder_id: string | null;
  calendar_event_id: string | null;
  status: string;
  last_button: string | null;
  messages: ChatMsg[];
  context: Record<string, any>;
};

type ChatMsg =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: any[] }
  | { role: "tool"; tool_call_id: string; content: string };

const SYSTEM_PROMPT = `Você é a assistente de IA da Multum, atendendo no WhatsApp pelo número de notificações. Você fala com vendedores e membros do time.

Você pode (chame a tool correspondente, não invente números):
- Confirmar presença em call (showup/no-show/remarcada) quando a pessoa responder a um lembrete.
- Listar/criar/remarcar/cancelar calls no Google Calendar (list_upcoming_calls, create_call, reschedule_call, cancel_call).
- Trazer relatório geral do dia (get_dashboard_snapshot): vendas, top vendedor, financeiro, leads, calls, ads, quiz.
- Vendas detalhadas: get_sales_today (top vendedores + total).
- Leads CRM por operação: get_leads_summary.
- Minhas tarefas: get_my_tasks (pendentes pra hoje/atrasadas).
- Resumo de calls (hoje/amanhã/semana/mês): get_calls_summary.
- Ads do mês: get_ads_summary.
- Quiz HighTicket: get_quiz_summary.
- Financeiro do mês: get_financial_summary.

Estilo:
- Português BR informal, vibe de gente real, NUNCA robótica.
- Mensagens curtas e diretas. Sem floreio. Sem travessão (— ou –). Vírgula e ponto.
- Sempre que pedirem dado, chame a tool antes de responder. Não chute número.
- Quando o assunto fechar, chame end_session.

Hoje é ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" })} (America/Sao_Paulo). Use isso pra resolver "amanhã", "sexta", etc.`;

function getOpenAIKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada");
  return key;
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_upcoming_calls",
      description: "Lista próximas calls do Google Calendar. Use quando o usuário pedir agenda, 'minhas calls', 'o que tenho hoje'.",
      parameters: {
        type: "object",
        properties: { days_ahead: { type: "number", description: "Janela em dias. Default 7." } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_call",
      description: "Cria nova call no Google Calendar. Resolva data/hora pra ISO 8601 com offset -03:00.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          start_iso: { type: "string", description: "Início ISO 8601 com -03:00." },
          duration_minutes: { type: "number", description: "Default 60." },
          descricao: { type: "string" },
        },
        required: ["titulo", "start_iso"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reschedule_call",
      description: "Remarca call existente. Se não houver event_id na sessão, chame list_upcoming_calls antes.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "ID do evento (opcional se a sessão já tem calendar_event_id)." },
          start_iso: { type: "string", description: "Novo início ISO 8601 com -03:00." },
          duration_minutes: { type: "number", description: "Default 60." },
          motivo: { type: "string" },
        },
        required: ["start_iso"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cancel_call",
      description: "Cancela (deleta) uma call do Google Calendar.",
      parameters: {
        type: "object",
        properties: { event_id: { type: "string" } },
      },
    },
  },
  { type: "function" as const, function: { name: "get_dashboard_snapshot", description: "Snapshot geral de hoje/mês: vendas, top vendedor, financeiro, leads, calls, ads, quiz. Use quando pedirem 'relatório', 'como tá hoje', 'me dá um overview'.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "get_sales_today", description: "Ranking de vendas de hoje por vendedor.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "get_leads_summary", description: "Quantos leads no CRM hoje e por operação/expert.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "get_my_tasks", description: "Tarefas pendentes (hoje + atrasadas) da pessoa que está conversando.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "get_calls_summary", description: "Calls hoje, amanhã, semana, ontem, mês — geral.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "get_ads_summary", description: "Gasto e métricas de Meta Ads no mês atual.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "get_quiz_summary", description: "Funil do quiz HighTicket: total, completos hoje, qualificados por faixa.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "get_financial_summary", description: "Resumo financeiro do mês: receitas, despesas, saldo, próximos vencimentos.", parameters: { type: "object", properties: {} } } },
  {
    type: "function" as const,
    function: {
      name: "end_session",
      description: "Encerra a conversa quando o assunto estiver resolvido.",
      parameters: {
        type: "object",
        properties: { resumo: { type: "string" } },
        required: ["resumo"],
      },
    },
  },
];

function openerForButton(buttonId: string, sess: SessionRow): string {
  const nome = (sess.contact_name || "").split(" ")[0] || "";
  const hora = String(sess.context?.hora ?? "");
  const horaTxt = hora ? ` da call das ${hora}` : "";
  if (buttonId === "showup") {
    return `Fechou${nome ? `, ${nome}` : ""}! Já anotei aqui que você confirmou presença${horaTxt}. Qualquer mudança, é só me chamar.`;
  }
  if (buttonId === "noshow") {
    return `Tranquilo${nome ? `, ${nome}` : ""}, já registrei aqui que você não vai conseguir${horaTxt}. Se quiser, posso remarcar pra outro dia. Me fala se rola.`;
  }
  // remarcada
  return `Beleza${nome ? `, ${nome}` : ""}! Você já reagendou essa call${horaTxt} por conta própria, ou quer que eu remarque pra você? Se sim, me passa a nova data e horário.`;
}

async function nowISO() {
  return new Date().toISOString();
}

async function saveSession(db: AnyDb, sess: SessionRow) {
  await db
    .from("wa_ai_sessions")
    .update({
      messages: sess.messages,
      context: sess.context,
      status: sess.status,
      last_button: sess.last_button,
    })
    .eq("id", sess.id);
}

async function callOpenAI(messages: ChatMsg[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      tools: TOOLS,
      tool_choice: "auto",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

// ---- Audio transcription (incoming voice) ----
async function evoMeta(path: string) {
  const key = process.env.EVOHUB_API_KEY;
  if (!key) throw new Error("EVOHUB_API_KEY missing");
  const res = await fetch(`${EVOHUB_BASE}/meta/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`evo meta ${res.status}: ${await res.text()}`);
  return res;
}

async function evoMetaWithToken(path: string, token?: string | null) {
  const key = token || process.env.EVOHUB_API_KEY;
  if (!key) throw new Error("EvoHub/Meta token missing");
  const res = await fetch(`${EVOHUB_BASE}/meta/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`evo meta ${res.status}: ${await res.text()}`);
  return res;
}

async function probeWaMediaToken(token: string, phoneNumberId?: string | null): Promise<boolean> {
  if (!token || !phoneNumberId) return false;
  try {
    const res = await fetch(`${EVOHUB_BASE}/meta/v23.0/${phoneNumberId}?fields=id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function resolveWaMediaToken(db: AnyDb, channelId: string, phoneNumberId?: string | null): Promise<string | null> {
  const { data: local } = await db
    .from("wa_channels")
    .select("id,token,phone_number_id")
    .eq("id", channelId)
    .maybeSingle();
  const localToken = local?.token ? String(local.token) : "";
  const localPhoneId = phoneNumberId || local?.phone_number_id || null;
  if (localToken && (!localPhoneId || await probeWaMediaToken(localToken, localPhoneId))) return localToken;

  const apiKey = process.env.EVOHUB_API_KEY;
  if (!apiKey || !localPhoneId) return localToken || apiKey || null;
  try {
    const res = await fetch(`${EVOHUB_BASE}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return localToken || null;
    const body = await res.json();
    const list: any[] = Array.isArray(body) ? body : body?.data ?? body?.channels ?? [];
    for (const row of list) {
      const detailRes = await fetch(`${EVOHUB_BASE}/api/v1/channels/${row.id}`, {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      }).catch(() => null);
      const detail = detailRes?.ok ? await detailRes.json().catch(() => row) : row;
      const token = detail?.token ? String(detail.token) : "";
      if (token && await probeWaMediaToken(token, localPhoneId)) {
        await db.from("wa_channels").update({ token, synced_at: new Date().toISOString() }).eq("id", channelId);
        return token;
      }
    }
  } catch (e) {
    console.warn("[notif-ai] resolveWaMediaToken failed", (e as any)?.message ?? e);
  }
  return localToken || null;
}

export async function transcribeWaAudio(mediaId: string, phoneNumberId: string, mediaToken?: string): Promise<string> {
  // Step 1: get media URL from Meta (via EvoHub proxy)
  const metaRes = await evoMetaWithToken(`v23.0/${mediaId}`, mediaToken);
  const info = await metaRes.json();
  const url = info?.url;
  if (!url) throw new Error("media url não retornada");

  // Step 2: download bytes
  const dl = await fetch(url, {
    headers: { Authorization: `Bearer ${mediaToken || process.env.EVOHUB_API_KEY}` },
  });
  if (!dl.ok) throw new Error(`download media ${dl.status}`);
  const buf = await dl.arrayBuffer();
  const mime = info?.mime_type || "audio/ogg";
  const ext = mime.includes("mp4") ? "mp4" : mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : "ogg";

  // Step 3: send to OpenAI Whisper (gpt-4o-mini-transcribe accepts ogg too)
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: mime }), `audio.${ext}`);
  fd.append("model", "gpt-4o-mini-transcribe");
  const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${getOpenAIKey()}` },
    body: fd,
  });
  if (!tr.ok) throw new Error(`whisper ${tr.status}: ${(await tr.text()).slice(0, 200)}`);
  const j: any = await tr.json();
  return String(j?.text || "").trim();
}

// ---- Image understanding (vision) ----
export async function describeWaImage(
  mediaId: string,
  phoneNumberId: string,
  caption?: string,
  mediaToken?: string,
): Promise<string> {
  const metaRes = await evoMetaWithToken(`v23.0/${mediaId}`, mediaToken);
  const info = await metaRes.json();
  const url = info?.url;
  if (!url) throw new Error("media url não retornada");
  const dl = await fetch(url, {
    headers: { Authorization: `Bearer ${mediaToken || process.env.EVOHUB_API_KEY}` },
  });
  if (!dl.ok) throw new Error(`download image ${dl.status}`);
  const buf = await dl.arrayBuffer();
  const mime = info?.mime_type || "image/jpeg";
  const b64 = Buffer.from(buf).toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;

  const vr = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Descreva o conteúdo desta imagem em 1-2 frases curtas, em português BR. Se tiver texto legível na imagem, inclua. Se for print de agenda/calendário, extraia datas e horários.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!vr.ok) throw new Error(`vision ${vr.status}: ${(await vr.text()).slice(0, 200)}`);
  const j: any = await vr.json();
  const desc = String(j?.choices?.[0]?.message?.content || "").trim();
  return caption ? `[Imagem enviada — ${desc}] Legenda: ${caption}` : `[Imagem enviada — ${desc}]`;
}

// ---- Calendar reschedule ----
async function rescheduleCalendarEvent(eventId: string, startISO: string, durationMin: number) {
  const { gcal } = await import("@/lib/google-calendar.functions");
  const endISO = new Date(new Date(startISO).getTime() + durationMin * 60_000).toISOString();
  // Preserve title but ensure the 🔄 prefix is set
  let summary: string | undefined;
  try {
    const ev: any = await gcal(`/events/${encodeURIComponent(eventId)}`);
    const base = String(ev?.summary || "").replace(/^([✅❌🔄])\s+/, "");
    summary = `🔄 ${base}`;
  } catch {}
  return gcal(`/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(summary ? { summary } : {}),
      start: { dateTime: startISO, timeZone: "America/Sao_Paulo" },
      end: { dateTime: endISO, timeZone: "America/Sao_Paulo" },
      extendedProperties: {
        private: { attendance_status: "remarcada", rescheduled_at: new Date().toISOString() },
      },
    }),
  });
}

// ---- Identify contact (vendedor ou team) ----
async function identifyContact(db: AnyDb, contactWa: string): Promise<{ tipo: "vendedor" | "team"; id: string; nome: string; utm?: string } | null> {
  const variants = brPhoneVariants(contactWa);
  const [{ data: vend }, { data: team }] = await Promise.all([
    db.from("vendedores").select("id,nome,utm,telefone").not("telefone", "is", null),
    db.from("team_members").select("id,nome,telefone").not("telefone", "is", null),
  ]);
  for (const v of (vend ?? []) as any[]) {
    const vs = brPhoneVariants(v.telefone);
    if (vs.some((x) => variants.includes(x))) return { tipo: "vendedor", id: String(v.id), nome: v.nome, utm: v.utm };
  }
  for (const t of (team ?? []) as any[]) {
    const ts = brPhoneVariants(t.telefone);
    if (ts.some((x) => variants.includes(x))) return { tipo: "team", id: String(t.id), nome: t.nome };
  }
  return null;
}

function brlFmt(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

async function gcalRange(timeMin: string, timeMax: string) {
  const { gcal } = await import("@/lib/google-calendar.functions");
  const params = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const r: any = await gcal(`/events?${params.toString()}`);
  return (r?.items ?? []) as any[];
}

function brtRange(fromDate: Date, toDate: Date) {
  return { timeMin: fromDate.toISOString(), timeMax: toDate.toISOString() };
}

function startOfTodayBRT(): Date {
  const now = new Date();
  const s = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  s.setHours(0, 0, 0, 0);
  // convert back to UTC ms by reapplying offset
  const diff = s.getTime() - now.getTime() + (now.getTimezoneOffset() - s.getTimezoneOffset()) * 60000;
  return new Date(now.getTime() + diff);
}

// ---- Report builders ----
async function reportSalesToday(db: AnyDb) {
  const { data } = await db.rpc("get_ranking_tv_stats");
  const ranking = (data?.ranking ?? []).filter((r: any) => r.vendas > 0).slice(0, 5);
  return {
    total_faturamento: brlFmt(data?.totalFaturamento || 0),
    total_vendas: data?.totalVendas || 0,
    ticket_medio: brlFmt(data?.ticketMedioGeral || 0),
    top_vendedores: ranking.map((r: any) => ({
      nome: r.nome, utm: r.utm, faturamento: brlFmt(r.faturamento), vendas: r.vendas, meta_pct: Math.round(r.metaPct),
    })),
  };
}

async function reportLeads(db: AnyDb) {
  const todayISO = startOfTodayBRT().toISOString();
  const { count: totalHoje } = await db.from("crm_leads").select("id", { count: "exact", head: true }).gte("created_at", todayISO);
  const { data: byExpert } = await db.from("crm_leads").select("expert").gte("created_at", todayISO);
  const counts: Record<string, number> = {};
  for (const r of (byExpert ?? []) as any[]) counts[r.expert || "—"] = (counts[r.expert || "—"] || 0) + 1;
  return { leads_hoje: totalHoje ?? 0, por_operacao: counts };
}

async function reportMyTasks(db: AnyDb, me: { id: string } | null) {
  if (!me) return { erro: "não identifiquei seu cadastro" };
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const { data } = await db
    .from("tasks").select("titulo,prazo,prioridade,concluida,assignee_ids")
    .contains("assignee_ids", [me.id])
    .eq("concluida", false)
    .order("prazo", { ascending: true })
    .limit(20);
  const items = (data ?? []) as any[];
  const atrasadas = items.filter((t) => t.prazo && new Date(t.prazo) < new Date());
  const hoje = items.filter((t) => t.prazo && new Date(t.prazo) <= todayEnd && new Date(t.prazo) >= new Date());
  return {
    pendentes_total: items.length,
    atrasadas: atrasadas.map((t) => ({ titulo: t.titulo, prazo: t.prazo, prioridade: t.prioridade })),
    hoje: hoje.map((t) => ({ titulo: t.titulo, prazo: t.prazo, prioridade: t.prioridade })),
  };
}

async function reportCalls() {
  const now = new Date();
  const startHoje = startOfTodayBRT();
  const endHoje = new Date(startHoje.getTime() + 86400_000);
  const endAmanha = new Date(startHoje.getTime() + 2 * 86400_000);
  const startOntem = new Date(startHoje.getTime() - 86400_000);
  const endSemana = new Date(startHoje.getTime() + 7 * 86400_000);
  const startMes = new Date(now.getFullYear(), now.getMonth(), 1);
  try {
    const [hoje, amanha, semana, ontem, mes] = await Promise.all([
      gcalRange(startHoje.toISOString(), endHoje.toISOString()),
      gcalRange(endHoje.toISOString(), endAmanha.toISOString()),
      gcalRange(startHoje.toISOString(), endSemana.toISOString()),
      gcalRange(startOntem.toISOString(), startHoje.toISOString()),
      gcalRange(startMes.toISOString(), now.toISOString()),
    ]);
    const tally = (items: any[]) => {
      let show = 0, no = 0, rem = 0;
      for (const e of items) {
        const s = String(e.summary || "");
        if (s.startsWith("✅")) show++;
        else if (s.startsWith("❌")) no++;
        else if (s.startsWith("🔄")) rem++;
      }
      return { total: items.length, showup: show, noshow: no, remarcada: rem };
    };
    return {
      hoje: tally(hoje),
      amanha: tally(amanha),
      proxima_semana: tally(semana),
      ontem: tally(ontem),
      mes_ate_agora: tally(mes),
    };
  } catch (e: any) {
    return { erro: `calendário: ${e?.message || e}` };
  }
}

async function reportAdsMonth() {
  try {
    const accountId = process.env.META_ADS_ACCOUNT_ID;
    const token = process.env.META_ADS_SYSTEM_USER_TOKEN;
    if (!accountId || !token) return { erro: "Meta Ads não configurado" };
    const since = new Date(); since.setDate(1); const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = new Date().toISOString().slice(0, 10);
    const url = `https://graph.facebook.com/v20.0/act_${accountId}/insights?fields=spend,impressions,clicks,ctr,cpm,actions&time_range=${encodeURIComponent(JSON.stringify({ since: sinceStr, until: untilStr }))}&access_token=${token}`;
    const r = await fetch(url);
    const j: any = await r.json();
    const row = j?.data?.[0];
    if (!row) return { erro: "sem dados de insights", raw: j?.error?.message };
    const purchases = (row.actions || []).find((a: any) => a.action_type === "purchase")?.value;
    return {
      gasto: brlFmt(Number(row.spend || 0)),
      impressoes: Number(row.impressions || 0),
      cliques: Number(row.clicks || 0),
      ctr: row.ctr ? `${Number(row.ctr).toFixed(2)}%` : "—",
      cpm: row.cpm ? brlFmt(Number(row.cpm)) : "—",
      conversoes: purchases ? Number(purchases) : 0,
      periodo: `${sinceStr} → ${untilStr}`,
    };
  } catch (e: any) {
    return { erro: e?.message || String(e) };
  }
}

async function reportQuiz(db: AnyDb) {
  const todayISO = startOfTodayBRT().toISOString();
  const [{ count: total }, { count: hoje }] = await Promise.all([
    db.from("ht_leads").select("id", { count: "exact", head: true }),
    db.from("ht_leads").select("id", { count: "exact", head: true }).gte("created_at", todayISO),
  ]);
  // tenta achar faixa de faturamento em metadata
  const { data: rows } = await db.from("ht_leads").select("dados,created_at").gte("created_at", todayISO).limit(500);
  const faixas: Record<string, number> = {};
  for (const r of (rows ?? []) as any[]) {
    const f = r?.dados?.faturamento || r?.dados?.faixa || "não informado";
    faixas[f] = (faixas[f] || 0) + 1;
  }
  return { total_quiz: total ?? 0, completos_hoje: hoje ?? 0, faixas_hoje: faixas };
}

async function reportFinancial(db: AnyDb) {
  const now = new Date();
  const ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const { data } = await db
    .from("financeiro").select("tipo,valor,status,data_vencimento,descricao")
    .gte("data_ref", ini)
    .limit(500);
  const rows = (data ?? []) as any[];
  let receitas = 0, despesas = 0, aReceber = 0, aPagar = 0;
  for (const r of rows) {
    const v = Number(r.valor || 0);
    if (r.tipo === "receita") { receitas += v; if (r.status !== "pago") aReceber += v; }
    else { despesas += v; if (r.status !== "pago") aPagar += v; }
  }
  const proximos = rows
    .filter((r) => r.status !== "pago" && r.data_vencimento)
    .sort((a, b) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)))
    .slice(0, 5)
    .map((r) => ({ desc: r.descricao, vence: r.data_vencimento, valor: brlFmt(r.valor), tipo: r.tipo }));
  return {
    receitas_mes: brlFmt(receitas), despesas_mes: brlFmt(despesas),
    saldo_mes: brlFmt(receitas - despesas),
    a_receber: brlFmt(aReceber), a_pagar: brlFmt(aPagar),
    proximos_vencimentos: proximos,
  };
}

async function snapshot(db: AnyDb, me: { id: string } | null) {
  const [vendas, leads, calls, ads, quiz, fin, tasks] = await Promise.allSettled([
    reportSalesToday(db), reportLeads(db), reportCalls(), reportAdsMonth(), reportQuiz(db), reportFinancial(db), reportMyTasks(db, me),
  ]);
  const pick = (p: any) => p.status === "fulfilled" ? p.value : { erro: String(p.reason?.message || p.reason) };
  return {
    vendas_hoje: pick(vendas),
    leads: pick(leads),
    calls: pick(calls),
    ads_mes: pick(ads),
    quiz: pick(quiz),
    financeiro_mes: pick(fin),
    minhas_tarefas: pick(tasks),
  };
}

// ---- Main entry points ----


export async function startNotificationSession(opts: {
  db: AnyDb;
  channelId: string;
  contactWa: string;
  contactName: string | null;
  reminderId: string;
  calendarEventId: string | null;
  buttonId: "showup" | "noshow" | "remarcada";
  hora: string | null;
}) {
  const { db, channelId, contactWa, contactName, reminderId, calendarEventId, buttonId, hora } = opts;

  // Allowlist: só responde se o número for de vendedor ou membro da equipe
  if (!(await isAllowedContact(db, contactWa))) {
    console.log("[notif-ai] contato fora da allowlist, ignorando", contactWa);
    return;
  }
  await db
    .from("wa_ai_sessions")
    .update({ status: "closed" })
    .eq("channel_id", channelId)
    .eq("contact_wa", contactWa)
    .eq("status", "active");

  const initialMsgs: ChatMsg[] = [
    {
      role: "user",
      content: `[Sistema] A pessoa ${contactName || contactWa} clicou no botão "${buttonId}" do lembrete da call${hora ? ` das ${hora}` : ""}. Cumprimente brevemente e siga o fluxo conforme o botão.`,
    },
  ];

  const { data: inserted, error: insErr } = await db
    .from("wa_ai_sessions")
    .insert({
      channel_id: channelId,
      contact_wa: contactWa,
      contact_name: contactName,
      reminder_id: reminderId,
      calendar_event_id: calendarEventId,
      status: "active",
      last_button: buttonId,
      messages: initialMsgs,
      context: { hora, started_at: await nowISO() },
    })
    .select("*")
    .single();
  if (insErr || !inserted) throw new Error(insErr?.message || "Falha ao criar sessão IA");

  // Send a deterministic opener (avoids cold-start LLM call) and store it
  const opener = openerForButton(buttonId, inserted as SessionRow);
  await sendWA(channelId, contactWa, { type: "text", text: { body: opener, preview_url: false } }, db);

  const msgs = [...initialMsgs, { role: "assistant" as const, content: opener }];
  await db
    .from("wa_ai_sessions")
    .update({ messages: msgs })
    .eq("id", (inserted as any).id);
}

export async function continueNotificationSession(opts: {
  db: AnyDb;
  channelId: string;
  contactWa: string;
  userText: string;
}) {
  const { db, channelId, contactWa, userText } = opts;
  if (!userText.trim()) return;

  // Allowlist: só responde vendedores e team_members
  if (!(await isAllowedContact(db, contactWa))) {
    console.log("[notif-ai] contato fora da allowlist, ignorando", contactWa);
    return;
  }

  let { data: sessRow } = await db
    .from("wa_ai_sessions")
    .select("*")
    .eq("channel_id", channelId)
    .eq("contact_wa", contactWa)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Cold session: criar uma nova quando a pessoa manda mensagem sem ter clicado em botão
  if (!sessRow) {
    const { data: inserted, error: insErr } = await db
      .from("wa_ai_sessions")
      .insert({
        channel_id: channelId,
        contact_wa: contactWa,
        contact_name: null,
        reminder_id: null,
        calendar_event_id: null,
        status: "active",
        last_button: null,
        messages: [],
        context: { cold_start: true, started_at: new Date().toISOString() },
      })
      .select("*")
      .single();
    if (insErr || !inserted) {
      console.error("[notif-ai] falha criando sessão fria", insErr);
      return;
    }
    sessRow = inserted;
  }
  const sess = sessRow as SessionRow;

  sess.messages = Array.isArray(sess.messages) ? sess.messages : [];
  sess.messages.push({ role: "user", content: userText });

  // Tool-calling loop (max 4 hops)
  for (let hop = 0; hop < 4; hop++) {
    const resp = await callOpenAI(sess.messages);
    const choice = resp?.choices?.[0]?.message;
    if (!choice) break;

    sess.messages.push({
      role: "assistant",
      content: choice.content ?? null,
      tool_calls: choice.tool_calls,
    } as any);

    const toolCalls: any[] = choice.tool_calls || [];
    if (toolCalls.length === 0) {
      // final text reply
      const reply = String(choice.content || "").trim();
      if (reply) {
        await sendWA(channelId, contactWa, { type: "text", text: { body: reply, preview_url: false } }, db);
      }
      await saveSession(db, sess);
      return;
    }

    // execute tools
    for (const call of toolCalls) {
      const name = call?.function?.name;
      let args: any = {};
      try {
        args = JSON.parse(call?.function?.arguments || "{}");
      } catch {}
      let toolOut = "";
      try {
        if (name === "list_upcoming_calls") {
          const { gcal } = await import("@/lib/google-calendar.functions");
          const days = Math.max(1, Math.min(60, Number(args.days_ahead || 7)));
          const timeMin = new Date().toISOString();
          const timeMax = new Date(Date.now() + days * 86400_000).toISOString();
          const params = new URLSearchParams({
            timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "20",
          });
          const r: any = await gcal(`/events?${params.toString()}`);
          const items = (r?.items ?? []).map((ev: any) => ({
            event_id: ev.id,
            titulo: ev.summary,
            inicio: ev.start?.dateTime || ev.start?.date,
            fim: ev.end?.dateTime || ev.end?.date,
          }));
          toolOut = JSON.stringify({ ok: true, calls: items });
        } else if (name === "create_call") {
          const { gcal } = await import("@/lib/google-calendar.functions");
          const startISO = String(args.start_iso || "");
          const dur = Number(args.duration_minutes || 60);
          const endISO = new Date(new Date(startISO).getTime() + dur * 60_000).toISOString();
          const created: any = await gcal(`/events`, {
            method: "POST",
            body: JSON.stringify({
              summary: String(args.titulo || "Call"),
              description: args.descricao || "",
              start: { dateTime: startISO, timeZone: "America/Sao_Paulo" },
              end: { dateTime: endISO, timeZone: "America/Sao_Paulo" },
            }),
          });
          toolOut = JSON.stringify({ ok: true, event_id: created?.id, inicio: startISO });
        } else if (name === "reschedule_call") {
          const eventId = String(args.event_id || sess.calendar_event_id || "");
          if (!eventId) {
            toolOut = JSON.stringify({ ok: false, error: "sem event_id; chame list_upcoming_calls antes" });
          } else {
            const startISO = String(args.start_iso || "");
            const dur = Number(args.duration_minutes || 60);
            await rescheduleCalendarEvent(eventId, startISO, dur);
            if (sess.reminder_id) {
              await db.from("wa_call_reminders")
                .update({ status: "remarcada", replied_at: await nowISO() })
                .eq("id", sess.reminder_id);
            }
            toolOut = JSON.stringify({ ok: true, novo_inicio: startISO, duracao: dur });
          }
        } else if (name === "cancel_call") {
          const { gcal } = await import("@/lib/google-calendar.functions");
          const eventId = String(args.event_id || sess.calendar_event_id || "");
          if (!eventId) {
            toolOut = JSON.stringify({ ok: false, error: "sem event_id; chame list_upcoming_calls antes" });
          } else {
            await gcal(`/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
            toolOut = JSON.stringify({ ok: true, cancelada: true });
          }
        } else if (name === "get_dashboard_snapshot") {
          const me = await identifyContact(db, contactWa);
          toolOut = JSON.stringify({ ok: true, ...(await snapshot(db, me)) });
        } else if (name === "get_sales_today") {
          toolOut = JSON.stringify({ ok: true, ...(await reportSalesToday(db)) });
        } else if (name === "get_leads_summary") {
          toolOut = JSON.stringify({ ok: true, ...(await reportLeads(db)) });
        } else if (name === "get_my_tasks") {
          const me = await identifyContact(db, contactWa);
          toolOut = JSON.stringify({ ok: true, ...(await reportMyTasks(db, me)) });
        } else if (name === "get_calls_summary") {
          toolOut = JSON.stringify({ ok: true, ...(await reportCalls()) });
        } else if (name === "get_ads_summary") {
          toolOut = JSON.stringify({ ok: true, ...(await reportAdsMonth()) });
        } else if (name === "get_quiz_summary") {
          toolOut = JSON.stringify({ ok: true, ...(await reportQuiz(db)) });
        } else if (name === "get_financial_summary") {
          toolOut = JSON.stringify({ ok: true, ...(await reportFinancial(db)) });
        } else if (name === "end_session") {
          sess.status = "closed";
          sess.context = { ...sess.context, resumo: args.resumo || "" };
          toolOut = JSON.stringify({ ok: true, encerrada: true });
        } else {
          toolOut = JSON.stringify({ ok: false, error: `tool ${name} desconhecida` });
        }
      } catch (e: any) {
        toolOut = JSON.stringify({ ok: false, error: e?.message || String(e) });
      }
      sess.messages.push({ role: "tool", tool_call_id: call.id, content: toolOut });
    }

    if (sess.status === "closed") {
      const wrap = await callOpenAI(sess.messages);
      const last = wrap?.choices?.[0]?.message?.content;
      if (last) {
        sess.messages.push({ role: "assistant", content: last });
        await sendWA(channelId, contactWa, { type: "text", text: { body: last, preview_url: false } }, db);
      }
      await saveSession(db, sess);
      return;
    }
  }

  await saveSession(db, sess);
}
