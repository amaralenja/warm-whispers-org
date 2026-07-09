import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getVendorSession } from "@/lib/vendor-session";
import { MessageSquare, Trash2, User as UserIcon, Phone, Mail, Instagram } from "lucide-react";

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

export function HtLeadDetailDialog({
  lead,
  role,
  open,
  onOpenChange,
}: {
  lead: LeadLike | null;
  role: Role;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const authorName = useMemo(() => {
    try {
      const s = getVendorSession() as any;
      return s?.nome || s?.codigo || "Admin";
    } catch {
      return "Admin";
    }
  }, []);

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
    return () => {
      cancelled = true;
    };
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

  const answers: { label: string; value?: string | null }[] = lead
    ? [
        { label: "Caixa disponível", value: lead.caixa_label ?? lead.caixa_letra },
        { label: "Faturamento atual", value: lead.faturamento },
        { label: "Momento", value: lead.momento },
        { label: "Objetivo", value: lead.objetivo },
        { label: "Já investiu / tentou SaaS?", value: lead.investir },
        { label: "Tem ideia de SaaS?", value: lead.minicurso },
        { label: "Sócio/Cônjuge", value: lead.socio },
        { label: "Comprometimento", value: lead.comprometimento },
      ].filter((x) => x.value)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-accent" />
            {lead?.nome || "Sem nome"}
            {lead?.caixa_letra && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">
                Caixa {lead.caixa_letra}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-2">
          {/* Contatos */}
          <div className="flex flex-wrap gap-3 text-xs">
            {lead?.whatsapp && (
              <a
                href={`https://wa.me/${String(lead.whatsapp).replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              >
                <Phone className="h-3 w-3" />
                {lead.whatsapp}
              </a>
            )}
            {lead?.email && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted/40 text-muted-foreground">
                <Mail className="h-3 w-3" /> {lead.email}
              </span>
            )}
            {lead?.instagram && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted/40 text-muted-foreground">
                <Instagram className="h-3 w-3" /> {lead.instagram}
              </span>
            )}
            {lead?.utm_source && (
              <span className="px-2.5 py-1 rounded bg-accent/10 text-accent border border-accent/20 text-[11px]">
                UTM: {lead.utm_source}
                {lead.utm_campaign ? ` · ${lead.utm_campaign}` : ""}
              </span>
            )}
          </div>

          {/* Respostas do quiz */}
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Respostas do Quiz
            </h3>
            {answers.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">Sem respostas registradas.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {answers.map((a, i) => (
                  <div key={i} className="rounded-md border border-border/50 bg-card/40 p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.label}
                    </div>
                    <div className="text-xs font-medium mt-0.5">{a.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" /> Observações (SDR ↔ Closer)
            </h3>
            {loading ? (
              <div className="text-xs text-muted-foreground">Carregando…</div>
            ) : notes.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2">
                Nenhuma observação ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-md border p-2.5 ${
                      n.role === "closer"
                        ? "border-violet-500/30 bg-violet-500/5"
                        : "border-sky-500/30 bg-sky-500/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase ${
                            n.role === "closer"
                              ? "bg-violet-500/20 text-violet-300"
                              : "bg-sky-500/20 text-sky-300"
                          }`}
                        >
                          {n.role}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {n.author || "—"} ·{" "}
                          {new Date(n.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteNote(n.id)}
                        className="text-muted-foreground hover:text-red-400 opacity-60 hover:opacity-100"
                        title="Apagar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{n.body}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  role === "sdr"
                    ? "Nota do SDR para o Closer…"
                    : "Nota do Closer sobre o lead…"
                }
                rows={3}
                className="text-sm"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={addNote}
                  disabled={!draft.trim() || saving}
                >
                  {saving ? "Salvando…" : `Adicionar como ${role.toUpperCase()}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
