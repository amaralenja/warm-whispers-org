import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAccountAds } from "@/lib/meta-ads-manager.functions";
import { getVendorSession } from "@/lib/vendor-session";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalPicker } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  MessageSquare, Trash2, Phone, Mail, Instagram, Send,
  Wallet, TrendingUp, Target, Rocket, Lightbulb, Users, Flame,
  Calendar, X, Crown, DollarSign, Handshake, CheckCircle2, Megaphone, Loader2, Video
} from "lucide-react";

// Quiz supabase (mesmo que ht-analytics usa) — o lead vive lá, então salvamos lá também.
const QUIZ_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";
const quizSb = createClient(QUIZ_URL, QUIZ_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});


export type LeadLike = {
  id: string;
  nome?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  caixa_letra?: string | null;
  caixa_label?: string | null;
  faturamento?: string | null;
  momento?: string | null;
  objetivo?: string | null;
  investir?: string | null;
  minicurso?: string | null;
  socio?: string | null;
  comprometimento?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  data_criacao?: string | null;
  crm_status?: string | null;
  crm_valor?: number | null;
  crm_valor_recebido?: number | null;
  crm_data_pagamento_restante?: string | null;
  crm_data_agendamento?: string | null;
  respostas?: Record<string, any> | null;
};


type Note = {
  id: string;
  lead_id: string;
  role: string;
  author: string | null;
  body: string;
  created_at: string;
};

type Role = "sdr" | "closer";

const CAIXA_TIER: Record<string, { ring: string; glow: string; badge: string; label: string }> = {
  A: { ring: "ring-zinc-500/40", glow: "", badge: "bg-zinc-500/15 text-zinc-300", label: "Até R$ 1k" },
  B: { ring: "ring-blue-500/40", glow: "", badge: "bg-blue-500/15 text-blue-300", label: "R$ 1k–5k" },
  C: { ring: "ring-cyan-500/40", glow: "", badge: "bg-cyan-500/15 text-cyan-300", label: "R$ 5k–10k" },
  D: { ring: "ring-emerald-500/50", glow: "shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)]", badge: "bg-emerald-500/15 text-emerald-300", label: "R$ 10k–30k" },
  E: { ring: "ring-amber-500/60", glow: "shadow-[0_0_50px_-10px_rgba(245,158,11,0.55)]", badge: "bg-amber-500/15 text-amber-300", label: "R$ 30k–50k" },
  F: { ring: "ring-orange-500/70", glow: "shadow-[0_0_60px_-10px_rgba(249,115,22,0.6)]", badge: "bg-orange-500/15 text-orange-300", label: "R$ 50k–100k" },
  G: { ring: "ring-yellow-500/80", glow: "shadow-[0_0_70px_-8px_rgba(234,179,8,0.75)]", badge: "bg-yellow-500/15 text-yellow-300", label: "R$ 100k+" },
};

const QUIZ_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  caixa: Wallet,
  faturamento: TrendingUp,
  momento: Rocket,
  objetivo: Target,
  investir: Lightbulb,
  minicurso: Lightbulb,
  socio: Users,
  comprometimento: Flame,
};

function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] || "")
    .join("")
    .toUpperCase();
}

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

export function HtLeadDetailDialog({
  lead, role, open, onOpenChange, scheduledAt, onSchedule, onSaleSaved,
  closers = [], closerEmail,
}: {
  lead: LeadLike | null;
  role: Role;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scheduledAt?: string | null;
  onSchedule?: (iso: string | null, closerEmail?: string | null, createMeet?: boolean) => void;
  onSaleSaved?: () => void;
  closers?: { id: string | number; nome: string; email: string | null }[];
  closerEmail?: string | null;
}) {

  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "sdr" | "closer">("all");
  const [mainTab, setMainTab] = useState<"all" | "notes" | "quiz">("all");

  const [schedDraft, setSchedDraft] = useState<string>("");
  const [closerDraft, setCloserDraft] = useState<string>("");
  const [createMeet, setCreateMeet] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("14:00");

  const hoursOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")), []);
  const minutesOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")), []);

  // Registro de venda
  const [saleOpen, setSaleOpen] = useState(false);
  const [saleType, setSaleType] = useState<"direta" | "sinal">("direta");
  const [valorTotal, setValorTotal] = useState<string>("");
  const [valorRecebido, setValorRecebido] = useState<string>("");
  const [dataRestante, setDataRestante] = useState<string>("");
  const [savingSale, setSavingSale] = useState(false);

  const updateDateTime = (date: Date | undefined, timeStr: string) => {
    if (!date) {
      setSelectedDate(undefined);
      setSchedDraft("");
      return;
    }
    const [h, m] = timeStr.split(":");
    const next = new Date(date);
    next.setHours(Number(h || 0), Number(m || 0), 0, 0);
    setSelectedDate(next);
    const pad = (n: number) => String(n).padStart(2, "0");
    setSchedDraft(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`);
  };

  const listAccountAdsFn = useServerFn(listAccountAds);
  
  const { data: allAds, isLoading: loadingAds } = useQuery({
    queryKey: ["ht-account-ads-all"],
    queryFn: () => listAccountAdsFn({ data: { datePreset: "maximum" } }),
    staleTime: 300000,
    enabled: !!open && !!lead?.utm_source,
  });

  const matchedAd = useMemo(() => {
    if (!allAds || !lead) return null;
    const utmContent = String((lead as any).utm_content || "").toLowerCase().trim();
    const utmCampaign = String((lead as any).utm_campaign || "").toLowerCase().trim();

    let found = allAds.find((a: any) => String(a.id) === utmContent);
    if (found) return found;

    if (utmContent) {
      found = allAds.find((a: any) => String(a.name).toLowerCase().includes(utmContent) || utmContent.includes(String(a.name).toLowerCase()));
      if (found) return found;
    }

    if (utmCampaign) {
      found = allAds.find((a: any) => String(a.campaignName).toLowerCase().includes(utmCampaign) || utmCampaign.includes(String(a.campaignName).toLowerCase()));
      if (found) return found;
    }

  }, [allAds, lead]);

  useEffect(() => {
    if (scheduledAt) {
      const d = new Date(scheduledAt);
      setSelectedDate(d);
      const pad = (n: number) => String(n).padStart(2, "0");
      const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setSelectedTime(t);
      setSchedDraft(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${t}`);
    } else {
      setSelectedDate(undefined);
      setSelectedTime("14:00");
      setSchedDraft("");
    }
    setCloserDraft(closerEmail ?? "");
  }, [scheduledAt, closerEmail, open]);


  // Preenche o dialog de venda com o que já existe no lead
  useEffect(() => {
    if (!saleOpen) return;
    const total = Number(lead?.crm_valor || 0);
    const rec = Number(lead?.crm_valor_recebido || 0);
    setValorTotal(total > 0 ? String(total) : "");
    setValorRecebido(rec > 0 ? String(rec) : "");
    setDataRestante(lead?.crm_data_pagamento_restante ?? "");
    if (total > 0 && rec > 0 && rec < total) setSaleType("sinal");
    else setSaleType("direta");
  }, [saleOpen, lead?.id, lead?.crm_valor, lead?.crm_valor_recebido, lead?.crm_data_pagamento_restante]);

  async function saveSale() {
    if (!lead?.id) return;
    const total = Number(String(valorTotal).replace(/\./g, "").replace(",", ".")) || 0;
    if (total <= 0) { toast.error("Informa o valor da venda"); return; }
    let recebido = total;
    let dataRest: string | null = null;
    if (saleType === "sinal") {
      recebido = Number(String(valorRecebido).replace(/\./g, "").replace(",", ".")) || 0;
      if (recebido <= 0) { toast.error("Informa o valor do sinal recebido"); return; }
      if (recebido > total) { toast.error("Sinal não pode ser maior que o total"); return; }
      dataRest = dataRestante || null;
    }
    setSavingSale(true);
    const { error } = await quizSb
      .from("leads")
      .update({
        crm_status: "fechado",
        crm_valor: total,
        crm_valor_recebido: recebido,
        crm_data_pagamento_restante: dataRest,
      })
      .eq("id", lead.id);
    
    if (!error) {
      try {
        const { data: existingVenda } = (await supabase
          .from("ht_vendas" as any)
          .select("id")
          .eq("lead_id", lead.id)
          .maybeSingle()) as any;

        const vendaPayload = {
          lead_id: lead.id,
          cliente: lead.nome || "",
          closer: closerEmail || authorName || "",
          valor_total: total,
          valor_liquido: total * 0.9,
          data: new Date().toISOString(),
          status: saleType === "sinal" ? "sinal" : "completed",
          produto: "High Ticket"
        };

        if (existingVenda?.id) {
          await supabase
            .from("ht_vendas" as any)
            .update(vendaPayload)
            .eq("id", existingVenda.id);
        } else {
          await supabase
            .from("ht_vendas" as any)
            .insert([vendaPayload]);
        }
      } catch (err) {
        console.error("Erro ao sincronizar com ht_vendas local:", err);
      }
    }

    setSavingSale(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success(saleType === "direta" ? "Venda registrada 🚀" : "Sinal registrado 💰");
    setSaleOpen(false);
    onSaleSaved?.();
    onOpenChange(false);
  }



  const authorName = useMemo(() => {
    try {
      const s = typeof window !== "undefined"
        ? (localStorage.getItem("vendor_session") || localStorage.getItem("ht_team_session"))
        : null;
      if (s) {
        const parsed = JSON.parse(s);
        return parsed?.nome || parsed?.codigo || (role === "sdr" ? "SDR" : "Closer");
      }
      return role === "sdr" ? "SDR" : "Closer";
    } catch { return role === "sdr" ? "SDR" : "Closer"; }
  }, [role]);

  useEffect(() => {
    if (!open || !lead?.id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("ht_lead_notes" as any)
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setNotes(((data as any[]) ?? []) as Note[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, lead?.id]);

  async function addNote() {
    if (!draft.trim() || !lead?.id) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("ht_lead_notes" as any)
      .insert({ lead_id: lead.id, role, author: authorName, body: draft.trim() })
      .select("*")
      .single();
    setSaving(false);
    if (!error && data) {
      setNotes((prev) => [...prev, data as any as Note]);
      setDraft("");
      toast.success("Observação salva com sucesso!");
    } else if (error) {
      toast.error("Erro ao salvar observação: " + error.message);
    }
  }

  async function deleteNote(id: string) {
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== id));
    const { error } = await supabase.from("ht_lead_notes" as any).delete().eq("id", id);
    if (error) {
      setNotes(prev);
      toast.error("Erro ao remover observação: " + error.message);
    } else {
      toast.success("Observação removida");
    }
  }

  if (!open || !lead) return null;

  const letter = (lead?.caixa_letra ?? "").toUpperCase();
  const tier = CAIXA_TIER[letter];
  const name = lead?.nome || "Sem nome";
  const igHandle = (lead?.instagram || "").replace(/^@/, "").replace(/\/+$/, "");
  const isHigh = "EFG".includes(letter);

  const safeStr = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "object") {
      const o = v as any;
      const s = o.label ?? o.value ?? o.text ?? o.name ?? null;
      if (typeof s === "string" || typeof s === "number") return String(s);
      try { return JSON.stringify(o); } catch { return null; }
    }
    return String(v);
  };

  const INVESTIR_MAP: Record<string, string> = {
    A: "Menos de R$ 1.000",
    B: "De R$ 1.000 a R$ 5.000",
    C: "De R$ 5.000 a R$ 10.000",
    D: "De R$ 10.000 a R$ 25.000",
    E: "De R$ 25.000 a R$ 50.000",
    F: "De R$ 50.000 a R$ 100.000",
    G: "Mais de R$ 100.000",
  };

  const translateInvestir = (v: unknown): string | null => {
    const s = safeStr(v);
    if (!s) return null;
    const clean = s.trim().toUpperCase();
    if (clean.length === 1 && INVESTIR_MAP[clean]) {
      return INVESTIR_MAP[clean];
    }
    return s;
  };

  const friendlyKey = (k: string): string => {
    const keys: Record<string, string> = {
      caixa_letra: "Caixa disponível",
      caixa_label: "Faixa de caixa",
      faturamento: "Faturamento atual",
      momento: "Momento atual",
      objetivo: "Meta / Objetivo",
      investir: "Quanto pode investir?",
      minicurso: "Tem ideia de SaaS?",
      socio: "Sócio / Cônjuge",
      comprometimento: "Comprometimento",
      porque: "Por que quer fazer parte?",
      renda: "Renda extra",
      situacao: "Situação atual",
      funil: "Funil de vendas",
    };
    return keys[k] || k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const rawCaixaVal = lead?.caixa_label || CAIXA_TIER[letter]?.label || (letter ? `Faixa ${letter}` : null);
  const caixaValue = safeStr(rawCaixaVal);

  const answers: { key: string; label: string; value?: string | null }[] = [];
  
  if (lead) {
    const knownKeys = [
      { key: "caixa", label: "Caixa disponível", value: caixaValue },
      { key: "faturamento", label: "Faturamento atual", value: safeStr(lead.faturamento) },
      { key: "momento", label: "Momento atual", value: safeStr(lead.momento) },
      { key: "objetivo", label: "Meta / Objetivo", value: safeStr(lead.objetivo) },
      { key: "investir", label: "Quanto pode investir?", value: translateInvestir(lead.investir) },
      { key: "minicurso", label: "Tem ideia de SaaS?", value: safeStr(lead.minicurso) },
      { key: "socio", label: "Sócio / Cônjuge", value: safeStr(lead.socio) },
      { key: "comprometimento", label: "Comprometimento", value: safeStr(lead.comprometimento) },
    ];

    knownKeys.forEach((k) => {
      if (k.value) answers.push(k);
    });

    if (lead.respostas && typeof lead.respostas === "object") {
      const excludedKeys = new Set([
        "caixa_letra", "caixa_label", "faturamento", "momento", "objetivo", "investir",
        "minicurso", "socio", "comprometimento", "step_atual", "caixa_letra_calculada",
        "received_at", "updated_at", "id", "nome", "email", "whatsapp", "instagram",
        "utm_source", "utm_medium", "utm_campaign", "utm_content", "fbc", "fbp", "fbclid", "gclid"
      ]);

      Object.entries(lead.respostas).forEach(([key, val]) => {
        if (excludedKeys.has(key)) return;
        const sVal = safeStr(val);
        if (!sVal) return;
        answers.push({
          key,
          label: friendlyKey(key),
          value: sVal,
        });
      });
    }
  }

  const filteredNotes = filter === "all" ? notes : notes.filter((n) => n.role === filter);
  const sdrCount = notes.filter((n) => n.role === "sdr").length;
  const closerCount = notes.filter((n) => n.role === "closer").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 gap-0 overflow-hidden border-border/60 bg-background"
        style={{ maxHeight: "90vh" }}
      >
        {/* HERO */}
        <div className="relative overflow-hidden border-b border-border/60">
          <div
            className="absolute inset-0 opacity-70 pointer-events-none"
            style={{
              background: isHigh
                ? "radial-gradient(ellipse at top right, oklch(0.78 0.16 75 / 0.35), transparent 60%), radial-gradient(ellipse at bottom left, oklch(0.55 0.15 25 / 0.18), transparent 55%)"
                : "radial-gradient(ellipse at top right, oklch(0.55 0.10 260 / 0.25), transparent 60%)",
            }}
          />
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{ backgroundImage: "linear-gradient(oklch(1 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-background/70 backdrop-blur border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative p-6 md:p-8">
            <div className="flex items-start gap-5">
              <div className={`relative h-16 w-16 md:h-20 md:w-20 rounded-full ring-2 ${tier?.ring ?? "ring-border/60"} ${tier?.glow ?? ""} bg-gradient-to-br from-card via-card/80 to-background flex items-center justify-center shrink-0`}>
                <span className="text-xl md:text-2xl font-black tracking-tight">
                  {initials(name)}
                </span>
                {isHigh && (
                  <Crown className="absolute -top-1.5 -right-1.5 h-5 w-5 text-yellow-400 drop-shadow" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
                  <span className="h-px w-6 bg-accent/60" />
                  Lead · High Ticket
                </div>
                <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight truncate">
                  {name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {tier && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${tier.badge} border border-current/30`}>
                      Caixa {letter} · {lead?.caixa_label || tier.label}
                    </span>
                  )}
                  {lead?.crm_status && (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-muted/40 text-muted-foreground border border-border/40">
                      {lead.crm_status}
                    </span>
                  )}
                  {lead?.crm_data_agendamento && (
                    <span className="text-[10px] px-2 py-1 rounded bg-accent/10 text-accent border border-accent/30 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {fmtDate(lead.crm_data_agendamento)}
                    </span>
                  )}
                  {scheduledAt && (

                    <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Call: {fmtDate(scheduledAt)}
                    </span>
                  )}

                  {lead?.utm_source && (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-violet-500/10 text-violet-300 border border-violet-500/30">
                      UTM · {lead.utm_source}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Contatos */}
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {lead?.whatsapp && (
                <a href={`https://wa.me/${String(lead.whatsapp).replace(/\D/g, "")}`}
                  target="_blank" rel="noreferrer"
                  className="group flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 px-3 py-2.5 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Phone className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-emerald-400/80">WhatsApp</div>
                    <div className="text-xs font-mono text-emerald-200 truncate">{lead.whatsapp}</div>
                  </div>
                </a>
              )}
              {lead?.email && (
                <a href={`mailto:${lead.email}`}
                  className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 hover:bg-card/70 px-3 py-2.5 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-muted/40 flex items-center justify-center">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">E-mail</div>
                    <div className="text-xs truncate">{lead.email}</div>
                  </div>
                </a>
              )}
              {igHandle && (
                <a href={`https://instagram.com/${igHandle}`}
                  target="_blank" rel="noreferrer"
                  className="group flex items-center gap-2.5 rounded-lg border border-pink-500/30 bg-pink-500/5 hover:bg-pink-500/10 px-3 py-2.5 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-pink-500/20 flex items-center justify-center">
                    <Instagram className="h-3.5 w-3.5 text-pink-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-pink-400/80">Instagram</div>
                    <div className="text-xs text-pink-200 truncate">@{igHandle}</div>
                  </div>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* CONTEÚDO SCROLLÁVEL */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 260px)" }}>
          {onSchedule && (
            <div className="px-6 py-4 border-b border-border/40 bg-emerald-500/5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-emerald-300/90 mr-2">
                  <Calendar className="h-3 w-3" />
                  {scheduledAt ? "Call agendada" : "Agendar Call"}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs bg-background/70 border border-border/60 hover:bg-background h-9 px-3 gap-2 font-normal"
                    >
                      <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                      {selectedDate ? (
                        format(selectedDate, "dd/MM/yyyy 'às' HH:mm")
                      ) : (
                        <span>Escolher data e hora</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 flex flex-col bg-popover border border-border shadow-lg" align="start">
                    <CalPicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => {
                        updateDateTime(d, selectedTime);
                      }}
                      initialFocus
                    />
                    <div className="flex items-center justify-between border-t border-border p-3 bg-muted/20">
                      <span className="text-xs font-medium text-muted-foreground">Horário da call:</span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={selectedTime.split(":")[0]}
                          onChange={(e) => {
                            const newHour = e.target.value;
                            const newMin = selectedTime.split(":")[1];
                            const t = `${newHour}:${newMin}`;
                            setSelectedTime(t);
                            updateDateTime(selectedDate, t);
                          }}
                          className="bg-background text-xs border border-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-accent text-foreground"
                        >
                          {hoursOptions.map((h) => (
                            <option key={h} value={h} className="bg-popover text-foreground">{h}h</option>
                          ))}
                        </select>
                        <span className="text-xs text-muted-foreground">:</span>
                        <select
                          value={selectedTime.split(":")[1]}
                          onChange={(e) => {
                            const newHour = selectedTime.split(":")[0];
                            const newMin = e.target.value;
                            const t = `${newHour}:${newMin}`;
                            setSelectedTime(t);
                            updateDateTime(selectedDate, t);
                          }}
                          className="bg-background text-xs border border-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-accent text-foreground"
                        >
                          {minutesOptions.map((m) => (
                            <option key={m} value={m} className="bg-popover text-foreground">{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <select
                  value={closerDraft}
                  onChange={(e) => setCloserDraft(e.target.value)}
                  className="text-xs bg-background/70 border border-border/60 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-emerald-500/60 min-w-[180px]"
                >
                  <option value="">
                    {closers && closers.length > 0 ? "Selecionar closer…" : "Nenhum closer cadastrado (aba Team)"}
                  </option>
                  {(closers ?? []).map((c) => {
                    const val = c.email || c.nome;
                    const label = c.email ? `${c.nome} — ${c.email}` : c.nome;
                    return (
                      <option key={c.id} value={val}>{label}</option>
                    );
                  })}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none px-2.5 py-1.5 rounded-md bg-background/60 border border-border/60">
                  <input
                    type="checkbox"
                    checked={createMeet}
                    onChange={(e) => setCreateMeet(e.target.checked)}
                    className="rounded border-border bg-background text-sky-400 focus:ring-sky-400 h-3.5 w-3.5"
                  />
                  <span className="flex items-center gap-1 text-[11px] font-medium">
                    <Video className="h-3 w-3 text-sky-400" />
                    Criar Meet
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!schedDraft) return;
                    const iso = new Date(schedDraft).toISOString();
                    onSchedule(iso, closerDraft || null, createMeet);
                  }}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors"
                >
                  {scheduledAt ? "Atualizar" : "Agendar"}
                </button>
                {scheduledAt && (
                  <button
                    type="button"
                    onClick={() => onSchedule(null, null, false)}
                    className="text-[11px] px-3 py-1.5 rounded-md bg-muted/40 text-muted-foreground border border-border/60 hover:text-foreground transition-colors"
                  >
                    Desmarcar
                  </button>
                )}

                <div className="ml-auto text-[10px] text-muted-foreground">
                  Sincroniza automaticamente com o Kanban Closer.
                </div>
              </div>
            </div>
          )}

          {/* Registrar Venda — só pro closer */}
          {role === "closer" && (
            <div className="px-6 py-4 border-b border-border/40 bg-gradient-to-r from-amber-500/[0.06] via-yellow-500/[0.04] to-transparent">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-amber-300/90">
                  <DollarSign className="h-3 w-3" />
                  {Number(lead?.crm_valor || 0) > 0 ? "Venda registrada" : "Fechamento"}
                </div>
                {Number(lead?.crm_valor || 0) > 0 && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono tabular-nums text-amber-200 font-semibold">
                      {Number(lead!.crm_valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                    {Number(lead?.crm_valor_recebido || 0) > 0 && Number(lead?.crm_valor_recebido || 0) < Number(lead?.crm_valor || 0) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                        Sinal · {Number(lead!.crm_valor_recebido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} recebidos · falta {(Number(lead!.crm_valor) - Number(lead!.crm_valor_recebido || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    )}
                    {Number(lead?.crm_valor_recebido || 0) >= Number(lead?.crm_valor || 0) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Quitado
                      </span>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSaleOpen(true)}
                  className="ml-auto text-[11px] font-bold px-3.5 py-2 rounded-md bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 transition-all shadow-[0_0_20px_-6px_rgba(234,179,8,0.6)] hover:shadow-[0_0_28px_-4px_rgba(234,179,8,0.8)] flex items-center gap-1.5"
                >
                  <Handshake className="h-3.5 w-3.5" />
                  {Number(lead?.crm_valor || 0) > 0 ? "Editar venda" : "Registrar venda"}
                </button>
              </div>
            </div>
          )}



          {/* BARRA DE NAVEGAÇÃO DE ABAS */}
          <div className="flex items-center justify-between border-b border-border/40 px-6 py-2.5 bg-card/40 backdrop-blur">
            <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-background/80 border border-border/60">
              <button
                type="button"
                onClick={() => setMainTab("all")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
                  mainTab === "all"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tudo
              </button>
              <button
                type="button"
                onClick={() => setMainTab("notes")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                  mainTab === "notes"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 text-sky-400" />
                Observações SDR / Closer
                {notes.length > 0 && (
                  <span className="ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full bg-sky-500/30 text-sky-200 font-mono font-bold">
                    {notes.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMainTab("quiz")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                  mainTab === "quiz"
                    ? "bg-accent/20 text-accent border border-accent/30 shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Wallet className="h-3.5 w-3.5 text-accent" />
                Respostas do Quiz
                {answers.length > 0 && (
                  <span className="ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full bg-accent/30 text-accent font-mono font-bold">
                    {answers.length}
                  </span>
                )}
              </button>
            </div>
            {mainTab === "all" && (
              <span className="text-[10px] text-muted-foreground hidden sm:inline font-medium">
                💡 Observações aparecem em destaque no topo
              </span>
            )}
          </div>

          <div className={mainTab === "all" ? "grid md:grid-cols-[1.1fr_1fr] gap-0 divide-y md:divide-y-0 md:divide-x divide-border/40" : "p-6"}>

            {/* NOTAS (Primeiro na ordem do DOM para aparecer no topo em telas menores) */}
            {(mainTab === "all" || mainTab === "notes") && (
              <div className="p-6 flex flex-col bg-card/20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-sky-300 font-bold">
                    <MessageSquare className="h-3.5 w-3.5 text-sky-400" />
                    Observações SDR ↔ Closer
                  </div>
                  <div className="flex items-center gap-1 p-0.5 rounded-md bg-background/60 border border-border/50">
                    {(["all", "sdr", "closer"] as const).map((f) => (
                      <button key={f} onClick={() => setFilter(f)}
                        className={`text-[10px] px-2 py-1 rounded uppercase tracking-wider transition-colors ${
                          filter === f
                            ? f === "sdr" ? "bg-sky-500/20 text-sky-300"
                            : f === "closer" ? "bg-violet-500/20 text-violet-300"
                            : "bg-accent/20 text-accent"
                            : "text-muted-foreground hover:text-foreground"
                        }`}>
                        {f === "all" ? `Todas ${notes.length}` : f === "sdr" ? `SDR ${sdrCount}` : `Closer ${closerCount}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Composer no TOPO das observações para acesso instantâneo */}
                <div className="mb-4 pb-4 border-b border-border/40 bg-card/40 p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      role === "closer" ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    }`}>
                      Você é {role.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">· {authorName}</span>
                  </div>
                  <div className="relative">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addNote();
                      }}
                      placeholder={
                        role === "sdr"
                          ? "Escreva contexto pro Closer: interesse, timing, objeções…"
                          : "Escreva notas do Closer: status da call, follow-up, sinal…"
                      }
                      rows={3}
                      className="text-sm resize-none pr-12 bg-background/80 border-border/60 focus:border-accent/60"
                    />
                    <Button
                      size="icon"
                      onClick={addNote}
                      disabled={!draft.trim() || saving}
                      className="absolute bottom-2 right-2 h-8 w-8 bg-sky-500 hover:bg-sky-400 text-black font-bold"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1.5 text-right font-mono">
                    ⌘ + Enter para enviar
                  </div>
                </div>

                {/* Lista de notas */}
                <div className="flex-1 space-y-2 min-h-[140px] max-h-[340px] overflow-y-auto pr-1">
                  {loading ? (
                    <div className="text-xs text-muted-foreground py-4 text-center">Carregando observações…</div>
                  ) : filteredNotes.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border/40 rounded-lg">
                      Nenhuma observação {filter !== "all" ? `do ${filter.toUpperCase()}` : "registrada ainda"}.
                    </div>
                  ) : (
                    filteredNotes.map((n) => {
                      const isCloser = n.role === "closer";
                      return (
                        <div key={n.id}
                          className={`group relative rounded-lg border p-3 pl-3.5 ${
                            isCloser
                              ? "border-violet-500/30 bg-violet-500/[0.08]"
                              : "border-sky-500/30 bg-sky-500/[0.08]"
                          }`}>
                          <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${isCloser ? "bg-violet-500" : "bg-sky-500"}`} />
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase ${
                                isCloser ? "bg-violet-500/25 text-violet-200" : "bg-sky-500/25 text-sky-200"
                              }`}>
                                {n.role}
                              </span>
                              <span className="text-[11px] font-semibold truncate">{n.author || "—"}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">· {fmtDate(n.created_at)}</span>
                            </div>
                            <button onClick={() => deleteNote(n.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity shrink-0"
                              title="Apagar">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90 font-sans">{n.body}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* QUIZ */}
            {(mainTab === "all" || mainTab === "quiz") && (
              <div className="p-6 space-y-3">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">
                  <span className="h-px w-6 bg-accent/60" />
                  Respostas do Quiz ({answers.length})
                </div>
                {answers.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-4">Sem respostas registradas.</div>
                ) : (
                  <div className="space-y-2">
                    {answers.map((a) => {
                      const Icon = QUIZ_ICONS[a.key] || Wallet;
                      return (
                        <div key={a.key}
                          className="group rounded-lg border border-border/50 bg-card/30 hover:bg-card/60 hover:border-accent/40 transition-colors p-3">
                          <div className="flex items-start gap-2.5">
                            <div className="h-7 w-7 shrink-0 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                              <Icon className="h-3.5 w-3.5 text-accent" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
                                {a.label}
                              </div>
                              <div className="text-sm font-medium mt-0.5 leading-snug">{a.value}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Informações do Anúncio */}
                {lead?.utm_source && (
                  <div className="pt-4 border-t border-border/40 mt-4 space-y-3">
                    <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                      <Megaphone className="h-3 w-3" />
                      Origem do Anúncio
                    </div>
                    {loadingAds ? (
                      <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                        Buscando criativo correspondente...
                      </div>
                    ) : matchedAd ? (
                      <div className="rounded-lg border border-border/50 bg-card/30 p-3.5 space-y-3">
                        {matchedAd.thumbnail && (
                          <div className="relative aspect-video w-full rounded-md overflow-hidden border border-border/30 bg-muted/40">
                            <img
                              src={matchedAd.thumbnail}
                              alt="Visualização do Anúncio"
                              className="object-cover w-full h-full"
                            />
                          </div>
                        )}
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">Campanha</span>
                            <span className="font-semibold text-foreground">{matchedAd.campaignName || "—"}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">Conjunto de Anúncios</span>
                            <span className="font-semibold text-foreground">{matchedAd.adsetName || "—"}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">Anúncio</span>
                            <span className="font-semibold text-accent">{matchedAd.name || "—"}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-muted/10 border border-border/30 rounded-lg p-3 text-xs space-y-2">
                        <p className="text-muted-foreground italic">Nenhum criativo associado pôde ser localizado automaticamente no Meta Ads.</p>
                        <div className="text-[10px] space-y-1 font-mono text-muted-foreground bg-black/20 p-2 rounded">
                          <div>Source: {lead.utm_source || "—"}</div>
                          <div>Campaign: {(lead as any).utm_campaign || "—"}</div>
                          <div>Content: {(lead as any).utm_content || "—"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Dialog aninhado: Registrar Venda */}
      <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
        <DialogContent className="max-w-md border-border/60 bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black tracking-tight">
              <Handshake className="h-5 w-5 text-amber-400" />
              Registrar Venda
            </DialogTitle>
            <div className="text-xs text-muted-foreground truncate">
              {lead?.nome || "Lead"}
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Tipo — cards grandes */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSaleType("direta")}
                className={`relative rounded-lg border p-3 text-left transition-all ${
                  saleType === "direta"
                    ? "border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_25px_-8px_rgba(16,185,129,0.55)]"
                    : "border-border/60 bg-card/40 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300 font-bold">
                  <CheckCircle2 className="h-3 w-3" /> Venda Direta
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  100% pago. Vai direto pro Dashboard.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSaleType("sinal")}
                className={`relative rounded-lg border p-3 text-left transition-all ${
                  saleType === "sinal"
                    ? "border-violet-500/60 bg-violet-500/10 shadow-[0_0_25px_-8px_rgba(139,92,246,0.55)]"
                    : "border-border/60 bg-card/40 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-violet-300 font-bold">
                  <Wallet className="h-3 w-3" /> Sinal
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  Pagamento parcial. Vai pra Contas a Receber.
                </div>
              </button>
            </div>

            {/* Valor total */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Valor total da venda (R$)
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="Ex: 15000"
                value={valorTotal}
                onChange={(e) => setValorTotal(e.target.value)}
                className="text-lg font-mono tabular-nums h-11"
                autoFocus
              />
            </div>

            {/* Se sinal: valor recebido + data restante */}
            {saleType === "sinal" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-violet-300">
                    Sinal recebido (R$)
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="Ex: 800"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(e.target.value)}
                    className="text-sm font-mono tabular-nums h-10 border-violet-500/40 focus:border-violet-500/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Restante em
                  </Label>
                  <Input
                    type="date"
                    value={dataRestante}
                    onChange={(e) => setDataRestante(e.target.value)}
                    className="text-sm h-10"
                  />
                </div>
              </div>
            )}

            {/* Preview */}
            {Number(valorTotal) > 0 && (
              <div className="rounded-md border border-border/50 bg-card/30 px-3 py-2 text-[11px] font-mono tabular-nums text-muted-foreground space-y-0.5">
                <div className="flex justify-between">
                  <span>Total</span>
                  <span className="text-foreground font-semibold">
                    {Number(valorTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
                {saleType === "sinal" && Number(valorRecebido) > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span>Sinal</span>
                      <span className="text-emerald-300">
                        {Number(valorRecebido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Falta</span>
                      <span className="text-amber-300">
                        {Math.max(0, Number(valorTotal) - Number(valorRecebido)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSaleOpen(false)} disabled={savingSale}>
              Cancelar
            </Button>
            <Button
              onClick={saveSale}
              disabled={savingSale || !valorTotal}
              className="bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 font-bold"
            >
              {savingSale ? "Salvando…" : saleType === "direta" ? "Confirmar venda" : "Registrar sinal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

