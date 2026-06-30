import crypto from "crypto";

function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function normEmail(s?: string | null) {
  return s ? s.trim().toLowerCase() : null;
}
function normPhone(s?: string | null) {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d || null;
}
function hashOrNull(s?: string | null) {
  return s ? sha256Hex(s) : null;
}

/**
 * Server-only: dispara ShowUp pro Facebook usando a primeira config disponível.
 * Usado por automações que não têm contexto de usuário autenticado (ex.: webhook).
 */
export async function fireShowUpFromSnapshot(snapshot: {
  email?: string | null;
  phone?: string | null;
  nome?: string | null;
  externalId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cfg } = await supabaseAdmin
    .from("meta_ads_config" as any)
    .select("pixel_id, access_token, test_event_code, user_id")
    .not("pixel_id", "is", null)
    .not("access_token", "is", null)
    .limit(1)
    .maybeSingle();
  if (!cfg) return { ok: false, reason: "no_meta_config" };

  const email = normEmail(snapshot.email);
  const phone = normPhone(snapshot.phone);
  const [first, ...rest] = (snapshot.nome ?? "").trim().split(/\s+/);
  const last = rest.join(" ");
  const externalId = snapshot.externalId || email || phone || null;

  const userData: Record<string, unknown> = {
    ...(email ? { em: [sha256Hex(email)] } : {}),
    ...(phone ? { ph: [sha256Hex(phone)] } : {}),
    ...(first ? { fn: [sha256Hex(first.toLowerCase())] } : {}),
    ...(last ? { ln: [sha256Hex(last.toLowerCase())] } : {}),
    ...(externalId ? { external_id: [sha256Hex(externalId)] } : {}),
    ...(snapshot.fbp ? { fbp: snapshot.fbp } : {}),
    ...(snapshot.fbc ? { fbc: snapshot.fbc } : {}),
  };

  const eventId = globalThis.crypto.randomUUID();
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: "ShowUp",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "phone_call",
        user_data: userData,
        custom_data: { content_name: "ShowUp - call confirmed via WhatsApp button", status: "showed_up" },
      },
    ],
  };
  if ((cfg as any).test_event_code) payload.test_event_code = (cfg as any).test_event_code;

  const url = `https://graph.facebook.com/v19.0/${(cfg as any).pixel_id}/events?access_token=${encodeURIComponent((cfg as any).access_token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json: any = await res.json().catch(() => ({}));
  const ok = res.ok && !json?.error;

  await supabaseAdmin.from("meta_ads_event_logs" as any).insert({
    user_id: (cfg as any).user_id,
    event_name: "ShowUp",
    event_id: eventId,
    status: ok ? "success" : "error",
    events_received: json?.events_received ?? null,
    fbtrace_id: json?.fbtrace_id ?? null,
    error_message: ok ? null : (json?.error?.message ?? `HTTP ${res.status}`),
    email_hash: hashOrNull(email),
    phone_hash: hashOrNull(phone),
    external_id_hash: hashOrNull(externalId),
  });

  return { ok, eventId };
}
