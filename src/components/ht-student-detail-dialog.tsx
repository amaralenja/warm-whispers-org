import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AtSign,
  Calendar,
  CalendarDays,
  ExternalLink,
  FileText,
  Fingerprint,
  Hash,
  Link2,
  MapPin,
  Phone,
  Plus,
  Save,
  Smartphone,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIAS,
  FASES,
  type Categoria,
  type Fase,
  type HTCustomerSuccess,
  type HTCustomerSuccessCall,
  deleteCustomerSuccessCall,
  listCustomerSuccessCalls,
  upsertCustomerSuccess,
  upsertCustomerSuccessCall,
} from "@/lib/ht-customer-success.functions";

const FASE_LABEL: Record<Fase, { label: string; dot: string; bg: string }> = {
  espionagem: { label: "Fase 1: Espionagem", dot: "bg-rose-400", bg: "bg-rose-500/10 text-rose-300" },
  modelagem: { label: "Fase 2: Modelagem", dot: "bg-amber-400", bg: "bg-amber-500/10 text-amber-300" },
  construcao: { label: "Fase 3: Construção", dot: "bg-sky-400", bg: "bg-sky-500/10 text-sky-300" },
  concluido: { label: "Concluído", dot: "bg-emerald-400", bg: "bg-emerald-500/10 text-emerald-300" },
};

const CATEGORIA_LABEL: Record<Categoria, string> = {
  x1: "Alunos X1",
  grupo: "Mentoria em Grupo",
  individual: "Mentoria Individual",
};

function toDateInput(v: string | null) {
  return v ? v.slice(0, 10) : "";
}
function toDateTimeInput(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}
function fmtDateTime(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function StudentDetailDialog({
  open,
  student,
  defaultCategoria,
  onClose,
}: {
  open: boolean;
  student: HTCustomerSuccess | null;
  defaultCategoria: Categoria | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertCustomerSuccess);
  const listCallsFn = useServerFn(listCustomerSuccessCalls);
  const upsertCallFn = useServerFn(upsertCustomerSuccessCall);
  const deleteCallFn = useServerFn(deleteCustomerSuccessCall);

  const [form, setForm] = useState({
    aluno_nome: "",
    categoria: "x1" as Categoria,
    fase: "espionagem" as Fase,
    entrada_mentoria: "",
    ultima_call: "",
    whatsapp_privado: "",
    grupo_whatsapp_link: "",
    cpf: "",
    data_nascimento: "",
    endereco: "",
    celular: "",
    email: "",
    formulario_integracao_url: "",
    observacoes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      aluno_nome: student?.aluno_nome ?? "",
      categoria: (student?.categoria as Categoria) ?? defaultCategoria ?? "x1",
      fase: (student?.fase as Fase) ?? "espionagem",
      entrada_mentoria: toDateInput(student?.entrada_mentoria ?? null),
      ultima_call: toDateTimeInput(student?.ultima_call ?? null),
      whatsapp_privado: student?.whatsapp_privado ?? "",
      grupo_whatsapp_link: student?.grupo_whatsapp_link ?? "",
      cpf: student?.cpf ?? "",
      data_nascimento: toDateInput(student?.data_nascimento ?? null),
      endereco: student?.endereco ?? "",
      celular: student?.celular ?? "",
      email: student?.email ?? "",
      formulario_integracao_url: student?.formulario_integracao_url ?? "",
      observacoes: student?.observacoes ?? "",
    });
  }, [open, student, defaultCategoria]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: student?.id ?? null,
          aluno_nome: form.aluno_nome,
          categoria: form.categoria,
          fase: form.fase,
          entrada_mentoria: form.entrada_mentoria || null,
          ultima_call: form.ultima_call ? new Date(form.ultima_call).toISOString() : null,
          whatsapp_privado: form.whatsapp_privado || null,
          grupo_whatsapp_link: form.grupo_whatsapp_link || null,
          cpf: form.cpf || null,
          data_nascimento: form.data_nascimento || null,
          endereco: form.endereco || null,
          celular: form.celular || null,
          email: form.email || null,
          formulario_integracao_url: form.formulario_integracao_url || null,
          observacoes: form.observacoes || null,
        },
      }),
    onSuccess: () => {
      toast.success(student ? "Aluno atualizado" : "Aluno criado");
      qc.invalidateQueries({ queryKey: ["ht-customer-success"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  // Calls
  const callsQ = useQuery({
    queryKey: ["ht-cs-calls", student?.id],
    enabled: !!student?.id && open,
    queryFn: () => listCallsFn({ data: { aluno_id: student!.id } }),
  });
  const calls = callsQ.data ?? [];

  const upsertCallMut = useMutation({
    mutationFn: (vars: Partial<HTCustomerSuccessCall> & { aluno_id: string }) =>
      upsertCallFn({ data: vars as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ht-cs-calls", student?.id] }),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar call"),
  });

  const deleteCallMut = useMutation({
    mutationFn: (id: string) => deleteCallFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ht-cs-calls", student?.id] }),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover call"),
  });

  const faseMeta = FASE_LABEL[form.fase];
  const whatsappHref = useMemo(() => {
    const d = (form.whatsapp_privado || "").replace(/\D+/g, "");
    return d ? `https://wa.me/${d}` : null;
  }, [form.whatsapp_privado]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-0">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Sucesso do Cliente</span>
            <span>/</span>
            <span>{CATEGORIA_LABEL[form.categoria]}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.aluno_nome.trim()}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saveMut.isPending ? "Salvando…" : "Salvar"}
            </Button>
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-8 py-6">
          {/* Title */}
          <input
            value={form.aluno_nome}
            onChange={(e) => setForm({ ...form, aluno_nome: e.target.value })}
            placeholder="Nome do aluno"
            maxLength={160}
            className="w-full border-none bg-transparent text-3xl font-extrabold outline-none placeholder:text-muted-foreground/40 md:text-4xl"
          />

          {/* Properties */}
          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Propriedades
            </div>
            <div className="space-y-1.5">
              <PropRow icon={CalendarDays} label="Entrada na Mentoria">
                <Input
                  type="date"
                  value={form.entrada_mentoria}
                  onChange={(e) => setForm({ ...form, entrada_mentoria: e.target.value })}
                  className="h-8 border-none bg-transparent px-2 hover:bg-muted/50 focus-visible:bg-muted"
                />
              </PropRow>
              <PropRow icon={Link2} label="Grupo WhatsApp">
                <div className="flex w-full items-center gap-2">
                  <Input
                    value={form.grupo_whatsapp_link}
                    onChange={(e) => setForm({ ...form, grupo_whatsapp_link: e.target.value })}
                    placeholder="https://chat.whatsapp.com/..."
                    className="h-8 border-none bg-transparent px-2 hover:bg-muted/50 focus-visible:bg-muted"
                  />
                  {form.grupo_whatsapp_link && (
                    <a
                      href={form.grupo_whatsapp_link}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-emerald-400"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </PropRow>
              <PropRow icon={Hash} label="Status">
                <Select value={form.fase} onValueChange={(v) => setForm({ ...form, fase: v as Fase })}>
                  <SelectTrigger className="h-8 w-auto border-none bg-transparent px-2 hover:bg-muted/50">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${faseMeta.bg}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${faseMeta.dot}`} />
                      {faseMeta.label}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {FASES.map((f) => (
                      <SelectItem key={f} value={f}>{FASE_LABEL[f].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropRow>
              <PropRow icon={Users} label="Grupo">
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v as Categoria })}>
                  <SelectTrigger className="h-8 w-auto border-none bg-transparent px-2 hover:bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropRow>
              <PropRow icon={Phone} label="WhatsApp (Privado)">
                <div className="flex w-full items-center gap-2">
                  <Input
                    value={form.whatsapp_privado}
                    onChange={(e) => setForm({ ...form, whatsapp_privado: e.target.value })}
                    placeholder="(35) 9135-5117"
                    className="h-8 border-none bg-transparent px-2 hover:bg-muted/50 focus-visible:bg-muted"
                  />
                  {whatsappHref && (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-emerald-400"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </PropRow>
              <PropRow icon={Calendar} label="Última call">
                <Input
                  type="datetime-local"
                  value={form.ultima_call}
                  onChange={(e) => setForm({ ...form, ultima_call: e.target.value })}
                  className="h-8 border-none bg-transparent px-2 hover:bg-muted/50 focus-visible:bg-muted"
                />
              </PropRow>
            </div>
          </div>

          {/* Info blocks (Notion callouts) */}
          <div className="mt-6 space-y-2">
            <InfoBlock icon={Fingerprint} label="CPF" tone="blue">
              <Input
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                placeholder="000.000.000-00"
                className="h-8 border-none bg-transparent px-0"
              />
            </InfoBlock>
            <InfoBlock icon={CalendarDays} label="Data de nascimento" tone="blue">
              <Input
                type="date"
                value={form.data_nascimento}
                onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
                className="h-8 w-auto border-none bg-transparent px-0"
              />
            </InfoBlock>
            <InfoBlock icon={MapPin} label="Endereço" tone="blue">
              <Textarea
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                placeholder="Rua, número, bairro, cidade - UF, CEP"
                rows={2}
                className="min-h-0 resize-none border-none bg-transparent px-0 py-0"
              />
            </InfoBlock>
            <InfoBlock icon={Smartphone} label="Celular" tone="blue">
              <Input
                value={form.celular}
                onChange={(e) => setForm({ ...form, celular: e.target.value })}
                placeholder="(00) 00000-0000"
                className="h-8 border-none bg-transparent px-0"
              />
            </InfoBlock>
            <InfoBlock icon={AtSign} label="E-mail" tone="blue">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@exemplo.com"
                className="h-8 border-none bg-transparent px-0"
              />
            </InfoBlock>
            <InfoBlock icon={FileText} label="Formulário de Integração" tone="green">
              <Input
                value={form.formulario_integracao_url}
                onChange={(e) => setForm({ ...form, formulario_integracao_url: e.target.value })}
                placeholder="https://..."
                className="h-8 border-none bg-transparent px-0"
              />
            </InfoBlock>
          </div>

          {/* Cronograma de Calls */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold">Cronograma de Calls</h2>
              <Button
                size="sm"
                onClick={() => {
                  if (!student?.id) {
                    toast.info("Salve o aluno antes de adicionar calls");
                    return;
                  }
                  upsertCallMut.mutate({
                    aluno_id: student.id,
                    sort_order: (calls.length || 0),
                  });
                }}
                disabled={!student?.id}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova
              </Button>
            </div>

            {!student?.id ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Salve o aluno para começar a cadastrar o cronograma.
              </div>
            ) : callsQ.isLoading ? (
              <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="w-[22%] px-3 py-2 text-left font-medium">📅 Data</th>
                      <th className="w-[30%] px-3 py-2 text-left font-medium">📞 Evento</th>
                      <th className="w-[22%] px-3 py-2 text-left font-medium">🙂 Responsável</th>
                      <th className="w-[22%] px-3 py-2 text-left font-medium">🔗 Link</th>
                      <th className="w-[4%] px-1 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                          Nenhuma call ainda. Clique em "Nova" para adicionar.
                        </td>
                      </tr>
                    ) : (
                      calls.map((c) => (
                        <CallRow
                          key={c.id}
                          call={c}
                          onSave={(patch) => upsertCallMut.mutate({ id: c.id, aluno_id: student.id, ...patch })}
                          onDelete={() => {
                            if (confirm("Remover esta call?")) deleteCallMut.mutate(c.id);
                          }}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Observações */}
          <div className="mt-8">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Observações</h2>
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              rows={4}
              placeholder="Notas internas sobre o aluno…"
              className="resize-none"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PropRow({
  icon: Icon,
  label,
  children,
}: {
  icon: any;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[220px_1fr] items-center gap-2">
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: any;
  label: string;
  tone: "blue" | "green";
  children: React.ReactNode;
}) {
  const bg = tone === "blue" ? "bg-sky-500/10 border-sky-500/20" : "bg-emerald-500/10 border-emerald-500/20";
  return (
    <div className={`flex items-start gap-3 rounded-lg border ${bg} px-3 py-2`}>
      <Icon className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        {children}
      </div>
    </div>
  );
}

function CallRow({
  call,
  onSave,
  onDelete,
}: {
  call: HTCustomerSuccessCall;
  onSave: (patch: Partial<HTCustomerSuccessCall>) => void;
  onDelete: () => void;
}) {
  const [data, setData] = useState(toDateTimeInput(call.data));
  const [evento, setEvento] = useState(call.evento ?? "");
  const [responsavel, setResponsavel] = useState(call.responsavel ?? "");
  const [link, setLink] = useState(call.link ?? "");

  useEffect(() => {
    setData(toDateTimeInput(call.data));
    setEvento(call.evento ?? "");
    setResponsavel(call.responsavel ?? "");
    setLink(call.link ?? "");
  }, [call.id, call.data, call.evento, call.responsavel, call.link]);

  function commit(patch: Partial<HTCustomerSuccessCall>) {
    onSave(patch);
  }

  return (
    <tr className="border-t border-border">
      <td className="px-2 py-1">
        <Input
          type="datetime-local"
          value={data}
          onChange={(e) => setData(e.target.value)}
          onBlur={() => commit({ data: data ? new Date(data).toISOString() : null })}
          className="h-8 border-none bg-transparent px-1 hover:bg-muted/40 focus-visible:bg-muted"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={evento}
          onChange={(e) => setEvento(e.target.value)}
          onBlur={() => commit({ evento })}
          placeholder="Call de Onboarding"
          className="h-8 border-none bg-transparent px-1 hover:bg-muted/40 focus-visible:bg-muted"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          onBlur={() => commit({ responsavel })}
          placeholder="Nome"
          className="h-8 border-none bg-transparent px-1 hover:bg-muted/40 focus-visible:bg-muted"
        />
      </td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-1">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onBlur={() => commit({ link })}
            placeholder="https://..."
            className="h-8 border-none bg-transparent px-1 hover:bg-muted/40 focus-visible:bg-muted"
          />
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="rounded p-1 text-muted-foreground hover:text-emerald-400">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </td>
      <td className="px-1 py-1">
        <button
          onClick={onDelete}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
