import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVOHUB_BASE = "https://api.evohub.ai";

/**
 * Converts our internal placeholders {{nome}} / {{hora}} / {{convidados}} into
 * Meta's positional {{1}}, {{2}}, ... and returns the ordered variable list so
 * we can build the "example" payload required by Cloud API.
 */
function buildBodyAndVars(text: string) {
  const order: string[] = [];
  const body = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name) => {
    let idx = order.indexOf(name);
    if (idx === -1) {
      order.push(name);
      idx = order.length - 1;
    }
    return `{{${idx + 1}}}`;
  });
  return { body, vars: order };
}

const SAMPLE_VALUES: Record<string, string> = {
  nome: "Caio",
  hora: "11:00",
  convidados: "João, Maria",
};

function sampleFor(varName: string) {
  return SAMPLE_VALUES[varName] ?? "exemplo";
}

/**
 * Submits a template for Meta approval via the EvoHub Meta proxy.
 * Always tries category=UTILITY first (higher approval rate, no marketing tone).
 * Falls back to MARKETING if Meta rejects with category mismatch.
 */
export const submitWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      templateId: z.string().uuid(),
      channelId: z.string().min(1),
      language: z.string().default("pt_BR"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // 1. Load template
    const tplRes: any = await (context.supabase as any)
      .from("wa_templates")
      .select("*")
      .eq("id", data.templateId)
      .maybeSingle();
    const tpl = tplRes?.data;
    if (tplRes?.error) throw new Error(tplRes.error.message);
    if (!tpl) throw new Error("Template não encontrado");

    // 2. Load channel + extract WABA id and token
    const key = process.env.EVOHUB_API_KEY;
    if (!key) throw new Error("EVOHUB_API_KEY não configurada");
    const listRes = await fetch(`${EVOHUB_BASE}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });
    const listJson: any = await listRes.json().catch(() => null);
    const list: any[] = Array.isArray(listJson) ? listJson : listJson?.data ?? listJson?.channels ?? [];
    const ch = list.find((c) => String(c.id) === String(data.channelId));
    if (!ch) throw new Error("Número não encontrado no EvoHub");

    const meta = typeof ch.metadata === "string" ? JSON.parse(ch.metadata) : (ch.metadata ?? {});
    const metaConnection = ch.meta_connection ?? meta?.meta_connection ?? null;
    const wabaId: string | undefined =
      metaConnection?.waba_id ??
      metaConnection?.business_account_id ??
      metaConnection?.whatsapp_business_account_id;
    const chToken: string | undefined = ch.token;
    if (!wabaId) throw new Error("Este número não tem WABA conectado — conecte via Meta antes de enviar templates");
    if (!chToken) throw new Error("Token do canal indisponível");

    // 3. Build Meta payload
    const { body, vars } = buildBodyAndVars(String(tpl.conteudo ?? ""));
    const components: any[] = [
      {
        type: "BODY",
        text: body,
        ...(vars.length > 0 ? { example: { body_text: [vars.map(sampleFor)] } } : {}),
      },
    ];

    const buttons = Array.isArray(tpl.buttons) ? tpl.buttons : [];
    if (buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.slice(0, 3).map((b: any) => ({
          type: "QUICK_REPLY",
          text: String(b.label ?? "").slice(0, 20),
        })),
      });
    }

    const name = String(tpl.slug ?? tpl.nome ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 512);

    const payload = {
      name,
      language: data.language,
      category: "UTILITY",
      components,
    };

    // 4. Submit
    async function submit(category: string) {
      const res = await fetch(`${EVOHUB_BASE}/meta/${wabaId}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${chToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, category }),
      });
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      return { ok: res.ok, status: res.status, json };
    }

    let result = await submit("UTILITY");
    let usedCategory = "UTILITY";

    // If Meta complains about category mismatch, retry as MARKETING
    const errMsg = String(result.json?.error?.message ?? result.json?.error ?? "");
    if (!result.ok && /category/i.test(errMsg)) {
      result = await submit("MARKETING");
      usedCategory = "MARKETING";
    }

    if (!result.ok) {
      throw new Error(errMsg || `Falha ao enviar (HTTP ${result.status})`);
    }

    // 5. Persist submission status on the template row
    await context.supabase
      .from("wa_templates" as any)
      .update({
        meta_status: "PENDING",
        meta_category: usedCategory,
        meta_template_id: result.json?.id ?? null,
        meta_submitted_at: new Date().toISOString(),
        meta_channel_id: data.channelId,
      })
      .eq("id", data.templateId);

    return {
      ok: true,
      category: usedCategory,
      templateId: result.json?.id ?? null,
      status: result.json?.status ?? "PENDING",
    };
  });

export type NotificationChannel = { id: string; name: string; displayPhone: string | null; hasWaba: boolean };

export const listNotificationChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationChannel[]> => {
    const { data: rows } = await context.supabase
      .from("wa_channels")
      .select("id, name, kind, metadata")
      .eq("kind", "notification");

    const key = process.env.EVOHUB_API_KEY;
    if (!key) return [];
    const listRes = await fetch(`${EVOHUB_BASE}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });
    const listJson: any = await listRes.json().catch(() => null);
    const list: any[] = Array.isArray(listJson) ? listJson : listJson?.data ?? listJson?.channels ?? [];

    return (rows ?? []).map((r: any) => {
      const remote = list.find((c) => String(c.id) === String(r.id));
      const metaConn = remote?.meta_connection ?? remote?.metadata?.meta_connection ?? null;
      const wabaId = metaConn?.waba_id ?? metaConn?.business_account_id ?? metaConn?.whatsapp_business_account_id;
      const phone = metaConn?.phone_number ?? metaConn?.phone_numbers?.[0]?.display_phone_number ?? null;
      return {
        id: String(r.id),
        name: r.name ?? "Sem nome",
        displayPhone: phone,
        hasWaba: Boolean(wabaId),
      };
    });
  });
