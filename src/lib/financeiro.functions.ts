import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Lancamento = {
  id: number;
  tipo: "gasto" | "receita";
  categoria: string;
  descricao: string;
  valor: number;
  data_ref: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  recorrente: boolean;
  status: "pendente" | "pago" | "atrasado";
  responsavel: string | null;
  obs: string | null;
};

export const listLancamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Lancamento[]> => {
    const { data, error } = await context.supabase
      .from("financeiro")
      .select("*")
      .order("data_ref", { ascending: false })
      .limit(2000);
    if (error) throw error;
    return (data ?? []) as Lancamento[];
  });

const lancamentoInput = z.object({
  tipo: z.enum(["gasto", "receita"]),
  categoria: z.string().min(1).max(50),
  descricao: z.string().trim().min(1).max(200),
  valor: z.number().nonnegative(),
  data_ref: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  data_pagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  recorrente: z.boolean().default(false),
  status: z.enum(["pendente", "pago", "atrasado"]).default("pendente"),
  responsavel: z.string().max(100).nullable().optional(),
  obs: z.string().max(500).nullable().optional(),
});

export const upsertLancamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.number().int().positive().optional(), data: lancamentoInput }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("financeiro")
        .update(data.data)
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("financeiro")
      .insert(data.data)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as number };
  });

export const deleteLancamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("financeiro").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
