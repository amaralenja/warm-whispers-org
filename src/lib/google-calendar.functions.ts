import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- helpers (server-only, executed inside handlers) ----

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

let cachedToken: { token: string; exp: number } | null = null;

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

function getServiceAccount(): GoogleServiceAccount {
  const raw = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT;
  if (!raw) throw new Error("GOOGLE_CALENDAR_SERVICE_ACCOUNT missing");
  return JSON.parse(raw) as GoogleServiceAccount;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa = getServiceAccount();

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const keyBuf = pemToArrayBuffer(sa.private_key.replace(/\\n/g, "\n"));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(enc));
  const jwt = `${enc}.${base64url(sig)}`;

  const res = await fetch(payload.aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google token error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, exp: now + data.expires_in };
  return data.access_token;
}

async function gcal(path: string, init?: RequestInit) {
  const calId = process.env.GOOGLE_CALENDAR_ID;
  if (!calId) throw new Error("GOOGLE_CALENDAR_ID missing");
  const token = await getAccessToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google Calendar ${res.status}: ${txt}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- server functions ----

export type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string; organizer?: boolean; self?: boolean; resource?: boolean }[];
  htmlLink?: string;
  status?: string;
};

export type CalendarListResult = {
  configuredId: string | null;
  serviceAccountEmail: string | null;
  configuredCalendar: {
    ok: boolean;
    status?: number;
    summary?: string;
    timeZone?: string;
    message?: string;
  };
  items: { id: string; summary?: string; accessRole?: string }[];
};

export const listCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const token = await getAccessToken();
    const configuredId = process.env.GOOGLE_CALENDAR_ID || null;
    const serviceAccountEmail = (() => {
      try {
        return getServiceAccount().client_email;
      } catch {
        return null;
      }
    })();
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`calendarList ${res.status}: ${txt}`);
    const json = JSON.parse(txt) as { items?: { id: string; summary?: string; accessRole?: string }[] };
    const configuredCalendar: CalendarListResult["configuredCalendar"] = { ok: false };

    if (configuredId) {
      const check = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(configuredId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const checkText = await check.text();
      configuredCalendar.ok = check.ok;
      configuredCalendar.status = check.status;
      if (check.ok) {
        const checkJson = JSON.parse(checkText) as { summary?: string; timeZone?: string };
        configuredCalendar.summary = checkJson.summary;
        configuredCalendar.timeZone = checkJson.timeZone;
      } else {
        configuredCalendar.message = checkText;
      }
    } else {
      configuredCalendar.message = "GOOGLE_CALENDAR_ID missing";
    }

    return {
      configuredId,
      serviceAccountEmail,
      configuredCalendar,
      items: (json.items || []).map((c) => ({ id: c.id, summary: c.summary, accessRole: c.accessRole })),
    } satisfies CalendarListResult;
  });



export const listEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { timeMin?: string; timeMax?: string; q?: string }) => d)
  .handler(async ({ data }) => {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeMin: data.timeMin || new Date(Date.now() - 30 * 86400_000).toISOString(),
    });
    if (data.timeMax) params.set("timeMax", data.timeMax);
    if (data.q) params.set("q", data.q);
    const res = await gcal(`/events?${params.toString()}`);
    return { items: (res?.items || []) as CalendarEvent[] };
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      summary: string;
      description?: string;
      location?: string;
      start: string; // ISO
      end: string; // ISO
      attendees?: string[];
    }) => d,
  )
  .handler(async ({ data }) => {
    const emails = (data.attendees || []).map((e) => e.trim()).filter(Boolean);
    const descWithGuests = emails.length
      ? `${data.description ? data.description + "\n\n" : ""}Convidados:\n${emails.map((e) => `• ${e}`).join("\n")}`
      : data.description;
    const buildBody = (withAttendees: boolean) => ({
      summary: data.summary,
      description: withAttendees ? data.description : descWithGuests,
      location: data.location,
      start: { dateTime: data.start, timeZone: "America/Sao_Paulo" },
      end: { dateTime: data.end, timeZone: "America/Sao_Paulo" },
      ...(withAttendees && emails.length ? { attendees: emails.map((email) => ({ email })) } : {}),
    });
    try {
      return (await gcal(`/events?sendUpdates=none`, {
        method: "POST",
        body: JSON.stringify(buildBody(true)),
      })) as CalendarEvent;
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (emails.length && /forbiddenForServiceAccounts|Domain-Wide Delegation|without Domain/i.test(msg)) {
        return (await gcal(`/events?sendUpdates=none`, {
          method: "POST",
          body: JSON.stringify(buildBody(false)),
        })) as CalendarEvent;
      }
      throw e;
    }
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      summary: string;
      description?: string;
      location?: string;
      start: string;
      end: string;
      attendees?: string[];
    }) => d,
  )
  .handler(async ({ data }) => {
    const emails = (data.attendees || []).map((e) => e.trim()).filter(Boolean);
    const descWithGuests = emails.length
      ? `${data.description ? data.description + "\n\n" : ""}Convidados:\n${emails.map((e) => `• ${e}`).join("\n")}`
      : data.description;
    const buildBody = (withAttendees: boolean) => ({
      summary: data.summary,
      description: withAttendees ? data.description : descWithGuests,
      location: data.location,
      start: { dateTime: data.start, timeZone: "America/Sao_Paulo" },
      end: { dateTime: data.end, timeZone: "America/Sao_Paulo" },
      ...(withAttendees && emails.length ? { attendees: emails.map((email) => ({ email })) } : {}),
    });
    try {
      return (await gcal(`/events/${encodeURIComponent(data.id)}?sendUpdates=none`, {
        method: "PATCH",
        body: JSON.stringify(buildBody(true)),
      })) as CalendarEvent;
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (emails.length && /forbiddenForServiceAccounts|Domain-Wide Delegation|without Domain/i.test(msg)) {
        return (await gcal(`/events/${encodeURIComponent(data.id)}?sendUpdates=none`, {
          method: "PATCH",
          body: JSON.stringify(buildBody(false)),
        })) as CalendarEvent;
      }
      throw e;
    }
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await gcal(`/events/${encodeURIComponent(data.id)}`, { method: "DELETE" });
    return { ok: true };
  });
