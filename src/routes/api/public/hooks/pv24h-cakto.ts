import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://wvcwrozwnwdlpandwubp.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3dyb3p3bndkbHBhbmR3dWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0ODksImV4cCI6MjA8NzcyMDQ4OX0.1eHNkL6pfcRpfrWsh_UyYTcnuNIT6LQLCrpmV2EgyFg";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-API-Key",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function pickStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export const Route = createFileRoute("/api/public/hooks/pv24h-cakto")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async () => json(200, { ok: true, message: "Webhook Cakto PV24H ativo!" }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object") {
            return json(400, { ok: false, error: "JSON inválido" });
          }

          const b = body as Record<string, any>;
          // Cakto envia os dados dentro do objeto `data`
          const d = (b.data && typeof b.data === "object" ? b.data : b) as Record<string, any>;

          console.log("[Webhook Cakto PV24H] Evento:", b.event, "| ID:", d.id);

          // 1. Extração do Tipo de Evento
          const rawEvent = pickStr(b.event ?? b.event_type ?? d.event ?? d.event_type ?? d.status) || "purchase_approved";
          const event = rawEvent.toLowerCase();

          // 2. Extração de Identificadores e Cliente
          const transaction_id =
            pickStr(d.id ?? d.transaction_id ?? d.order_id ?? d.code ?? b.transaction_id ?? b.id) ||
            `cakto_${Date.now()}`;

          const customer = (d.customer || b.customer || d.buyer || b.buyer || {}) as Record<string, any>;
          const cliente_nome = pickStr(customer.name ?? customer.full_name ?? d.nome ?? b.nome ?? d.name) || "Cliente Cakto";
          const cliente_email = pickStr(customer.email ?? d.email ?? b.email);
          const cliente_telefone = pickStr(
            customer.phone ?? customer.mobile ?? customer.cellphone ?? customer.telephone ?? d.telefone ?? b.phone
          );

          // 3. Extração de Valor e Status
          const rawValor = d.amount ?? d.baseAmount ?? d.price ?? d.value ?? d.total ?? b.amount ?? b.price ?? 0;
          const valor = Number(rawValor) || 0;

          // Define o status normalizado (approved, refunded, chargeback, pix_generated, cart_abandonment, etc)
          let status = event;
          if (event.includes("refund")) status = "refunded";
          else if (event.includes("chargeback")) status = "chargeback";
          else if (event.includes("approved") || event.includes("paid")) status = "approved";
          else if (event.includes("pix")) status = "pix_generated";
          else if (event.includes("abandon")) status = "cart_abandonment";
          else if (event.includes("renew")) status = "subscription_renewed";
          else if (event.includes("cancel")) status = "subscription_canceled";
          else if (event.includes("refus")) status = "refused";

          // 4. Extração de UTMs e Parâmetros de Rastreio (Cakto)
          const tracking = (d.tracking_parameters || d.tracking_params || d.utm || b.tracking_parameters || b.utm || {}) as Record<string, any>;

          const utm_source = pickStr(d.utm_source ?? tracking.utm_source ?? tracking.source ?? d.src ?? d.sck ?? b.utm_source);
          const utm_medium = pickStr(d.utm_medium ?? tracking.utm_medium ?? tracking.medium ?? b.utm_medium);
          const utm_campaign = pickStr(d.utm_campaign ?? tracking.utm_campaign ?? tracking.campaign ?? b.utm_campaign);
          const utm_content = pickStr(d.utm_content ?? tracking.utm_content ?? tracking.content ?? b.utm_content);
          const utm_term = pickStr(d.utm_term ?? tracking.utm_term ?? tracking.term ?? b.utm_term);

          // 5. Classificação: Tráfego Pago (com UTM válida) vs. Orgânico
          const isValidUtm = (v: string | null) => !!v && v.toLowerCase() !== "null" && v.toLowerCase() !== "undefined" && v.trim().length > 0;
          const hasUtm = isValidUtm(utm_source) || isValidUtm(utm_medium) || isValidUtm(utm_campaign) || isValidUtm(utm_content) || isValidUtm(utm_term);
          const origem: "pago" | "organico" = hasUtm ? "pago" : "organico";

          const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });

          // 6. Registro na tabela `pv24h_vendas`
          const saleRecord = {
            transaction_id,
            cliente_nome,
            cliente_email,
            cliente_telefone,
            valor,
            status,
            origem,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            payload: b,
            created_at: new Date().toISOString(),
          };

          const { data: savedPv, error: errPv } = await supabase
            .from("pv24h_vendas" as any)
            .insert([saleRecord])
            .select()
            .single();

          if (errPv) {
            console.warn("[Webhook Cakto PV24H] Warning pv24h_vendas insert:", errPv.message);
          }

          // 7. Salva no fallback `ht_quiz_submissions` para redundância
          try {
            await supabase.from("ht_quiz_submissions" as any).insert([{
              nome: cliente_nome,
              email: cliente_email,
              whatsapp: cliente_telefone,
              utm_source: utm_source || (origem === "pago" ? "cakto-pago" : "cakto-organico"),
              utm_medium,
              utm_campaign,
              utm_content,
              respostas: {
                tipo: "pv24h_venda",
                evento: event,
                origem,
                valor,
                status,
                transaction_id,
                cakto_payload: b,
              },
              received_at: new Date().toISOString(),
              status: "completed",
            }]);
          } catch (fbErr) {
            console.warn("[Webhook Cakto PV24H] Warning fallback insert:", fbErr);
          }

          return json(200, {
            ok: true,
            origem,
            status,
            event,
            transaction_id,
            saved_id: savedPv?.id || transaction_id,
            message: `Evento '${event}' (${origem}) processado com sucesso!`,
          });
        } catch (e: any) {
          console.error("[Webhook Cakto PV24H] Error:", e);
          return json(500, { ok: false, error: e?.message ?? "Erro interno no webhook" });
        }
      },
    },
  },
});
