import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KEY = z.string().min(1).max(200);

export const getUserPref = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: KEY }).parse(d))
  .handler(async ({ data, context }): Promise<{ value: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("user_prefs")
      .select("value")
      .eq("owner_key", context.userId)
      .eq("pref_key", data.key)
      .maybeSingle();
    if (error) throw error;
    if (!row?.value) return { value: null };
    return { value: JSON.stringify(row.value) };
  });

export const setUserPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: KEY, valueJson: z.string() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.valueJson);
    } catch {
      parsed = null;
    }
    const { error } = await supabaseAdmin
      .from("user_prefs")
      .upsert(
        {
          owner_key: context.userId,
          pref_key: data.key,
          value: parsed as never,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_key,pref_key" },
      );
    if (error) throw error;
    return { ok: true };
  });

