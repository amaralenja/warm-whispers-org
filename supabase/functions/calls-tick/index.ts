import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const EVOHUB_BASE = "https://api.evohub.ai";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function base64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else bytes = input;

  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(clean);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedGoogleToken: { token: string; exp: number } | null = null;

async function getGoogleToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && cachedGoogleToken.exp - 60 > now) return cachedGoogleToken.token;

  const raw = Deno.env.get("GOOGLE_CALENDAR_SERVICE_ACCOUNT");
  if (!raw) throw new Error("GOOGLE_CALENDAR_SERVICE_ACCOUNT missing");
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; token_uri?: string };

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(enc));
  const jwt = `${enc}.${base64url(sig)}`;

  const res = await fetch(payload.aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedGoogleToken = { token: data.access_token, exp: now + Number(data.expires_in ?? 3600) };
  return cachedGoogleToken.token;
}

async function gcal(path: string) {
  const calId = Deno.env.get("GOOGLE_CALENDAR_ID");
  if (!calId) throw new Error("GOOGLE_CALENDAR_ID missing");
  const token = await getGoogleToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function normalizeBrPhone(raw: string): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (digits.startsWith("55") && digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8) digits = `55${ddd}9${rest}`;
  }
  return digits;
}

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return String(tpl || "").replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function findNotificationChannel(db: any): Promise<string | null> {
  const { data } = await db
    .from("wa_channels")
    .select("id,kind,status,metadata")
    .eq("kind", "notification")
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const active = rows.find(
    (r: any) => String(r.status ?? "").toLowerCase() === "connected" || r.metadata?.meta_connection,
  );
  return (active ?? rows[0])?.id ?? null;
}

async function loadTemplate(db: any, slug: string) {
  const { data, error } = await db.from("wa_templates").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) throw new Error(`Template ${slug} não encontrado`);
  return data;
}

async function fetchChannelToken(channelId: string, db: any): Promise<{ token: string; phoneNumberId: string }> {
  const { data: row } = await db.from("wa_channels").select("id,token,phone_number_id,metadata").eq("id", channelId).maybeSingle();
  const token = row?.token ? String(row.token) : "";
  const phoneNumberId = row?.phone_number_id
    ? String(row.phone_number_id)
    : row?.metadata?.meta_connection?.phone_number_id
      ? String(row.metadata.meta_connection.phone_number_id)
      : "";
  if (token && phoneNumberId) return { token, phoneNumberId };

  const evoKey = Deno.env.get("EVOHUB_API_KEY") ?? "";
  if (!evoKey) throw new Error("EVOHUB_API_KEY missing");
  const res = await fetchWithTimeout(`${EVOHUB_BASE}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${evoKey}` },
  });
  if (!res.ok) throw new Error(`EvoHub HTTP ${res.status}`);
  const body = await res.json();
  const list = Array.isArray(body) ? body : body?.data ?? body?.channels ?? [];
  const ch = list.find((c: any) => c.id === channelId);
  if (!ch) throw new Error(`Canal ${channelId} não encontrado no EvoHub`);
  const pnid = ch?.metadata?.meta_connection?.phone_number_id ?? ch?.meta_connection?.phone_number_id ?? ch?.phone_number_id;
  if (!pnid || !ch.token) throw new Error("Canal sem token/phone_number_id");
  return { token: String(ch.token), phoneNumberId: String(pnid) };
}

async function sendWA(channelId: string, to: string, body: any, db: any) {
  const { token, phoneNumberId } = await fetchChannelToken(channelId, db);
  const payload = { messaging_product: "whatsapp", to: normalizeBrPhone(to), ...body };
  const res = await fetchWithTimeout(`${EVOHUB_BASE}/meta/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) throw new Error(parsed?.error?.message ?? parsed?.message ?? `WhatsApp HTTP ${res.status}`);
  return { waMsgId: parsed?.messages?.[0]?.id ?? null };
}

type Shared = {
  eventId: string;
  to: string;
  nome?: string;
  hora?: string;
  convidados?: string;
  leadEmail?: string;
  channelId?: string;
};

async function sendCallReminder(db: any, input: Shared) {
  const eventId = String(input.eventId || "").trim();
  const contactWa = normalizeBrPhone(input.to);
  if (!eventId || !contactWa) throw new Error("eventId/telefone obrigatório");
  const tpl = await loadTemplate(db, "lembrete_call_v2").catch(() => loadTemplate(db, "lembrete_call"));
  const channelId = input.channelId || (await findNotificationChannel(db));
  if (!channelId) throw new Error("Nenhum canal de notificações conectado");

  const { data: existing } = await db
    .from("wa_call_reminders")
    .select("id")
    .eq("event_id", eventId)
    .eq("contact_wa", contactWa)
    .eq("kind", "reminder")
    .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
    .limit(1);
  if ((existing ?? []).length) return { skipped: true, reason: "already_sent_recent" };

  const { data: ins, error } = await db
    .from("wa_call_reminders")
    .insert({
      event_id: eventId,
      channel_id: channelId,
      contact_wa: contactWa,
      lead_email: input.leadEmail ?? null,
      lead_nome: input.nome || null,
      hora: input.hora || null,
      convidados: input.convidados || null,
      status: "pending",
      kind: "reminder",
    })
    .select("id")
    .single();
  if (error || !ins) throw new Error(error?.message || "Falha ao criar lembrete");

  try {
    const text = renderTemplate(String(tpl.conteudo ?? ""), {
      nome: input.nome || "",
      hora: input.hora || "",
      convidados: input.convidados || "",
    });
    const { waMsgId } = await sendWA(channelId, contactWa, { type: "text", text: { body: text } }, db);
    await db.from("wa_call_reminders").update({ sent_at: new Date().toISOString(), wa_message_id: waMsgId, status: "sent" }).eq("id", ins.id);
    return { reminderId: ins.id, waMsgId, channelId };
  } catch (e) {
    await db.from("wa_call_reminders").update({ status: "failed" }).eq("id", ins.id);
    throw e;
  }
}

async function sendCallAttendance(db: any, input: Shared) {
  const eventId = String(input.eventId || "").trim();
  const contactWa = normalizeBrPhone(input.to);
  if (!eventId || !contactWa) throw new Error("eventId/telefone obrigatório");
  const tpl = await loadTemplate(db, "comparecimento_call");
  const channelId = input.channelId || (await findNotificationChannel(db));
  if (!channelId) throw new Error("Nenhum canal de notificações conectado");

  const { data: existing } = await db
    .from("wa_call_reminders")
    .select("id")
    .eq("event_id", eventId)
    .eq("contact_wa", contactWa)
    .eq("kind", "attendance")
    .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
    .limit(1);
  if ((existing ?? []).length) return { skipped: true, reason: "already_sent_recent" };

  const { data: ins, error } = await db
    .from("wa_call_reminders")
    .insert({
      event_id: eventId,
      channel_id: channelId,
      contact_wa: contactWa,
      lead_email: input.leadEmail ?? null,
      lead_nome: input.nome || null,
      hora: input.hora || null,
      convidados: input.convidados || null,
      status: "pending",
      kind: "attendance",
    })
    .select("id")
    .single();
  if (error || !ins) throw new Error(error?.message || "Falha ao criar comparecimento");

  try {
    const text = renderTemplate(String(tpl.conteudo ?? ""), {
      nome: input.nome || "",
      hora: input.hora || "",
      convidados: input.convidados || "",
    });
    const tplButtons = Array.isArray(tpl.buttons) && tpl.buttons.length
      ? tpl.buttons
      : [
          { id: "showup", label: "✅ Show up" },
          { id: "noshow", label: "❌ No show" },
          { id: "remarcada", label: "🔄 Call remarcada" },
        ];
    const buttons = tplButtons.slice(0, 3).map((b: any) => ({
      type: "reply",
      reply: { id: `callack:${ins.id}:${b.id}`, title: String(b.label).slice(0, 20) },
    }));
    const { waMsgId } = await sendWA(
      channelId,
      contactWa,
      { type: "interactive", interactive: { type: "button", body: { text }, action: { buttons } } },
      db,
    );
    await db.from("wa_call_reminders").update({ sent_at: new Date().toISOString(), wa_message_id: waMsgId, status: "sent" }).eq("id", ins.id);
    return { reminderId: ins.id, waMsgId, channelId };
  } catch (e) {
    await db.from("wa_call_reminders").update({ status: "failed" }).eq("id", ins.id);
    throw e;
  }
}

async function fixedRecipients(db: any) {
  const { data: templates } = await db
    .from("wa_templates")
    .select("id")
    .in("slug", ["lembrete_call_v2", "lembrete_call", "comparecimento_call"]);
  const ids = (templates ?? []).map((t: any) => t.id).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await db
    .from("wa_template_recipients")
    .select("telefone,nome,ativo")
    .in("template_id", ids)
    .eq("ativo", true);
  return (data ?? [])
    .filter((r: any) => r?.telefone)
    .map((r: any) => ({ nome: r.nome ?? "", phone: String(r.telefone) }));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase service role indisponível na Edge Function");
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const now = Date.now();
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
      timeMin: new Date(now - 5 * 60_000).toISOString(),
      timeMax: new Date(now + 40 * 60_000).toISOString(),
    });
    const res = await gcal(`/events?${params.toString()}`);
    const items = res?.items ?? [];
    const extras = await fixedRecipients(db);
    const results: any[] = [];

    for (const ev of items) {
      const startIso = ev?.start?.dateTime;
      if (!startIso) continue;
      const startMs = Date.parse(startIso);
      if (!Number.isFinite(startMs)) continue;
      const diffMin = (startMs - now) / 60_000;
      const attendees = (ev.attendees ?? [])
        .map((a: any) => String(a?.email ?? "").trim())
        .filter(Boolean);

      let phones: Array<{ nome?: string; phone: string; email?: string }> = [];
      if (attendees.length) {
        const { data: leads } = await db.from("crm_leads").select("nome,telefone,email").in("email", attendees);
        phones = (leads ?? [])
          .filter((l: any) => l?.telefone)
          .map((l: any) => ({ nome: l.nome, phone: l.telefone, email: l.email }));
      }

      if (!phones.length && ev.description) {
        const m = String(ev.description).match(/(\+?\d[\d\s().-]{8,})/g);
        if (m) phones = m.slice(0, 5).map((p) => ({ phone: p.replace(/\D/g, "") }));
      }

      const seen = new Set(phones.map((p) => normalizeBrPhone(p.phone)));
      for (const e of extras) {
        const k = normalizeBrPhone(e.phone);
        if (k && !seen.has(k)) {
          phones.push(e);
          seen.add(k);
        }
      }
      if (!phones.length) continue;

      const hora = new Date(startMs).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      });
      const convidados = attendees.join(", ");

      for (const p of phones) {
        const shared = { eventId: String(ev.id), to: p.phone, nome: p.nome ?? "", hora, convidados, leadEmail: p.email };
        try {
          if (diffMin >= 25 && diffMin <= 35) {
            results.push({ kind: "reminder", eventId: ev.id, to: normalizeBrPhone(p.phone), ...(await sendCallReminder(db, shared)) });
          }
          if (diffMin >= -2 && diffMin <= 2) {
            results.push({ kind: "attendance", eventId: ev.id, to: normalizeBrPhone(p.phone), ...(await sendCallAttendance(db, shared)) });
          }
        } catch (e) {
          results.push({ eventId: ev.id, to: normalizeBrPhone(p.phone), error: (e as Error)?.message ?? "erro" });
        }
      }
    }

    return json({ ok: true, scanned: items.length, fired: results.length, results });
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? "erro" }, 500);
  }
});