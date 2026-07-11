import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Mail, Pencil, Plus, RefreshCw, Search, Settings2, Trash2, Upload, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { MENU_TREE, htDefaultPermissoes, type Permissoes } from "@/lib/menu-permissions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ht-team")({
  component: HtTeamPage,
  head: () => ({ meta: [{ title: "SDRs & Closers · High Ticket" }] }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Não encontrado</div>,
});

type Membro = {
  id: number;
  nome: string | null;
  tipo: "sdr" | "closer";
  telefone: string | null;
  email: string | null;
  foto_url: string | null;
  codigo: string | null;
  ativo: boolean | null;
  permissoes: Permissoes | null;
};

function initials(s: string | null) {
  if (!s) return "?";
  const p = s.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function HtTeamPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"todos" | "sdr" | "closer">("todos");
  const [editing, setEditing] = useState<Membro | null>(null);
  const [creating, setCreating] = useState(false);
  const [permMember, setPermMember] = useState<Membro | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ht-team-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ht_team")
        .select("id, nome, tipo, telefone, email, foto_url, codigo, ativo, permissoes")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Membro[];
    },
  });

  async function regenerateCode(id: number) {
    const { data: newCode, error: rpcErr } = await supabase.rpc("generate_ht_team_codigo");
    if (rpcErr || !newCode) { toast.error("Falha ao gerar código"); return; }
    const { error } = await supabase.from("ht_team").update({ codigo: newCode }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Novo código: ${newCode}`);
    qc.invalidateQueries({ queryKey: ["ht-team-list"] });
  }

  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); toast.success(`Código ${code} copiado`); }
    catch { toast.error(`Código: ${code}`); }
  }

  async function toggleAtivo(m: Membro) {
    const { error } = await supabase.from("ht_team").update({ ativo: !m.ativo }).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["ht-team-list"] });
  }

  async function remove(id: number) {
    if (!confirm("Remover este membro?")) return;
    const { error } = await supabase.from("ht_team").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido");
    qc.invalidateQueries({ queryKey: ["ht-team-list"] });
  }

  const filtered = useMemo(() => {
    const list = data ?? [];
    return list.filter((v) => {
      if (filter !== "todos" && v.tipo !== filter) return false;
      if (!q.trim()) return true;
      const n = q.toLowerCase();
      return (v.nome ?? "").toLowerCase().includes(n) || (v.telefone ?? "").includes(q);
    });
  }, [data, q, filter]);

  const totals = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      sdr: list.filter((v) => v.tipo === "sdr").length,
      closer: list.filter((v) => v.tipo === "closer").length,
    };
  }, [data]);

  return (
    <div className="space-y-6 p-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-500/15 via-card to-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">SDRs & Closers</h1>
            <p className="text-sm text-muted-foreground">Time da operação High Ticket</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: totals.total },
            { label: "SDRs", value: totals.sdr },
            { label: "Closers", value: totals.closer },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">{s.label}</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou telefone..." className="pl-9" />
        </div>
        <div className="flex rounded-lg border border-border bg-card p-1">
          {(["todos", "sdr", "closer"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase transition-colors ${
                filter === k ? "bg-violet-500/15 text-violet-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5 bg-violet-500 text-white hover:bg-violet-600">
          <Plus className="h-4 w-4" /> Novo membro
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-secondary/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhum membro encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => (
            <div key={v.id} className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-violet-500/40">
              <div className="flex items-start gap-3">
                {v.foto_url ? (
                  <img src={v.foto_url} alt={v.nome ?? ""} className="h-12 w-12 rounded-full border border-border/60 object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-sm font-bold text-white">
                    {initials(v.nome)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">{v.nome ?? "—"}</h3>
                    {v.ativo ? (
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="h-5 px-1.5 text-[0.6rem] uppercase">{v.tipo}</Badge>
                    {v.telefone && <span className="truncate">· {v.telefone}</span>}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5 text-violet-400" />
                  <span className="font-mono text-sm font-bold tracking-widest text-foreground">
                    {v.codigo ?? "——————"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {v.codigo && (
                    <button onClick={() => copyCode(v.codigo!)} title="Copiar" className="rounded p-1 hover:bg-violet-500/10 hover:text-violet-400">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => regenerateCode(v.id)} title="Novo código" className="rounded p-1 hover:bg-violet-500/10 hover:text-violet-400">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5">
                <button
                  onClick={() => setEditing(v)}
                  title="Editar dados"
                  className="flex items-center justify-center gap-1 rounded-lg border border-border bg-background/40 px-2 py-1.5 text-[0.7rem] text-muted-foreground hover:border-violet-500/40 hover:text-violet-400"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setPermMember(v)}
                  title="Permissões / menus"
                  className="flex items-center justify-center gap-1 rounded-lg border border-border bg-background/40 px-2 py-1.5 text-[0.7rem] text-muted-foreground hover:border-violet-500/40 hover:text-violet-400"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => toggleAtivo(v)}
                  title={v.ativo ? "Desativar" : "Ativar"}
                  className="flex items-center justify-center gap-1 rounded-lg border border-border bg-background/40 px-2 py-1.5 text-[0.7rem] text-muted-foreground hover:border-violet-500/40 hover:text-violet-400"
                >
                  {v.ativo ? "Off" : "On"}
                </button>
                <button
                  onClick={() => remove(v.id)}
                  title="Remover"
                  className="flex items-center justify-center gap-1 rounded-lg border border-border bg-background/40 px-2 py-1.5 text-[0.7rem] text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <MembroDialog
        open={!!editing || creating}
        member={editing}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["ht-team-list"] })}
      />
      <PermissoesDialog
        open={!!permMember}
        member={permMember}
        onClose={() => setPermMember(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["ht-team-list"] })}
      />
    </div>
  );
}

function MembroDialog({
  open, member, onClose, onSaved,
}: { open: boolean; member: Membro | null; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"sdr" | "closer">("closer");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setNome(member?.nome ?? "");
      setTipo(member?.tipo ?? "closer");
      setTelefone(member?.telefone ?? "");
      setEmail(member?.email ?? "");
      setFotoUrl(member?.foto_url ?? "");
    }
  }, [open, member]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `ht-team-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("wa-media").upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });
      if (error) throw error;
      const { data, error: signErr } = await supabase.storage
        .from("wa-media")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr) throw signErr;
      setFotoUrl(data.signedUrl);
      toast.success("Foto enviada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const emailTrim = email.trim();
    if (tipo === "closer" && !emailTrim) {
      toast.error("Email é obrigatório para Closers (recebe os convites de reunião)");
      return;
    }
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      toast.error("Email inválido");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        nome: nome.trim() || null,
        tipo,
        telefone: telefone.trim() || null,
        email: emailTrim || null,
        foto_url: fotoUrl.trim() || null,
      };
      if (member) {
        const { error } = await supabase.from("ht_team").update(payload).eq("id", member.id);
        if (error) throw error;
        toast.success("Atualizado");
      } else {
        payload.permissoes = htDefaultPermissoes(tipo);
        const { error } = await supabase.from("ht_team").insert(payload);
        if (error) throw error;
        toast.success("Criado");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{member ? "Editar membro" : "Novo membro"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-4">
            {fotoUrl ? (
              <img src={fotoUrl} alt="" className="h-20 w-20 rounded-full border border-border object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-lg font-bold text-white">
                {initials(nome)}
              </div>
            )}
            <div className="flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Upload className="mr-2 h-3 w-3" />}
                {fotoUrl ? "Trocar foto" : "Enviar foto"}
              </Button>
              {fotoUrl && (
                <button
                  type="button"
                  onClick={() => setFotoUrl("")}
                  className="block text-xs text-muted-foreground hover:text-destructive"
                >
                  Remover foto
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as "sdr" | "closer")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sdr">SDR</SelectItem>
                <SelectItem value="closer">Closer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-violet-400" />
              Email {tipo === "closer" ? <span className="text-xs text-violet-400">*obrigatório</span> : <span className="text-xs text-muted-foreground">(opcional)</span>}
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="closer@empresa.com"
              required={tipo === "closer"}
            />
            {tipo === "closer" && (
              <p className="rounded-md border border-violet-500/20 bg-violet-500/5 px-2.5 py-2 text-[0.7rem] leading-relaxed text-muted-foreground">
                O Closer <strong className="text-foreground">precisa</strong> de email pra receber os convites (Google Calendar / .ics) das reuniões agendadas pelo SDR.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Telefone <span className="text-xs text-muted-foreground">(opcional)</span></Label>
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-violet-500 hover:bg-violet-600 text-white">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermissoesDialog({
  open, member, onClose, onSaved,
}: { open: boolean; member: Membro | null; onClose: () => void; onSaved: () => void }) {
  const [perm, setPerm] = useState<Permissoes>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && member) {
      const base = htDefaultPermissoes(member.tipo);
      const cur = (member.permissoes && typeof member.permissoes === "object") ? member.permissoes : base;
      setPerm({ ...base, ...cur });
    }
  }, [open, member]);

  function setLeaf(groupKey: string, leafKey: string, v: boolean) {
    setPerm((prev) => {
      const node = prev[groupKey];
      const sub = typeof node === "object" && node !== null ? { ...node } : {};
      sub[leafKey] = v;
      return { ...prev, [groupKey]: sub };
    });
  }
  function setTop(groupKey: string, v: boolean) {
    setPerm((prev) => {
      const node = prev[groupKey];
      if (typeof node === "object" && node !== null) {
        const sub: Record<string, boolean> = {};
        for (const k of Object.keys(node)) sub[k] = v;
        return { ...prev, [groupKey]: sub };
      }
      return { ...prev, [groupKey]: v };
    });
  }
  function isTopOn(groupKey: string): boolean {
    const node = perm[groupKey];
    if (typeof node === "boolean") return node;
    if (typeof node === "object" && node !== null) return Object.values(node).some((v) => v !== false);
    return false;
  }

  async function resetDefaults() {
    if (!member) return;
    setPerm(htDefaultPermissoes(member.tipo));
  }

  async function save() {
    if (!member) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("ht_team").update({ permissoes: perm as any }).eq("id", member.id);
      if (error) throw error;
      toast.success("Permissões salvas");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-violet-400" />
            Permissões — {member?.nome ?? ""}
          </DialogTitle>
          <DialogDescription>
            Por padrão, {member?.tipo === "sdr" ? "SDRs" : "Closers"} veem só o <strong>Analytics de High Ticket</strong> e o <strong>Kanban {member?.tipo === "sdr" ? "SDR" : "Closer"}</strong>. Libere outras abas manualmente aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {MENU_TREE.map((node) => {
            const isGroup = "children" in node;
            return (
              <div key={node.key} className="rounded-lg border border-border bg-card/40 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{node.title}</div>
                  <Switch checked={isTopOn(node.key)} onCheckedChange={(v) => setTop(node.key, v)} />
                </div>
                {isGroup && (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/40 pt-3">
                    {node.children.map((c) => {
                      const sub = perm[node.key];
                      const checked = typeof sub === "object" && sub !== null ? sub[c.key] === true : !!sub;
                      return (
                        <label key={c.key} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox checked={checked} onCheckedChange={(v) => setLeaf(node.key, c.key, !!v)} />
                          <span>{c.title}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={resetDefaults}>Restaurar padrão</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-violet-500 hover:bg-violet-600 text-white">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
