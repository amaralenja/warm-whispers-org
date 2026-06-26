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

  // Auto-pré-carrega link salvo e busca por email do convidado
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    const saved = getEventLink(eventId);
    const initial = saved?.email || defaultEmail || defaultName || "";
    setQuery(initial);
    if (initial) doSearch(initial);
  }, [open, eventId, defaultEmail, defaultName]);

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
      // auto-pick se exato
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
      if (!selected) throw new Error("Selecione um lead");
      const [firstName, ...rest] = (selected.nome ?? "").trim().split(/\s+/);
      const lastName = rest.join(" ");
      return send({
        data: {
          eventName: "ShowUp",
          email: selected.email ?? "",
          phone: selected.whatsapp ?? undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          externalId: selected.id,
          fbp: selected.fbp ?? undefined,
          fbc: selected.fbc ?? undefined,
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
    if (!selected) return 0;
    let s = 10;
    if (selected.email) s += 28;
    if (selected.whatsapp) s += 28;
    if (selected.nome) s += 12;
    if (selected.fbp) s += 8;
    if (selected.fbc) s += 8;
    return Math.min(100, s);
  }, [selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Disparar ShowUp pro Facebook
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
              placeholder="Buscar lead no Quiz por email, nome ou whatsapp…"
              className="pl-8"
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

          <div className="max-h-64 overflow-auto rounded-md border border-border">
            {results.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {searching ? "Buscando…" : "Nenhum lead encontrado. Digite e busque."}
              </p>
            ) : (
              results.map((r) => {
                const sel = selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={`flex w-full items-center gap-3 border-b border-border p-3 text-left transition hover:bg-muted/40 ${
                      sel ? "bg-accent/15" : ""
                    }`}
                  >
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
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
                      {r.utm_source && <Badge variant="outline" className="text-[10px]">{r.utm_source}</Badge>}
                      {r.caixa_letra && <Badge className="text-[10px]">{r.caixa_letra}</Badge>}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selected && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">Pronto pra disparar: {selected.nome}</p>
                <Badge className="bg-emerald-500/20 text-emerald-300">Match {matchScore}/100</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Email, telefone, fbp e fbc serão enviados pro Pixel/CAPI vinculando a campanha de origem.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!selected || mutation.isPending}
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
