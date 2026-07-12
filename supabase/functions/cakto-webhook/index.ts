// Supabase Edge Function: recebe webhooks da Cakto e grava em public.cakto_events
// URL: https://wvcwrozwnwdlpandwubp.supabase.co/functions/v1/cakto-webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    const parts = k.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null) break;
      cur = cur[p];
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return null;
}
function toNumber(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, hint: "POST payloads from Cakto here" }), { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method not allowed" }), { status: 405, headers: CORS });
  }

  try {
    const rawText = await req.text();
    let payload: any = {};
    try { payload = rawText ? JSON.parse(rawText) : {}; } catch { payload = { raw: rawText }; }

    const data = payload?.data ?? payload?.order ?? payload;
    const utm = data?.utm ?? data?.tracking ?? payload?.utm ?? payload?.tracking ?? {};

    const row = {
      event_type: pick(payload, "event", "type", "event_type") ?? null,
      order_id: pick(data, "id", "order_id", "transaction_id", "code") ?? null,
      customer_email: pick(data, "customer.email", "customer_email", "buyer.email", "email"),
      customer_name: pick(data, "customer.name", "customer_name", "buyer.name", "name"),
      customer_phone: pick(data, "customer.phone", "customer_phone", "buyer.phone", "phone"),
      amount: toNumber(pick(data, "amount", "total", "value", "price")),
      currency: pick(data, "currency") ?? "BRL",
      status: pick(data, "status", "payment_status") ?? null,
      product_name: pick(data, "product.name", "product_name", "offer.name"),
      utm_source: pick(utm, "utm_source", "source"),
      utm_medium: pick(utm, "utm_medium", "medium"),
      utm_campaign: pick(utm, "utm_campaign", "campaign"),
      utm_content: pick(utm, "utm_content", "content"),
      utm_term: pick(utm, "utm_term", "term"),
      payload,
      raw_headers: Object.fromEntries(req.headers.entries()),
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: inserted, error } = await supabase
      .from("cakto_events")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, id: inserted?.id }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: CORS });
  }
});
