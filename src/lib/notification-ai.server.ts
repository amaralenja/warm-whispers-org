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

const SYSTEM_PROMPT = `Você é a assistente de IA da Multum, atendendo no WhatsApp pelo número de notificações dos lembretes de call.

Seu trabalho: confirmar a resposta da pessoa de forma humana, curta e direta. Você responde a participantes que clicaram em um botão de confirmação de presença numa call agendada.

Estilo:
- Português BR informal, vibe de gente real, NUNCA robótica.
- Mensagens curtas (1 a 3 frases). Sem floreio, sem "espero que esteja bem".
- NUNCA use travessão (— ou –). Use vírgula ou ponto final.
- Não invente datas, horários ou nomes que não foram informados.
- Se a pessoa quiser remarcar, peça a nova data e horário em linguagem natural. Quando ela disser, chame a tool reschedule_call.
- Se ela disser que já remarcou por conta própria, chame end_session com resumo "remarcou_sozinho".
- Quando a conversa estiver resolvida (presença confirmada, ausência registrada, call remarcada), chame end_session pra fechar.

Contexto que você sempre tem:
- A pessoa acabou de clicar em um botão de confirmação. O botão clicado vem como contexto no início da conversa.
- Você tem acesso à tool reschedule_call (atualiza o evento no Google Calendar) e end_session (encerra a conversa).

Importante: não fale "como uma IA", não se apresente formalmente. Aja como um membro do time confirmando a presença.`;

function getOpenAIKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada");
  return key;
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "reschedule_call",
      description:
        "Remarca a call da pessoa no Google Calendar. Use quando ela informar uma nova data e horário em qualquer formato natural (ex: 'amanhã 15h', 'sexta às 10', '08/01 14:30'). Resolva pra ISO 8601 no timezone America/Sao_Paulo antes de chamar.",
      parameters: {
        type: "object",
        properties: {
          start_iso: {
            type: "string",
            description:
              "Novo horário de início no formato ISO 8601 com offset -03:00 (ex: 2026-07-02T15:00:00-03:00).",
          },
          duration_minutes: {
            type: "number",
            description: "Duração em minutos. Default 60 se a pessoa não falar.",
          },
          motivo: {
            type: "string",
            description: "Motivo curto da remarcação (opcional).",
          },
        },
        required: ["start_iso"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "end_session",
      description:
        "Encerra a conversa quando o assunto estiver resolvido. Use sempre que tudo já estiver fechado (presença confirmada, no-show anotado, remarcada concluída ou pessoa disse que já remarcou).",
      parameters: {
        type: "object",
        properties: {
          resumo: {
            type: "string",
            description:
              "Resumo de 1 linha do desfecho (ex: 'remarcada para 02/07 15h', 'no_show registrado', 'remarcou_sozinho').",
          },
        },
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

// ---- Calendar reschedule ----
async function rescheduleCalendarEvent(eventId: string, startISO: string, durationMin: number) {
  const { gcal } = await import("@/lib/google-calendar.functions");
  const endISO = new Date(new Date(startISO).getTime() + durationMin * 60_000).toISOString();
  return gcal(`/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      start: { dateTime: startISO, timeZone: "America/Sao_Paulo" },
      end: { dateTime: endISO, timeZone: "America/Sao_Paulo" },
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

  const { data: sessRow } = await db
    .from("wa_ai_sessions")
    .select("*")
    .eq("channel_id", channelId)
    .eq("contact_wa", contactWa)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sessRow) return;
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
