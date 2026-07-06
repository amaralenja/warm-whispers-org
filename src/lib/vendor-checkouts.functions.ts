import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "vendor-assets";

type Checkout = {
  id: string;
  nome: string;
  mensagem: string;
  link: string;
  image_path: string | null;
  image_url: string | null;
  ordem: number;
  created_at: string;
  updated_at: string;
};

function vendorArgs(context: any): { _vendor_id: number; _codigo: string } {
  const id = Number(context?.vendor?.id);
  const codigo = String(context?.vendor?.codigo ?? "").trim();
  if (!Number.isFinite(id) || id <= 0 || !codigo) {
    throw new Error("Apenas vendedores podem gerenciar mensagens rápidas.");
  }
  return { _vendor_id: id, _codigo: codigo };
}

async function signPath(path: string | null | undefined, ttlSeconds = 60 * 60 * 24 * 7): Promise<string | null> {
  if (!path) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export const listVendorCheckoutsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const args = vendorArgs(context);
    const { data, error } = await (context as any).supabase.rpc("vendor_list_checkouts", args);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const withUrls = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        nome: r.nome,
        mensagem: r.mensagem ?? "",
        link: r.link ?? "",
        image_path: r.image_path ?? null,
        image_url: await signPath(r.image_path),
        ordem: r.ordem ?? 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    );
    return withUrls as Checkout[];
  });

export const upsertVendorCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    nome: string;
    mensagem?: string;
    link?: string;
    ordem?: number;
    imagePath?: string | null;
    clearImage?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    const args = vendorArgs(context);
    const nome = String(data.nome ?? "").trim();
    const mensagem = String(data.mensagem ?? "").trim();
    const link = String(data.link ?? "").trim();
    const imagePath = data.clearImage ? null : (data.imagePath ?? undefined);
    if (!nome) throw new Error("Nome é obrigatório.");
    if (!mensagem && !imagePath && !link) throw new Error("Coloque uma mensagem, imagem ou link.");
    const { data: id, error } = await (context as any).supabase.rpc("vendor_upsert_checkout", {
      ...args,
      _id: data.id ?? null,
      _nome: nome,
      _mensagem: mensagem,
      _link: link,
      _ordem: data.ordem ?? 0,
      _image_path: imagePath ?? null,
    });
    if (error) throw new Error(error.message);
    return { id: String(id) };
  });

export const deleteVendorCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const args = vendorArgs(context);
    // Best-effort remove image from storage
    try {
      const { data: rows } = await (context as any).supabase.rpc("vendor_list_checkouts", args);
      const row = (rows ?? []).find((r: any) => String(r.id) === String(data.id));
      if (row?.image_path) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from(BUCKET).remove([row.image_path]);
      }
    } catch {}
    const { error } = await (context as any).supabase.rpc("vendor_delete_checkout", {
      ...args,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uploadVendorCheckoutImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { filename: string; contentType?: string; base64: string }) => ({
    filename: String(input?.filename ?? "image.jpg"),
    contentType: String(input?.contentType ?? "image/jpeg"),
    base64: String(input?.base64 ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const args = vendorArgs(context);
    if (!data.base64) throw new Error("Arquivo vazio");
    if (!/^image\//.test(data.contentType)) throw new Error("Apenas imagens são permitidas");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "image.jpg";
    const ext = safe.split(".").pop() || "jpg";
    const path = `${args._vendor_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(data.base64, "base64");
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
      contentType: data.contentType,
      upsert: false,
    });
    if (error) throw new Error("Upload falhou: " + error.message);
    const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
    return { path, signedUrl: signed.data?.signedUrl ?? null };
  });

export const getVendorCheckoutSendUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string }) => input)
  .handler(async ({ data, context }) => {
    vendorArgs(context);
    const url = await signPath(data.path, 60 * 60);
    if (!url) throw new Error("Não foi possível gerar URL da imagem");
    return { signedUrl: url };
  });
