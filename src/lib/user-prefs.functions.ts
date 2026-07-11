import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KEY = z.string().min(1).max(200);

export const getUserPref = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: KEY }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("user_prefs")
      .select("value")
      .eq("owner_key", context.userId)
      .eq("pref_key", data.key)
      .maybeSingle();
    if (error) throw error;
    return { value: (row?.value ?? null) as unknown as null };
  });

export const setUserPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: KEY, value: z.unknown() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_prefs")
      .upsert(
        {
          owner_key: context.userId,
          pref_key: data.key,
          value: (data.value ?? null) as never,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_key,pref_key" },
      );
    if (error) throw error;
    return { ok: true };
  });
