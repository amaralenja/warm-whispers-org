import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = (createFileRoute as any)("/api/public/debug-sync")({
  server: {
    handlers: {
      GET: async () => {
        const extUrl = process.env.EXT_QUIZ_SUPABASE_URL;
        const extKey = process.env.EXT_QUIZ_SUPABASE_ANON_KEY;

        const info: any = {
          hasUrl: !!extUrl,
          hasKey: !!extKey,
          urlStart: extUrl ? extUrl.slice(0, 15) : null,
          keyStart: extKey ? extKey.slice(0, 15) : null,
        };

        if (extUrl && extKey) {
          try {
            const extClient = createClient(extUrl, extKey, {
              auth: { persistSession: false, autoRefreshToken: false }
            });

            // 1. Tenta listar tabelas ou fazer query na tabela 'leads'
            const { data: leads, error: leadsErr } = await extClient
              .from("leads")
              .select("count", { count: "exact" })
              .limit(1);

            info.leadsTable = {
              success: !leadsErr,
              error: leadsErr ? leadsErr.message : null,
              count: leads ? leads.length : null,
            };

            // 2. Tenta fazer query em outra tabela de submissões se houver
            const { data: subs, error: subsErr } = await extClient
              .from("ht_quiz_submissions")
              .select("count", { count: "exact" })
              .limit(1);

            info.submissionsTable = {
              success: !subsErr,
              error: subsErr ? subsErr.message : null,
              count: subs ? subs.length : null,
            };

          } catch (e: any) {
            info.connectionError = e.message;
          }
        }

        return new Response(JSON.stringify(info), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  }
});
