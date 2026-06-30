import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron tick (a cada minuto). Varre eventos do Google Calendar entre agora-2min e agora+35min:
 *   - 25..35 min antes do início -> sendCallReminderInternal
 *   - -2..+2 min do início       -> sendCallAttendanceInternal
 * Dedupe é feito no insert (kind + event_id + contact_wa nas últimas 6h).
 */
export const Route = createFileRoute("/api/public/hooks/calls-tick")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { gcal } = await import("@/lib/google-calendar.functions");
          const { sendCallReminderInternal, sendCallAttendanceInternal } = await import(
            "@/lib/call-reminders.functions"
          );

          const now = Date.now();
          const timeMin = new Date(now - 5 * 60_000).toISOString();
          const timeMax = new Date(now + 40 * 60_000).toISOString();

          const params = new URLSearchParams({
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "100",
            timeMin,
            timeMax,
          });
          const res = await gcal(`/events?${params.toString()}`);
          const items = (res?.items ?? []) as any[];

          const results: any[] = [];
          for (const ev of items) {
            const startIso = ev?.start?.dateTime;
            if (!startIso) continue;
            const startMs = Date.parse(startIso);
            if (!Number.isFinite(startMs)) continue;
            const diffMin = (startMs - now) / 60_000;

            // Recupera telefones dos convidados a partir do nosso banco
            const attendees = (ev.attendees ?? [])
              .map((a: any) => String(a?.email ?? "").trim())
              .filter(Boolean);

            // Procura leads conhecidos com esses emails
            let phones: Array<{ nome?: string; phone: string; email?: string }> = [];
            if (attendees.length) {
              const { data: leads } = await supabaseAdmin
                .from("crm_leads" as any)
                .select("nome,telefone,email")
                .in("email", attendees);
              phones = ((leads ?? []) as any[])
                .filter((l) => l?.telefone)
                .map((l) => ({ nome: l.nome, phone: l.telefone, email: l.email }));
            }

            // Fallback: extrair telefone do description (linhas tipo "+55 ...")
            if (!phones.length && ev.description) {
              const m = String(ev.description).match(/(\+?\d[\d\s().-]{8,})/g);
              if (m) {
                phones = m.slice(0, 5).map((p) => ({ phone: p.replace(/\D/g, "") }));
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
              const shared = {
                eventId: ev.id as string,
                to: p.phone,
                nome: p.nome ?? "",
                hora,
                convidados,
                leadEmail: p.email,
              };
              try {
                if (diffMin >= 25 && diffMin <= 35) {
                  const r = await sendCallReminderInternal(supabaseAdmin, shared);
                  results.push({ kind: "reminder", eventId: ev.id, ...r });
                }
                if (diffMin >= -2 && diffMin <= 2) {
                  const r = await sendCallAttendanceInternal(supabaseAdmin, shared);
                  results.push({ kind: "attendance", eventId: ev.id, ...r });
                }
              } catch (e: any) {
                results.push({ eventId: ev.id, error: e?.message ?? "erro" });
              }
            }
          }

          return new Response(
            JSON.stringify({ ok: true, scanned: items.length, fired: results.length, results }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "erro" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
