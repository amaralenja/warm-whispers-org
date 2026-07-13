import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VendorPaymentLink = {
  id: string;
  vendor_id: number;
  title: string;
  url: string;
  sort_order: number;
  created_at: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

// Admin: lista links de um vendedor (usa admin pra bypass de RLS, autenticado via middleware).
export const listVendorLinksAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { vendorId: number }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await sb
      .from("vendor_payment_links")
      .select("*")
      .eq("vendor_id", data.vendorId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as VendorPaymentLink[];
  });

export const upsertVendorLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string | null; vendorId: number; title: string; url: string; sortOrder?: number }) => d)
  .handler(async ({ data }) => {
    const title = String(data.title || "").trim();
    const url = String(data.url || "").trim();
    if (!title) throw new Error("Título é obrigatório");
    if (!url) throw new Error("Link é obrigatório");
    const sb = await admin();
    if (data.id) {
      const { error } = await sb
        .from("vendor_payment_links")
        .update({ title, url, sort_order: data.sortOrder ?? 0 })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await sb
      .from("vendor_payment_links")
      .insert({ vendor_id: data.vendorId, title, url, sort_order: data.sortOrder ?? 0 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row!.id as string };
  });

export const deleteVendorLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb.from("vendor_payment_links").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Portal do vendedor: sessão via localStorage (não é auth Supabase). Passa o vendorId; sem middleware.
export const listVendorLinksPublic = createServerFn({ method: "POST" })
  .inputValidator((d: { vendorId: number }) => d)
  .handler(async ({ data }) => {
    if (!Number.isFinite(data.vendorId) || data.vendorId <= 0) return [] as VendorPaymentLink[];
    const sb = await admin();
    const { data: rows, error } = await sb
      .from("vendor_payment_links")
      .select("*")
      .eq("vendor_id", data.vendorId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as VendorPaymentLink[];
  });
