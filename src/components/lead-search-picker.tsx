import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Search, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const QUIZ_SUPABASE_URL = "https://fmtnqipflglucvtdqehh.supabase.co";
const QUIZ_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdG5xaXBmbGdsdWN2dGRxZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjEwNjQsImV4cCI6MjA5Mjc5NzA2NH0.hO2di_bqlYyjTlmMiyJStq95UssFBNpIb6eOYvym5cs";

let _quizSb: ReturnType<typeof createClient> | null = null;
function getQuizSb() {
  if (!_quizSb) {
    _quizSb = createClient(QUIZ_SUPABASE_URL, QUIZ_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _quizSb;
}

export type PickedLead = {
  id: string;
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
};

type LeadSearchPickerProps = {
  onPick?: (lead: PickedLead) => void;
  triggerLabel?: string;
};

function toStr(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}
function sanitizeLead(l: any): PickedLead {
  return {
    id: String(l?.id ?? ""),
    nome: toStr(l?.nome),
    email: toStr(l?.email),
    whatsapp: toStr(l?.whatsapp),
  };
}

export function LeadSearchPicker({
  onPick,
  triggerLabel = "Buscar lead",
}: LeadSearchPickerProps = {}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedLead[]>([]);
  const [loading, setLoading] = useState(false);

  async function doSearch() {
    const t = query.trim();
    if (!t) return;
    setLoading(true);
    try {
      const isEmail = t.includes("@");
      let q = getQuizSb()
        .from("leads")
        .select("id,nome,email,whatsapp")
        .order("data_criacao", { ascending: false })
        .limit(30);
      if (isEmail) q = q.ilike("email", `%${t}%`);
      else q = q.or(`nome.ilike.%${t}%,whatsapp.ilike.%${t}%,email.ilike.%${t}%`);
      const { data, error } = await q;
      if (error) throw error;
      setResults(((data ?? []) as any[]).map(sanitizeLead));
    } catch (e: any) {
      toast.error("Erro ao buscar: " + (toStr(e?.message) || toStr(e) || "erro interno"));
    } finally {
      setLoading(false);
    }
  }

  function pick(l: PickedLead) {
    onPick?.(l);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-1" /> {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buscar lead no Quiz</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Nome, e-mail ou WhatsApp..."
              autoFocus
            />
            <Button type="button" onClick={doSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <div className="max-h-[400px] overflow-y-auto space-y-1 mt-2">
            {results.length === 0 && !loading ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Digite e busque para encontrar leads.
              </p>
            ) : null}
            {results.map((l) => (
              <button
                type="button"
                key={l.id}
                onClick={() => pick(l)}
                className="w-full text-left p-2 rounded-md border border-border hover:bg-accent/10 hover:border-accent transition"
              >
                <div className="font-medium text-sm">{l.nome || "(sem nome)"}</div>
                <div className="text-xs text-muted-foreground">
                  {l.email || "—"} {l.whatsapp ? `• ${l.whatsapp}` : ""}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
