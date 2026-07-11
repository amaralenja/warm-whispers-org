import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getVendorSession } from "@/lib/vendor-session";
import {
  MessageSquare, Trash2, Phone, Mail, Instagram, Send,
  Wallet, TrendingUp, Target, Rocket, Lightbulb, Users, Flame,
  Calendar, X, Crown, DollarSign, Handshake, CheckCircle2,
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
}: {
  lead: LeadLike | null;
  role: Role;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scheduledAt?: string | null;
  onSchedule?: (iso: string | null) => void;
  onSaleSaved?: () => void;
}) {

  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "sdr" | "closer">("all");

  const [schedDraft, setSchedDraft] = useState<string>("");

  // Registro de venda
  const [saleOpen, setSaleOpen] = useState(false);
  const [saleType, setSaleType] = useState<"direta" | "sinal">("direta");
  const [valorTotal, setValorTotal] = useState<string>("");
  const [valorRecebido, setValorRecebido] = useState<string>("");
  const [dataRestante, setDataRestante] = useState<string>("");
  const [savingSale, setSavingSale] = useState(false);

  useEffect(() => {
    if (scheduledAt) {
      const d = new Date(scheduledAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      setSchedDraft(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setSchedDraft("");
    }
  }, [scheduledAt, open]);

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
    setSavingSale(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success(saleType === "direta" ? "Venda registrada 🚀" : "Sinal registrado 💰");
    setSaleOpen(false);
    onSaleSaved?.();
    onOpenChange(false);
  }



  const authorName = useMemo(() => {
    try {
      const s = getVendorSession() as any;
      return s?.nome || s?.codigo || (role === "sdr" ? "SDR" : "Closer");
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
    }
  }

  async function deleteNote(id: string) {
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== id));
    const { error } = await supabase.from("ht_lead_notes" as any).delete().eq("id", id);
    if (error) setNotes(prev);
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
  const caixaValue = lead
    ? ([safeStr(lead.caixa_label), letter ? `Faixa ${letter}` : null].filter(Boolean).join(" · ") || null)
    : null;
  const answers: { key: string; label: string; value?: string | null }[] = lead
    ? [
        { key: "caixa", label: "Caixa disponível", value: caixaValue },
        { key: "faturamento", label: "Faturamento atual", value: safeStr(lead.faturamento) },
        { key: "momento", label: "Momento atual", value: safeStr(lead.momento) },
        { key: "objetivo", label: "Meta / Objetivo", value: safeStr(lead.objetivo) },
        { key: "investir", label: "Já investiu em SaaS?", value: safeStr(lead.investir) },
        { key: "minicurso", label: "Tem ideia de SaaS?", value: safeStr(lead.minicurso) },
        { key: "socio", label: "Sócio / Cônjuge", value: safeStr(lead.socio) },
        { key: "comprometimento", label: "Comprometimento", value: safeStr(lead.comprometimento) },
      ].filter((x) => x.value)
    : [];

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
                <input
                  type="datetime-local"
                  value={schedDraft}
                  onChange={(e) => setSchedDraft(e.target.value)}
                  className="text-xs bg-background/70 border border-border/60 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-emerald-500/60"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!schedDraft) return;
                    const iso = new Date(schedDraft).toISOString();
                    onSchedule(iso);
                  }}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors"
                >
                  {scheduledAt ? "Atualizar" : "Agendar"}
                </button>
                {scheduledAt && (
                  <button
                    type="button"
                    onClick={() => onSchedule(null)}
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

          <div className="grid md:grid-cols-[1fr_1.1fr] gap-0 divide-y md:divide-y-0 md:divide-x divide-border/40">

            {/* QUIZ */}
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">
                <span className="h-px w-6 bg-accent/60" />
                Respostas do Quiz
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
            </div>

            {/* NOTAS */}
            <div className="p-6 flex flex-col bg-card/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  Observações
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

              <div className="flex-1 space-y-2 min-h-[120px] max-h-[280px] overflow-y-auto pr-1">
                {loading ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">Carregando…</div>
                ) : filteredNotes.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border/40 rounded-lg">
                    Nenhuma observação {filter !== "all" ? `do ${filter.toUpperCase()}` : "ainda"}.
                  </div>
                ) : (
                  filteredNotes.map((n) => {
                    const isCloser = n.role === "closer";
                    return (
                      <div key={n.id}
                        className={`group relative rounded-lg border p-2.5 pl-3 ${
                          isCloser
                            ? "border-violet-500/30 bg-violet-500/[0.06]"
                            : "border-sky-500/30 bg-sky-500/[0.06]"
                        }`}>
                        <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg ${isCloser ? "bg-violet-500/60" : "bg-sky-500/60"}`} />
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase ${
                              isCloser ? "bg-violet-500/20 text-violet-300" : "bg-sky-500/20 text-sky-300"
                            }`}>
                              {n.role}
                            </span>
                            <span className="text-[10px] font-medium truncate">{n.author || "—"}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">· {fmtDate(n.created_at)}</span>
                          </div>
                          <button onClick={() => deleteNote(n.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity shrink-0"
                            title="Apagar">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="text-sm leading-snug whitespace-pre-wrap">{n.body}</div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Composer */}
              <div className="mt-3 pt-3 border-t border-border/40">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    role === "closer" ? "bg-violet-500/20 text-violet-300" : "bg-sky-500/20 text-sky-300"
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
                        ? "Contexto pro Closer: interesse, timing, objeções…"
                        : "Notas do Closer: status da call, follow-up, sinal…"
                    }
                    rows={3}
                    className="text-sm resize-none pr-12 bg-background/60 border-border/60 focus:border-accent/60"
                  />
                  <Button
                    size="icon"
                    onClick={addNote}
                    disabled={!draft.trim() || saving}
                    className="absolute bottom-2 right-2 h-8 w-8"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1.5 text-right">
                  ⌘ + Enter para enviar
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
