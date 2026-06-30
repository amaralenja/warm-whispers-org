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
  let body = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name) => {
    let idx = order.indexOf(name);
    if (idx === -1) {
      order.push(name);
      idx = order.length - 1;
    }
    return `{{${idx + 1}}}`;
  });
  // Meta rule (subcode 2388299): variables cannot be at the very start or end.
  // Pad with a zero-width-ish marker (a dot) if needed.
  const trimmed = body.trim();
  if (/^\{\{\d+\}\}/.test(trimmed)) body = `. ${body}`;
  if (/\{\{\d+\}\}$/.test(trimmed)) body = `${body} .`;
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
    const metaConnection = ch.meta_connection ?? meta?.meta_connection ?? ch.meta ?? meta?.meta ?? null;
    const wabaId: string | undefined =
      metaConnection?.waba_id ??
      metaConnection?.wabaId ??
      metaConnection?.business_account_id ??
      metaConnection?.whatsapp_business_account_id ??
      ch?.waba_id ?? ch?.wabaId ?? meta?.waba_id ?? meta?.wabaId;
    const chToken: string | undefined = ch.token ?? ch.api_token ?? meta?.token;

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
      const sanitizeBtn = (s: string) =>
        String(s ?? "")
          .replace(/\{\{[^}]*\}\}/g, "")           // sem variáveis
          .replace(/[\r\n\t]+/g, " ")               // sem quebras
          .replace(/[*_~`]/g, "")                   // sem markdown
          .replace(/\p{Extended_Pictographic}/gu, "") // sem emojis
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 25);
      const quickReplies = buttons
        .slice(0, 3)
        .map((b: any) => ({ type: "QUICK_REPLY", text: sanitizeBtn(b.label ?? b.text ?? "") }))
        .filter((b: any) => b.text.length > 0);
      if (quickReplies.length > 0) {
        components.push({ type: "BUTTONS", buttons: quickReplies });
      }
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

    // 4. Submit — prefer Meta WABA endpoint; fallback to EvoHub channel-scoped endpoint.
    async function submit(category: string) {
      const body = JSON.stringify({ ...payload, category });
      if (wabaId && chToken) {
        const res = await fetch(`${EVOHUB_BASE}/meta/${wabaId}/message_templates`, {
          method: "POST",
          headers: { Authorization: `Bearer ${chToken}`, "Content-Type": "application/json" },
          body,
        });
        const text = await res.text();
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = text; }
        return { ok: res.ok, status: res.status, json };
      }
      // Fallback: EvoHub channel-scoped template submission
      const res = await fetch(`${EVOHUB_BASE}/api/v1/channels/${data.channelId}/templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
      });
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      return { ok: res.ok, status: res.status, json };
    }

    function extractMetaMsg(r: any): string {
      const v = r?.json?.error?.variables?.message;
      const direct = r?.json?.error?.error_user_msg ?? r?.json?.error?.message ?? r?.json?.message;
      return String(v ?? direct ?? r?.json?.error ?? "");
    }
    function detectExistingCategory(msg: string): string | null {
      // Meta msg: "A categoria X não corresponde à categoria já associada a este modelo, Y."
      // EN: "Template category Y does not match ..."
      if (/2388026/.test(msg) || /categoria j[áa] associada|already.*categor/i.test(msg)) {
        const m = msg.match(/\b(UTILITY|MARKETING|AUTHENTICATION)\b[^A-Z]*$/);
        if (m) return m[1];
      }
      return null;
    }

    let result = await submit("UTILITY");
    let usedCategory = "UTILITY";

    let errMsg = extractMetaMsg(result);
    const existingCat = detectExistingCategory(errMsg);
    if (!result.ok && existingCat && existingCat !== "UTILITY") {
      // Template já existe no Meta com outra categoria, reenviar com a mesma
      result = await submit(existingCat);
      usedCategory = existingCat;
    } else if (!result.ok && (/INTERNAL/i.test(errMsg) || result.status >= 500) && !existingCat) {
      // Falha genérica do provider, tenta MARKETING como fallback
      result = await submit("MARKETING");
      usedCategory = "MARKETING";
      const retryMsg = extractMetaMsg(result);
      const retryExisting = detectExistingCategory(retryMsg);
      if (!result.ok && retryExisting) {
        result = await submit(retryExisting);
        usedCategory = retryExisting;
      }
    }


    if (!result.ok) {
      const detail = typeof result.json === "string"
        ? result.json
        : JSON.stringify(result.json ?? {}, null, 2);
      const finalMsg = String(result.json?.error?.message ?? result.json?.error?.error_user_msg ?? result.json?.error ?? result.json?.message ?? "");
      throw new Error(
        `Falha ao enviar template (HTTP ${result.status})${finalMsg ? `: ${finalMsg}` : ""}\nDetalhe: ${detail.slice(0, 800)}`
      );
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

/**
 * Sincroniza status (APPROVED/PENDING/REJECTED) com a Meta para todos os
 * templates já enviados (que têm meta_template_id e meta_channel_id).
 */
export const syncMetaTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.EVOHUB_API_KEY;
    if (!key) throw new Error("EVOHUB_API_KEY não configurada");

    const { data: rows, error } = await context.supabase
      .from("wa_templates" as any)
      .select("id, meta_template_id, meta_channel_id, slug, nome")
      .not("meta_template_id", "is", null);
    if (error) throw new Error(error.message);

    const listRes = await fetch(`${EVOHUB_BASE}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });
    const listJson: any = await listRes.json().catch(() => null);
    const list: any[] = Array.isArray(listJson) ? listJson : listJson?.data ?? listJson?.channels ?? [];

    let updated = 0;
    for (const row of (rows ?? []) as any[]) {
      const ch = list.find((c) => String(c.id) === String(row.meta_channel_id));
      if (!ch) continue;
      const meta = typeof ch.metadata === "string" ? JSON.parse(ch.metadata) : (ch.metadata ?? {});
      const metaConn = ch.meta_connection ?? meta?.meta_connection ?? null;
      const wabaId: string | undefined =
        metaConn?.waba_id ?? metaConn?.business_account_id ?? metaConn?.whatsapp_business_account_id ??
        ch?.waba_id ?? meta?.waba_id;
      const chToken: string | undefined = ch.token ?? ch.api_token ?? meta?.token;
      if (!wabaId || !chToken) continue;

      const res = await fetch(
        `${EVOHUB_BASE}/meta/${wabaId}/message_templates?fields=name,status,category,id,rejected_reason&limit=200`,
        { headers: { Authorization: `Bearer ${chToken}`, "Content-Type": "application/json" } },
      );
      const json: any = await res.json().catch(() => null);
      const tpls: any[] = Array.isArray(json?.data) ? json.data : [];
      const match = tpls.find((t) => String(t.id) === String(row.meta_template_id))
        ?? tpls.find((t) => String(t.name) === String(row.slug ?? row.nome));
      if (!match) continue;

      await context.supabase
        .from("wa_templates" as any)
        .update({
          meta_status: match.status ?? null,
          meta_category: match.category ?? null,
        })
        .eq("id", row.id);
      updated += 1;
    }
    return { ok: true, updated, total: (rows ?? []).length };
  });

