type WaTemplateRecord = {
  slug?: string | null;
  nome?: string | null;
  conteudo?: string | null;
  vars?: string[] | null;
  buttons?: Array<{ id?: string | null; label?: string | null; text?: string | null }> | null;
};

export function renderTemplateText(tpl: string, vars: Record<string, string>) {
  return String(tpl ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function templateName(tpl: WaTemplateRecord): string {
  return String(tpl.slug || tpl.nome || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
}

function varsFromContent(content: string): string[] {
  const out: string[] = [];
  String(content ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name) => {
    if (!out.includes(name)) out.push(name);
    return "";
  });
  return out;
}

export function buildWhatsAppTemplateMessage(
  tpl: WaTemplateRecord,
  vars: Record<string, string>,
  options?: {
    language?: string;
    buttonPayloads?: Record<string, string>;
  },
) {
  const name = templateName(tpl);
  if (!name) throw new Error("Template sem nome/slugs para envio via Meta");

  const orderedVars = Array.isArray(tpl.vars) && tpl.vars.length > 0
    ? tpl.vars.map(String)
    : varsFromContent(String(tpl.conteudo ?? ""));

  const components: any[] = [];
  if (orderedVars.length > 0) {
    components.push({
      type: "body",
      parameters: orderedVars.map((key) => ({ type: "text", text: String(vars[key] ?? "") })),
    });
  }

  const buttons = Array.isArray(tpl.buttons) ? tpl.buttons : [];
  buttons.slice(0, 3).forEach((button, index) => {
    const id = String(button?.id ?? "").trim();
    const payload = id ? options?.buttonPayloads?.[id] : "";
    if (!payload) return;
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload: payload.slice(0, 128) }],
    });
  });

  return {
    type: "template",
    template: {
      name,
      language: { code: options?.language ?? "pt_BR" },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}