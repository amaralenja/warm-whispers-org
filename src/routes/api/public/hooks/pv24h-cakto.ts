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
          console.log("[Webhook Cakto PV24H] Payload recebido:", JSON.stringify(b));

          // 1. Extração de Identificadores e Cliente
          const transaction_id =
            pickStr(b.transaction_id ?? b.transaction ?? b.order_id ?? b.code ?? b.id ?? b.order?.id) ||
            `cakto_${Date.now()}`;

          const customer = (b.customer || b.buyer || b.client || {}) as Record<string, any>;
          const cliente_nome =
            pickStr(customer.name ?? customer.full_name ?? b.nome ?? b.name) || "Cliente Cakto";
          const cliente_email = pickStr(customer.email ?? b.email);
          const cliente_telefone = pickStr(
            customer.phone ?? customer.mobile ?? customer.cellphone ?? customer.telephone ?? b.telefone ?? b.phone ?? b.whatsapp
          );

          // 2. Extração de Valor e Status
          const rawValor = b.paid_amount ?? b.amount ?? b.price ?? b.value ?? b.total ?? b.order?.total ?? 0;
          const valor = Number(rawValor) || 0;

          const rawStatus = pickStr(b.event ?? b.event_type ?? b.status ?? b.current_status) || "approved";
          const status = rawStatus.toLowerCase();

          // 3. Extração de UTMs e Parâmetros de Rastreio (Cakto)
          const tracking = (b.tracking_parameters || b.tracking_params || b.utm || b.params || b.metadata || {}) as Record<string, any>;

          const utm_source = pickStr(b.utm_source ?? tracking.utm_source ?? tracking.source ?? b.src);
          const utm_medium = pickStr(b.utm_medium ?? tracking.utm_medium ?? tracking.medium);
          const utm_campaign = pickStr(b.utm_campaign ?? tracking.utm_campaign ?? tracking.campaign);
          const utm_content = pickStr(b.utm_content ?? tracking.utm_content ?? tracking.content);
          const utm_term = pickStr(b.utm_term ?? tracking.utm_term ?? tracking.term ?? b.sck);

          // 4. Classificação: Tráfego Pago (com UTM) vs. Orgânico (sem UTM)
          const hasUtm = !!(utm_source || utm_medium || utm_campaign || utm_content || utm_term);
          const origem: "pago" | "organico" = hasUtm ? "pago" : "organico";

          const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });

          // 5. Salvar na tabela `pv24h_vendas`
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

          // 6. Também salva como fallback em `ht_quiz_submissions` para garantir redundância total
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
            transaction_id,
            saved_id: savedPv?.id || transaction_id,
            message: `Venda ${origem === "pago" ? "Tráfego Pago" : "Orgânica"} registrada com sucesso!`,
          });
        } catch (e: any) {
          console.error("[Webhook Cakto PV24H] Error:", e);
          return json(500, { ok: false, error: e?.message ?? "Erro interno no webhook" });
        }
      },
    },
  },
});
