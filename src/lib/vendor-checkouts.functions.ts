import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Checkout = {
  id: string;
  nome: string;
  mensagem: string;
  link: string;
  ordem: number;
  created_at: string;
  updated_at: string;
};

function vendorArgs(context: any): { _vendor_id: number; _codigo: string } {
  const id = Number(context?.vendor?.id);
  const codigo = String(context?.vendor?.codigo ?? "").trim();
  if (!Number.isFinite(id) || id <= 0 || !codigo) {
    throw new Error("Apenas vendedores podem gerenciar checkouts.");
  }
  return { _vendor_id: id, _codigo: codigo };
}

export const listVendorCheckoutsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const args = vendorArgs(context);
    const { data, error } = await (context as any).supabase.rpc("vendor_list_checkouts", args);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      nome: r.nome,
      mensagem: r.mensagem ?? "",
      link: r.link,
      ordem: r.ordem ?? 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })) as Checkout[];
  });

export const upsertVendorCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; nome: string; mensagem?: string; link: string; ordem?: number }) => input)
  .handler(async ({ data, context }) => {
    const args = vendorArgs(context);
    const nome = String(data.nome ?? "").trim();
    const link = String(data.link ?? "").trim();
    if (!nome) throw new Error("Nome é obrigatório.");
    if (!link) throw new Error("Link é obrigatório.");
    const { data: id, error } = await (context as any).supabase.rpc("vendor_upsert_checkout", {
      ...args,
      _id: data.id ?? null,
      _nome: nome,
      _mensagem: String(data.mensagem ?? ""),
      _link: link,
      _ordem: data.ordem ?? 0,
    });
    if (error) throw new Error(error.message);
    return { id: String(id) };
  });

export const deleteVendorCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const args = vendorArgs(context);
    const { error } = await (context as any).supabase.rpc("vendor_delete_checkout", {
      ...args,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
