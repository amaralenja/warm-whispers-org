import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Zap, CheckCircle2, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sendMetaEvent } from "@/lib/meta-ads.functions";

// ---- Quiz Supabase (external, somente leitura) ----
const QUIZ_SUPABASE_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";

const quizSb = createClient(QUIZ_SUPABASE_URL, QUIZ_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type QuizLead = {
  id: string;
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
  fbc: string | null;
  fbp: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  caixa_letra: string | null;
};

type LinkRecord = { eventId: string; leadId: string; nome?: string; email?: string };
const LINK_KEY = "calendar_quiz_links_v1";

function loadLinks(): Record<string, LinkRecord> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LINK_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveEventLink(eventId: string, lead: QuizLead) {
  const all = loadLinks();
  all[eventId] = { eventId, leadId: lead.id, nome: lead.nome ?? "", email: lead.email ?? "" };
  localStorage.setItem(LINK_KEY, JSON.stringify(all));
}

export function getEventLink(eventId: string): LinkRecord | undefined {
  return loadLinks()[eventId];
}

export function getAllEventLinks(): Record<string, LinkRecord> {
  return loadLinks();
}

// ---- NoShow marker (localStorage) ----
const NOSHOW_KEY = "calendar_noshow_v1";

function loadNoShows(): Record<string, { eventId: string; markedAt: string }> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(NOSHOW_KEY) || "{}");
  } catch {
    return {};
  }
}

export function markNoShow(eventId: string) {
  const all = loadNoShows();
  all[eventId] = { eventId, markedAt: new Date().toISOString() };
  localStorage.setItem(NOSHOW_KEY, JSON.stringify(all));
}

export function unmarkNoShow(eventId: string) {
  const all = loadNoShows();
  delete all[eventId];
  localStorage.setItem(NOSHOW_KEY, JSON.stringify(all));
}

export function getNoShow(eventId: string): boolean {
  return !!loadNoShows()[eventId];
}

export function getAllNoShows(): Record<string, { eventId: string; markedAt: string }> {
  return loadNoShows();
}

// ---- Rescheduled marker (localStorage) ----
const RESCHEDULED_KEY = "calendar_rescheduled_v1";

function loadRescheduled(): Record<string, { eventId: string; markedAt: string }> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(RESCHEDULED_KEY) || "{}");
  } catch {
    return {};
  }
}

export function markRescheduled(eventId: string) {
  const all = loadRescheduled();
  all[eventId] = { eventId, markedAt: new Date().toISOString() };
  localStorage.setItem(RESCHEDULED_KEY, JSON.stringify(all));
}

export function unmarkRescheduled(eventId: string) {
  const all = loadRescheduled();
  delete all[eventId];
  localStorage.setItem(RESCHEDULED_KEY, JSON.stringify(all));
}

export function getRescheduled(eventId: string): boolean {
  return !!loadRescheduled()[eventId];
}

export function getAllRescheduled(): Record<string, { eventId: string; markedAt: string }> {
  return loadRescheduled();
}


export function ShowUpDialog({
  open,
  onOpenChange,
  eventId,
  defaultEmail,
  defaultName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  defaultEmail?: string;
  defaultName?: string;
}) {
  const send = useServerFn(sendMetaEvent);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuizLead[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<QuizLead | null>(null);

  // Form editável — usado no disparo
  const [form, setForm] = useState({
    nome: "",
    email: "",
    whatsapp: "",
    fbp: "",
    fbc: "",
    externalId: "",
  });

  // Auto-pré-carrega link salvo e busca por email do convidado
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setResults([]);
    setForm({
      nome: defaultName || "",
      email: defaultEmail || "",
      whatsapp: "",
      fbp: "",
      fbc: "",
      externalId: "",
    });
    const saved = getEventLink(eventId);
    const initial = saved?.email || defaultEmail || defaultName || "";
    setQuery(initial);
    if (initial) doSearch(initial);
  }, [open, eventId, defaultEmail, defaultName]);

  // Quando seleciona um lead, popula o form
  useEffect(() => {
    if (!selected) return;
    setForm({
      nome: selected.nome ?? "",
      email: selected.email ?? "",
      whatsapp: selected.whatsapp ?? "",
      fbp: selected.fbp ?? "",
      fbc: selected.fbc ?? "",
      externalId: selected.id,
    });
  }, [selected]);

  async function doSearch(term: string) {
    const t = term.trim();
    if (!t) return setResults([]);
    setSearching(true);
    try {
      const isEmail = t.includes("@");
      let q = quizSb
        .from("leads")
        .select("id,nome,email,whatsapp,fbc,fbp,fbclid,utm_source,utm_campaign,caixa_letra")
        .order("data_criacao", { ascending: false })
        .limit(20);
      if (isEmail) q = q.ilike("email", `%${t}%`);
      else q = q.or(`nome.ilike.%${t}%,whatsapp.ilike.%${t}%,email.ilike.%${t}%`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as QuizLead[];
      setResults(rows);
      const exact = rows.find((r) => (r.email ?? "").toLowerCase() === t.toLowerCase());
      if (exact && !selected) setSelected(exact);
    } catch (e: any) {
      toast.error("Erro ao buscar leads: " + e.message);
    } finally {
      setSearching(false);
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.email && !form.whatsapp) {
        throw new Error("Informe pelo menos email ou whatsapp");
      }
      const [firstName, ...rest] = form.nome.trim().split(/\s+/);
      const lastName = rest.join(" ");
      return send({
        data: {
          eventName: "ShowUp",
          email: form.email,
          phone: form.whatsapp || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          externalId: form.externalId || form.email || undefined,
          fbp: form.fbp || undefined,
          fbc: form.fbc || undefined,
        },
      });
    },
    onSuccess: () => {
      if (selected) saveEventLink(eventId, selected);
      toast.success("ShowUp enviado pro Facebook! 🚀");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao enviar"),
  });

  const matchScore = useMemo(() => {
    let s = 10;
    if (form.email) s += 25;
    if (form.whatsapp) s += 22;
    if (form.nome) s += 10;
    if (form.fbp) s += 15;
    if (form.fbc) s += 18;
    return Math.min(100, s);
  }, [form]);

  const scoreColor =
    matchScore >= 80 ? "bg-emerald-500/20 text-emerald-300"
    : matchScore >= 50 ? "bg-amber-500/20 text-amber-300"
    : "bg-rose-500/20 text-rose-300";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Conferir dados e disparar ShowUp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Busca de lead */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              1. Buscar lead no Quiz (opcional)
            </p>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
                placeholder="Email, nome ou whatsapp…"
                className="pl-8 pr-20"
              />
              <Button
                size="sm"
                variant="outline"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
                onClick={() => doSearch(query)}
                disabled={searching}
              >
                {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Buscar"}
              </Button>
            </div>

            {results.length > 0 && (
              <div className="mt-2 max-h-48 overflow-auto rounded-md border border-border">
                {results.map((r) => {
                  const sel = selected?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className={`flex w-full items-center gap-3 border-b border-border p-2.5 text-left transition hover:bg-muted/40 ${
                        sel ? "bg-accent/15" : ""
                      }`}
                    >
                      <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
                        {sel ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <User className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.nome || "(sem nome)"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.email || "—"} {r.whatsapp ? `· ${r.whatsapp}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {r.fbp && <Badge variant="outline" className="text-[10px]">fbp</Badge>}
                        {r.fbc && <Badge variant="outline" className="text-[10px]">fbc</Badge>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Form editável */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Confira e edite os dados antes de enviar
              </p>
              <Badge className={scoreColor}>Match {matchScore}/100</Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome completo</label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="João da Silva"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email *</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="joao@email.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">WhatsApp / Telefone</label>
                <Input
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder="+55 11 99999-9999"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">External ID</label>
                <Input
                  value={form.externalId}
                  onChange={(e) => setForm({ ...form, externalId: e.target.value })}
                  placeholder="ID do lead (auto)"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  FBP (cookie _fbp) — deixa vazio se não tiver
                </label>
                <Input
                  value={form.fbp}
                  onChange={(e) => setForm({ ...form, fbp: e.target.value })}
                  placeholder="fb.1.1234567890.0987654321"
                  className="font-mono text-xs"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  FBC (cookie _fbc / fbclid) — deixa vazio se não tiver
                </label>
                <Input
                  value={form.fbc}
                  onChange={(e) => setForm({ ...form, fbc: e.target.value })}
                  placeholder="fb.1.1234567890.IwAR..."
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              💡 Quanto mais campos preenchidos (principalmente FBP/FBC), maior a nota de qualidade
              do evento no Facebook e melhor a atribuição da campanha.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={(!form.email && !form.whatsapp) || mutation.isPending}
            className="bg-amber-500 text-black hover:bg-amber-400"
          >
            {mutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…</>
            ) : (
              <><Zap className="mr-2 h-4 w-4" /> Disparar ShowUp</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

