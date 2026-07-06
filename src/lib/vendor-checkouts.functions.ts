import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function ensureVendorId(context: any): number {
  const id = Number(context?.vendor?.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Apenas vendedores podem gerenciar checkouts.");
  }
  return id;
}

export const listVendorCheckoutsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const vendedorId = ensureVendorId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("vendor_checkouts" as any)
      .select("id,nome,mensagem,link,ordem,created_at,updated_at")
      .eq("vendedor_id", vendedorId)
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      nome: string;
      mensagem: string;
      link: string;
      ordem: number;
      created_at: string;
      updated_at: string;
    }>;
  });

export const upsertVendorCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; nome: string; mensagem?: string; link: string; ordem?: number }) => input)
  .handler(async ({ data, context }) => {
    const vendedorId = ensureVendorId(context);
    const nome = String(data.nome ?? "").trim();
    const link = String(data.link ?? "").trim();
    const mensagem = String(data.mensagem ?? "");
    if (!nome) throw new Error("Nome é obrigatório.");
    if (!link) throw new Error("Link é obrigatório.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("vendor_checkouts" as any)
        .update({ nome, mensagem, link, ordem: data.ordem ?? 0, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("vendedor_id", vendedorId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Checkout não encontrado.");
      return { id: (row as any).id as string };
    }
    const { data: row, error } = await supabaseAdmin
      .from("vendor_checkouts" as any)
      .insert({ vendedor_id: vendedorId, nome, mensagem, link, ordem: data.ordem ?? 0 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const deleteVendorCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const vendedorId = ensureVendorId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("vendor_checkouts" as any)
      .delete()
      .eq("id", data.id)
      .eq("vendedor_id", vendedorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
