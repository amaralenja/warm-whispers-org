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

Você pode:
- Confirmar presença em call (showup/no-show/remarcada) quando a pessoa responder a um lembrete.
- Listar as próximas calls da agenda.
- Criar nova call no Google Calendar.
- Remarcar call existente.
- Cancelar call existente.

Estilo:
- Português BR informal, vibe de gente real, NUNCA robótica.
- Mensagens curtas (1 a 3 frases). Sem floreio.
- NUNCA use travessão (— ou –). Use vírgula ou ponto.
- Não invente datas, horários ou nomes. Se faltar info, pergunte.
- Sempre que for executar uma ação (criar, remarcar, cancelar), chame a tool correspondente em vez de prometer fazer depois.
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

export async function transcribeWaAudio(mediaId: string, phoneNumberId: string): Promise<string> {
  // Step 1: get media URL from Meta (via EvoHub proxy)
  const metaRes = await evoMeta(`${phoneNumberId}/${mediaId}`);
  const info = await metaRes.json();
  const url = info?.url;
  if (!url) throw new Error("media url não retornada");

  // Step 2: download bytes
  const dl = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.EVOHUB_API_KEY}` },
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
): Promise<string> {
  const metaRes = await evoMeta(`${phoneNumberId}/${mediaId}`);
  const info = await metaRes.json();
  const url = info?.url;
  if (!url) throw new Error("media url não retornada");
  const dl = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.EVOHUB_API_KEY}` },
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
        if (name === "reschedule_call") {
          if (!sess.calendar_event_id) {
            toolOut = JSON.stringify({ ok: false, error: "sem calendar_event_id na sessão" });
          } else {
            const startISO = String(args.start_iso || "");
            const dur = Number(args.duration_minutes || 60);
            await rescheduleCalendarEvent(sess.calendar_event_id, startISO, dur);
            // update reminder status
            if (sess.reminder_id) {
              await db
                .from("wa_call_reminders")
                .update({ status: "remarcada", replied_at: await nowISO() })
                .eq("id", sess.reminder_id);
            }
            toolOut = JSON.stringify({ ok: true, novo_inicio: startISO, duracao: dur });
          }
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
      // give the model one more pass to send a closing line, then break
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
