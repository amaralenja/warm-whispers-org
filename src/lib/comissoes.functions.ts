import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 
              process.env.SUPABASE_SECRET_KEY || 
              process.env.SUPABASE_SECRET_KEYS || 
              process.env.SUPABASE_SERVICE_KEY ||
              process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Credenciais do Supabase não configuradas no servidor.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export type DiaComissao = {
  data: string;
  vendas: number;
  faturamento: number;
  cumulativo: number;
  rate: number;
  milhares: number;
  comissao: number;
};

export type ComissaoRow = {
  id: number;
  utm: string;
  nome: string;
  expert: string | null;
  fotoUrl: string | null;
  pixChave: string | null;
  faturamento: number;
  vendas: number;
  comissao: number;
  tierAtual: number;
  dias: DiaComissao[];
};

export type ComissoesPayload = {
  rows: ComissaoRow[];
  totalFaturamento: number;
  totalComissao: number;
};

export type ComissoesRange = { from?: string | null; to?: string | null };

function assertAdmin(context: any) {
  if (context?.vendor) {
    const perm = context.vendor.permissoes;
    const hasPerm = perm?.["operacao-x1"]?.["comissoes"] === true;
    if (!hasPerm) {
      throw new Error("Acesso restrito a administradores");
    }
  }
}

export const getComissoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ComissoesRange | undefined) => input ?? {})
  .handler(async (opts): Promise<ComissoesPayload> => {
    const { parseTicket, parseDataField, tierRate } = await import("@/lib/comissoes.server");
    const context = opts?.context;
    assertAdmin(context);
    const supabase = context.vendor ? (await getAdminClient().catch(() => context.supabase)) : context.supabase;
    const data = opts?.data ?? {};
    const fromTs = data.from ? Date.UTC(+data.from.slice(0, 4), +data.from.slice(5, 7) - 1, +data.from.slice(8, 10)) : null;
    const toTs = data.to ? Date.UTC(+data.to.slice(0, 4), +data.to.slice(5, 7) - 1, +data.to.slice(8, 10)) : null;

    const inRange = (t: number | null) => {
      if (fromTs == null && toTs == null) return true;
      if (t == null) return false;
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t > toTs) return false;
      return true;
    };

    async function fetchAll<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
      const PAGE = 1000;
      const out: T[] = [];
      for (let i = 0; ; i++) {
        const { data, error } = await build(i * PAGE, i * PAGE + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < PAGE) break;
      }
      return out;
    }

    const [vendedoresRes, vendasAll] = await Promise.all([
      supabase.from("vendedores").select("id, utm, nome, expert, foto_url, ativo, pix_chave"),
      fetchAll<any>((from, to) =>
        supabase
          .from("vendas")
          .select('"Ticket", "Data", "UTM", "Evento"')
          .or('Evento.eq.purchase_approved,Evento.ilike.*aprov*')
          .range(from, to),
      ),
    ]);

    const vendedores = (vendedoresRes.data ?? []) as any[];

    // Agrupa vendas por UTM + dia (ISO)
    const byUtm = new Map<string, Map<string, { faturamento: number; vendas: number }>>();
    for (const v of vendasAll) {
      const t = parseDataField(v.Data);
      if (!inRange(t)) continue;
      if (t == null) continue;
      const utm = String(v.UTM ?? "").toUpperCase().trim();
      if (!utm) continue;
      const d = new Date(t);
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      let daysMap = byUtm.get(utm);
      if (!daysMap) { daysMap = new Map(); byUtm.set(utm, daysMap); }
      const entry = daysMap.get(iso) ?? { faturamento: 0, vendas: 0 };
      entry.faturamento += parseTicket(v.Ticket);
      entry.vendas += 1;
      daysMap.set(iso, entry);
    }

    const rows: ComissaoRow[] = vendedores
      .filter((v) => v.utm)
      .map((v) => {
        const key = String(v.utm).toUpperCase();
        const daysMap = byUtm.get(key) ?? new Map();
        const dias: DiaComissao[] = [];
        let faturamento = 0;
        let vendas = 0;
        let comissao = 0;
        let cumulativo = 0;
        let startStr = data.from;
        let endStr = data.to;
        if (!startStr || !endStr) {
          const sortedKeys = Array.from(daysMap.keys()).sort();
          if (sortedKeys.length > 0) {
            startStr = startStr || sortedKeys[0];
            endStr = endStr || sortedKeys[sortedKeys.length - 1];
          }
        }

        if (startStr && endStr) {
          const [sY, sM, sD] = startStr.split("-").map(Number);
          const [eY, eM, eD] = endStr.split("-").map(Number);
          const current = new Date(Date.UTC(sY, sM - 1, sD));
          const end = new Date(Date.UTC(eY, eM - 1, eD));

          while (current <= end) {
            const iso = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
            const day = daysMap.get(iso) ?? { faturamento: 0, vendas: 0 };

            cumulativo += day.faturamento;
            const isGustavo = String(v.expert ?? "").toLowerCase().trim() === "gustavo";
            const rate = isGustavo ? 30 : tierRate(cumulativo);
            let milhares = 0;
            if (day.faturamento >= 991) {
              milhares = 1;
              while (true) {
                const proximoMinimo = ((milhares + 1) * 1000) - ((milhares + 1) * 10 - 1);
                if (day.faturamento >= proximoMinimo) {
                  milhares++;
                } else {
                  break;
                }
              }
            }
            const valor = milhares * rate;

            dias.push({
              data: iso,
              vendas: day.vendas,
              faturamento: day.faturamento,
              cumulativo,
              rate,
              milhares,
              comissao: valor,
            });

            faturamento += day.faturamento;
            vendas += day.vendas;
            comissao += valor;

            current.setUTCDate(current.getUTCDate() + 1);
          }
        }
        const isGustavo = String(v.expert ?? "").toLowerCase().trim() === "gustavo";
        return {
          id: Number(v.id),
          utm: key,
          nome: v.nome ?? key,
          expert: v.expert ?? null,
          fotoUrl: v.foto_url ?? null,
          pixChave: v.pix_chave ?? null,
          faturamento,
          vendas,
          comissao,
          tierAtual: isGustavo ? 30 : tierRate(faturamento),
          dias,
        };
      })
      .filter((r) => r.faturamento > 0 || r.dias.length > 0)
      .sort((a, b) => b.faturamento - a.faturamento);

    const totalFaturamento = rows.reduce((a, r) => a + r.faturamento, 0);
    const totalComissao = rows.reduce((a, r) => a + r.comissao, 0);

    return { rows, totalFaturamento, totalComissao };
  });

export const setPixChave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: number; pix: string }) => ({
    id: Number(input.id),
    pix: String(input.pix ?? "").trim().slice(0, 200),
  }))
  .handler(async (opts) => {
    const context = opts?.context;
    assertAdmin(context);
    const supabase = context.vendor ? (await getAdminClient().catch(() => context.supabase)) : context.supabase;
    const { error } = await supabase
      .from("vendedores")
      .update({ pix_chave: opts.data.pix || null })
      .eq("id", opts.data.id);
    if (error) throw error;
    return { ok: true };
  });

// ─── HT Comissões (SDR / Closer) ────────────────────────────────────

export type HtComissaoDetalhe = {
  leadNome: string;
  tipo: "comparecimento" | "venda";
  valor: number;
  comissao: number;
  data: string;
};

export type HtComissaoMembro = {
  id: number;
  nome: string;
  tipo: "sdr" | "closer";
  email: string | null;
  fotoUrl: string | null;
  regra: Record<string, any>;
  comparecimentos: number;
  vendas: number;
  valorVendas: number;
  comissaoFixa: number;
  comissaoPercentual: number;
  comissaoTotal: number;
  detalhes: HtComissaoDetalhe[];
};

export type HtComissoesPayload = {
  membros: HtComissaoMembro[];
  totalComissao: number;
};

export const getHtComissoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ComissoesRange | undefined) => input ?? {})
  .handler(async (opts): Promise<HtComissoesPayload> => {
    // Constants inside handler to avoid TanStack splitter issues
    const QUIZ_SB_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
    const QUIZ_ANON =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";
    const COMPARECEU_STAGES = ["followup", "remarcada", "sinal", "fechado"];
    const FECHADO_STAGES = ["fechado"];
    const FECHADO_CRM = ["fechado", "ganho"];
    function getDefaultRegra(tipo: string): Record<string, any> {
      if (tipo === "sdr") {
        return { fixo_comparecimento: 30, percentual_venda: 2, meta_comparecimento: 50, percentual_venda_meta: 4, fixo_comparecimento_meta: 30 };
      }
      return { percentual_venda: 4 };
    }

    const context = opts?.context;
    assertAdmin(context);
    const supabase = context.vendor
      ? await getAdminClient().catch(() => context.supabase)
      : context.supabase;
    const data = opts?.data ?? {};

    // Quiz Supabase (external, read-only)
    const { createClient: createSbClient } = await import("@supabase/supabase-js");
    const quizSb = createSbClient(QUIZ_SB_URL, QUIZ_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch HT team, kanban state, vendas in parallel
    const [teamRes, kanbanRes, vendasRes] = await Promise.all([
      supabase
        .from("ht_team")
        .select("id, nome, tipo, email, foto_url, ativo, permissoes"),
      supabase
        .from("ht_kanban_state")
        .select(
          "lead_id, scheduled_at, closer_email, sdr_stage, closer_stage, is_fake"
        ),
      supabase
        .from("ht_vendas")
        .select(
          "id, cliente, closer, data, valor_total, valor_liquido, lead_id, status"
        ),
    ]);

    const team = ((teamRes.data ?? []) as any[]).filter((m: any) => m.ativo !== false);
    const kanban = (kanbanRes.data ?? []) as any[];
    const htVendas = (vendasRes.data ?? []) as any[];

    // Fetch quiz leads with date filter
    const quizLeads: any[] = [];
    const pageSize = 1000;
    for (let i = 0; i < 20; i++) {
      let q = quizSb
        .from("leads")
        .select(
          "id, nome, email, whatsapp, crm_status, crm_valor, crm_data_agendamento, data_criacao, utm_source"
        )
        .order("data_criacao", { ascending: false })
        .range(i * pageSize, i * pageSize + pageSize - 1);
      if (data.from) q = q.gte("data_criacao", data.from);
      if (data.to) {
        const toDate = new Date(data.to);
        toDate.setDate(toDate.getDate() + 1);
        q = q.lt("data_criacao", toDate.toISOString().slice(0, 10));
      }
      const { data: rows } = await q;
      if (!rows || rows.length === 0) break;
      quizLeads.push(...rows);
      if (rows.length < pageSize) break;
    }

    // Build kanban lookup: lead_id -> kanban row
    const kanbanMap = new Map<string, any>();
    for (const k of kanban) kanbanMap.set(k.lead_id, k);

    // Date range filter helper
    const fromTs = data.from
      ? new Date(data.from).getTime()
      : null;
    const toTs = data.to
      ? new Date(data.to).getTime() + 86400000
      : null;
    const inRange = (dateStr: string | null) => {
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t >= toTs) return false;
      return true;
    };

    // Build closer email -> team member map
    const closerByEmail = new Map<string, any>();
    const closerByName = new Map<string, any>();
    for (const m of team) {
      if (m.tipo === "closer") {
        if (m.email) closerByEmail.set(m.email.toLowerCase(), m);
        if (m.nome) closerByName.set(m.nome.toLowerCase().trim(), m);
      }
    }

    // Process each team member
    const membros: HtComissaoMembro[] = [];

    for (const m of team) {
      const regra =
        (m.permissoes as any)?.comissao_regra ?? getDefaultRegra(m.tipo);
      const detalhes: HtComissaoDetalhe[] = [];
      let comparecimentos = 0;
      let vendas = 0;
      let valorVendas = 0;
      let comissaoFixa = 0;
      let comissaoPercentual = 0;

      if (m.tipo === "sdr") {
        // SDR: count comparecimentos from quiz leads that have scheduled_at in range
        for (const lead of quizLeads) {
          const ks = kanbanMap.get(lead.id);
          if (!ks) continue;
          if (ks.is_fake) continue;
          const schedDate = ks.scheduled_at || lead.crm_data_agendamento;
          if (!inRange(schedDate) && !inRange(lead.data_criacao)) continue;

          const closerStage = (ks.closer_stage || "").toLowerCase();
          const crmStatus = (lead.crm_status || "").toLowerCase().trim();
          const detDate = schedDate || lead.data_criacao || "";
          const fmtD = detDate.slice(0, 10);

          // Comparecimento check
          if (COMPARECEU_STAGES.includes(closerStage)) {
            comparecimentos++;
            detalhes.push({
              leadNome: lead.nome || lead.whatsapp || "Sem nome",
              tipo: "comparecimento",
              valor: 0,
              comissao: regra.fixo_comparecimento ?? 30,
              data: fmtD,
            });
          }

          // Venda check
          if (
            FECHADO_STAGES.includes(closerStage) ||
            FECHADO_CRM.includes(crmStatus)
          ) {
            const val = Number(lead.crm_valor || 0);
            if (val > 0) {
              vendas++;
              valorVendas += val;
            }
          }
        }

        // Calculate SDR commission
        const pctVenda =
          comparecimentos >= (regra.meta_comparecimento ?? 50)
            ? regra.percentual_venda_meta ?? 4
            : regra.percentual_venda ?? 2;

        comissaoFixa = comparecimentos * (regra.fixo_comparecimento ?? 30);
        comissaoPercentual = valorVendas * (pctVenda / 100);

        // Add venda details
        for (const lead of quizLeads) {
          const ks = kanbanMap.get(lead.id);
          if (!ks) continue;
          if (ks.is_fake) continue;
          const schedDate = ks.scheduled_at || lead.crm_data_agendamento;
          if (!inRange(schedDate) && !inRange(lead.data_criacao)) continue;
          const closerStage = (ks.closer_stage || "").toLowerCase();
          const crmStatus = (lead.crm_status || "").toLowerCase().trim();
          if (
            FECHADO_STAGES.includes(closerStage) ||
            FECHADO_CRM.includes(crmStatus)
          ) {
            const val = Number(lead.crm_valor || 0);
            if (val > 0) {
              detalhes.push({
                leadNome: lead.nome || lead.whatsapp || "Sem nome",
                tipo: "venda",
                valor: val,
                comissao: val * (pctVenda / 100),
                data: (schedDate || lead.data_criacao || "").slice(0, 10),
              });
            }
          }
        }
      } else if (m.tipo === "closer") {
        const email = (m.email || "").toLowerCase();
        const nome = (m.nome || "").toLowerCase().trim();

        // From ht_vendas: match by closer name
        for (const v of htVendas) {
          if (!inRange(v.data)) continue;
          const vCloser = (v.closer || "").toLowerCase().trim();
          if (vCloser !== nome && vCloser !== email) continue;
          const val = Number(v.valor_total || 0);
          if (val <= 0) continue;
          vendas++;
          valorVendas += val;
          const pct = regra.percentual_venda ?? 4;
          const com = val * (pct / 100);
          comissaoPercentual += com;
          detalhes.push({
            leadNome: v.cliente || "Sem nome",
            tipo: "venda",
            valor: val,
            comissao: com,
            data: (v.data || "").slice(0, 10),
          });
        }

        // From quiz leads: match by closer_email in kanban
        for (const lead of quizLeads) {
          const ks = kanbanMap.get(lead.id);
          if (!ks) continue;
          if (ks.is_fake) continue;
          const closerStage = (ks.closer_stage || "").toLowerCase();
          const crmStatus = (lead.crm_status || "").toLowerCase().trim();
          if (
            !FECHADO_STAGES.includes(closerStage) &&
            !FECHADO_CRM.includes(crmStatus)
          )
            continue;
          const closerEmail = (ks.closer_email || "").toLowerCase();
          if (closerEmail !== email) continue;
          const schedDate = ks.scheduled_at || lead.crm_data_agendamento;
          if (!inRange(schedDate) && !inRange(lead.data_criacao)) continue;
          const val = Number(lead.crm_valor || 0);
          if (val <= 0) continue;
          const leadAlreadyCounted = htVendas.some(
            (hv: any) => hv.lead_id === lead.id
          );
          if (leadAlreadyCounted) continue;
          vendas++;
          valorVendas += val;
          const pct = regra.percentual_venda ?? 4;
          const com = val * (pct / 100);
          comissaoPercentual += com;
          detalhes.push({
            leadNome: lead.nome || lead.whatsapp || "Sem nome",
            tipo: "venda",
            valor: val,
            comissao: com,
            data: (schedDate || lead.data_criacao || "").slice(0, 10),
          });
        }
      }

      const comissaoTotal = comissaoFixa + comissaoPercentual;

      membros.push({
        id: m.id,
        nome: m.nome ?? "Sem nome",
        tipo: m.tipo as "sdr" | "closer",
        email: m.email ?? null,
        fotoUrl: m.foto_url ?? null,
        regra,
        comparecimentos,
        vendas,
        valorVendas,
        comissaoFixa,
        comissaoPercentual,
        comissaoTotal,
        detalhes,
      });
    }

    membros.sort((a, b) => b.comissaoTotal - a.comissaoTotal);
    const totalComissao = membros.reduce((s, m) => s + m.comissaoTotal, 0);

    return { membros, totalComissao };
  });

export const updateComissaoRegra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { memberId: number; regra: Record<string, any> }) => ({
    memberId: Number(input.memberId),
    regra: input.regra,
  }))
  .handler(async (opts) => {
    const context = opts?.context;
    assertAdmin(context);
    const supabase = context.vendor
      ? await getAdminClient().catch(() => context.supabase)
      : context.supabase;

    const { data: row, error: readErr } = await supabase
      .from("ht_team")
      .select("permissoes")
      .eq("id", opts.data.memberId)
      .single();
    if (readErr) throw readErr;

    const currentPerm = (row?.permissoes as Record<string, any>) ?? {};
    const newPerm = { ...currentPerm, comissao_regra: opts.data.regra };

    const { error } = await supabase
      .from("ht_team")
      .update({ permissoes: newPerm })
      .eq("id", opts.data.memberId);
    if (error) throw error;

    return { ok: true };
  });

