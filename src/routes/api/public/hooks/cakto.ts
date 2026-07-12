import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cakto-Signature",
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

export const Route = createFileRoute("/api/public/hooks/cakto")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        new Response(JSON.stringify({ ok: true, hint: "POST payloads from Cakto here" }), { headers: CORS }),
      POST: async ({ request }) => {
        try {
          const rawText = await request.text();
          let payload: any = {};
          try { payload = rawText ? JSON.parse(rawText) : {}; } catch { payload = { raw: rawText }; }

          const data = payload?.data ?? payload?.order ?? payload;

          const utm =
            data?.utm ?? data?.tracking ?? payload?.utm ?? payload?.tracking ?? {};

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
            raw_headers: Object.fromEntries(request.headers.entries()),
          };

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: inserted, error } = await supabaseAdmin
            .from("cakto_events" as any)
            .insert(row as any)
            .select("id")
            .single();
          if (error) throw error;

          return new Response(JSON.stringify({ ok: true, id: (inserted as any)?.id }), { headers: CORS });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "erro" }), {
            status: 500,
            headers: CORS,
          });
        }
      },
    },
  },
});
