const GRAPH = "https://graph.facebook.com/v21.0";

async function sendWhatsapp(channelId: string, phone: string, body: any, db: any) {
  const { sendWA } = await import("@/lib/flow-engine.server");
  return sendWA(channelId, phone, body, db);
}

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function normalizeBrPhone(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (!d.startsWith("55") && (d.length === 11 || d.length === 10)) d = "55" + d;
  if (d.length === 12 && d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 8) d = "55" + ddd + "9" + rest;
  }
  return d;
}

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return Math.round(n).toLocaleString("pt-BR");
}
function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}

const INSIGHT_FIELDS =
  "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values,cost_per_action_type";

type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  purchases: number;
  purchaseValue: number;
  leads: number;
  lpv: number;
  addToCart: number;
  initiateCheckout: number;
};

function emptyTotals(): Totals {
  return {
    spend: 0, impressions: 0, clicks: 0, reach: 0,
    purchases: 0, purchaseValue: 0, leads: 0, lpv: 0,
    addToCart: 0, initiateCheckout: 0,
  };
}

function pickAction(actions: any[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  for (const t of types) {
    const f = actions.find((a) => a.action_type === t);
    if (f) return Number(f.value || 0);
  }
  return 0;
}

function parseRow(d: any): Totals {
  const t = emptyTotals();
  if (!d) return t;
  t.spend = Number(d.spend || 0);
  t.impressions = Number(d.impressions || 0);
  t.clicks = Number(d.clicks || 0);
  t.reach = Number(d.reach || 0);
  t.purchases = pickAction(d.actions, ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"]);
  t.purchaseValue = pickAction(d.action_values, ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"]);
  t.leads = pickAction(d.actions, ["offsite_conversion.fb_pixel_lead", "lead", "onsite_conversion.lead_grouped"]);
  t.lpv = pickAction(d.actions, ["landing_page_view"]);
  t.addToCart = pickAction(d.actions, ["offsite_conversion.fb_pixel_add_to_cart", "add_to_cart"]);
  t.initiateCheckout = pickAction(d.actions, ["offsite_conversion.fb_pixel_initiate_checkout", "initiate_checkout"]);
  return t;
}

async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json: any = await res.json();
  if (!res.ok || json?.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

async function generateAdsDiagnostico(stats: Totals & {
  preset: string;
  cpa: number;
  roas: number;
  ctr: number;
  cpm: number;
  cpc: number;
  topCampaign: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "IA indisponível (chave OpenAI não configurada).";

  const SYSTEM = `Você é gestor de tráfego sênior, direto e informal. Português BR coloquial, tipo "mano, beleza". No máximo 5 linhas. Sem travessões. Diga o que tá rodando bem, o que tá queimando grana, e 1 ação prática pra amanhã. Use no máximo 2 emojis. Não invente números.`;

  const user = `Período: ${stats.preset}
Investido: ${fmtBRL(stats.spend)}
Faturamento (Purchase): ${fmtBRL(stats.purchaseValue)}
ROAS: ${stats.roas.toFixed(2)}x
Compras: ${stats.purchases}
CPA: ${fmtBRL(stats.cpa)}
Leads: ${stats.leads}
Cliques: ${stats.clicks} | CTR: ${fmtPct(stats.ctr)}
CPM: ${fmtBRL(stats.cpm)} | CPC: ${fmtBRL(stats.cpc)}
Impressões: ${fmtInt(stats.impressions)} | Alcance: ${fmtInt(stats.reach)}
Campanha destaque: ${stats.topCampaign}

Manda uma análise rápida e prática.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return "Resumo automático indisponível, mas os números tão aí em cima.";
    const j: any = await res.json();
    return String(j?.choices?.[0]?.message?.content ?? "").replace(/—/g, ",").trim() || "Sem análise.";
  } catch {
    return "Não consegui gerar análise agora.";
  }
}

const PRESET_LABEL: Record<string, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last_7d: "Últimos 7 dias",
  last_14d: "Últimos 14 dias",
  last_30d: "Últimos 30 dias",
  this_month: "Este mês",
};

async function computeAndSendAds(db: any, opts: { preset?: string } = {}) {
  const token = process.env.META_ADS_SYSTEM_USER_TOKEN;
  const accountRaw = process.env.META_ADS_ACCOUNT_ID;
  if (!token) throw new Error("META_ADS_SYSTEM_USER_TOKEN não configurado");
  if (!accountRaw) throw new Error("META_ADS_ACCOUNT_ID não configurado");
  const accountId = accountRaw.startsWith("act_") ? accountRaw : `act_${accountRaw}`;
  const preset = opts.preset ?? "yesterday";
  const presetLabel = PRESET_LABEL[preset] ?? preset;

  // 1. Account-level totals
  const accJson = await graphGet(`${accountId}/insights`, {
    fields: INSIGHT_FIELDS,
    date_preset: preset,
    level: "account",
  }, token);
  const accRow = Array.isArray(accJson?.data) ? accJson.data[0] : null;
  const t = parseRow(accRow);

  // 2. Per-campaign breakdown (top performers)
  const campJson = await graphGet(`${accountId}/campaigns`, {
    fields: `id,name,effective_status,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`,
    limit: "100",
  }, token);
  const camps = (campJson.data ?? []).map((c: any) => {
    const ins = parseRow(Array.isArray(c.insights?.data) ? c.insights.data[0] : null);
    return {
      id: c.id,
      name: c.name as string,
      status: c.effective_status as string,
      ...ins,
      roas: ins.spend > 0 ? ins.purchaseValue / ins.spend : 0,
      cpa: ins.purchases > 0 ? ins.spend / ins.purchases : 0,
    };
  }).filter((c: any) => c.spend > 0);

  const activeCount = camps.filter((c: any) => c.status === "ACTIVE").length;
  const topByRevenue = [...camps].sort((a, b) => b.purchaseValue - a.purchaseValue).slice(0, 3);
  const worstByCpa = [...camps].filter((c: any) => c.purchases > 0)
    .sort((a, b) => b.cpa - a.cpa).slice(0, 2);

  const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  const cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
  const cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
  const cpa = t.purchases > 0 ? t.spend / t.purchases : 0;
  const cpl = t.leads > 0 ? t.spend / t.leads : 0;
  const roas = t.spend > 0 ? t.purchaseValue / t.spend : 0;
  const lucro = t.purchaseValue - t.spend;

  const topCampaign = topByRevenue[0]?.name ?? "Nenhuma com venda";

  // Build readable top/bottom blocks
  const topBlock = topByRevenue.length
    ? topByRevenue.map((c: any, i: number) =>
        `${i + 1}. ${c.name} | ${fmtBRL(c.purchaseValue)} (${c.roas.toFixed(2)}x)`).join("\n")
    : "Sem vendas no período";

  const worstBlock = worstByCpa.length
    ? worstByCpa.map((c: any) =>
        `• ${c.name} | CPA ${fmtBRL(c.cpa)} (${c.purchases} compras)`).join("\n")
    : "Sem alertas";

  const diagnostico = await generateAdsDiagnostico({
    ...t, preset: presetLabel, cpa, roas, ctr, cpm, cpc, topCampaign,
  });

  // Load template + recipients
  const { data: tpl } = await db
    .from("wa_templates" as any)
    .select("*")
    .eq("slug", "analytics_ads")
    .maybeSingle();
  if (!tpl) throw new Error("Template analytics_ads não encontrado");

  const { data: recipients } = await db
    .from("wa_template_recipients" as any)
    .select("id, telefone, nome")
    .eq("template_id", (tpl as any).id)
    .eq("ativo", true);

  const stats = {
    spend: t.spend, impressions: t.impressions, clicks: t.clicks, reach: t.reach,
    purchases: t.purchases, purchaseValue: t.purchaseValue, leads: t.leads,
    ctr, cpm, cpc, cpa, cpl, roas, lucro,
    campanhasAtivas: activeCount, campanhasTotal: camps.length,
  };

  if (!recipients || recipients.length === 0) {
    return { sent: 0, skipped: "no_recipients", stats, topBlock, worstBlock };
  }

  // Channel
  const { data: channels } = await db
    .from("wa_channels" as any)
    .select("id,kind,status,metadata,created_at")
    .eq("kind", "notification")
    .order("created_at", { ascending: false });
  const chRows: any[] = (channels ?? []) as any[];
  const active = chRows.find((r) =>
    String(r.status ?? "").toLowerCase() === "connected" || r.metadata?.meta_connection) ?? chRows[0];
  const channelId = active?.id;
  if (!channelId) throw new Error("Nenhum canal de notificações conectado");

  const text = renderTemplate(String((tpl as any).conteudo ?? ""), {
    periodo: presetLabel,
    investido: fmtBRL(t.spend),
    faturamento: fmtBRL(t.purchaseValue),
    lucro: fmtBRL(lucro),
    roas: `${roas.toFixed(2)}x`,
    compras: String(t.purchases),
    cpa: fmtBRL(cpa),
    leads: String(t.leads),
    cpl: fmtBRL(cpl),
    cliques: fmtInt(t.clicks),
    ctr: fmtPct(ctr),
    cpc: fmtBRL(cpc),
    cpm: fmtBRL(cpm),
    impressoes: fmtInt(t.impressions),
    alcance: fmtInt(t.reach),
    lpv: fmtInt(t.lpv),
    add_to_cart: fmtInt(t.addToCart),
    initiate_checkout: fmtInt(t.initiateCheckout),
    campanhas_ativas: String(activeCount),
    campanhas_total: String(camps.length),
    top_campanhas: topBlock,
    alertas_cpa: worstBlock,
    diagnostico,
  });

  const body = { type: "text", text: { body: text } };
  let sent = 0;
  const errors: string[] = [];
  for (const r of recipients as any[]) {
    const phone = normalizeBrPhone(r.telefone);
    if (!phone) continue;
    try {
      await sendWhatsapp(channelId, phone, body, db);
      sent++;
    } catch (e: any) {
      errors.push(`${r.telefone}: ${e?.message ?? "erro"}`);
    }
  }

  return { sent, total: recipients.length, errors, stats, topBlock, worstBlock };
}

export async function runAdsAnalyticsCron(preset?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return await computeAndSendAds(supabaseAdmin, { preset });
}
