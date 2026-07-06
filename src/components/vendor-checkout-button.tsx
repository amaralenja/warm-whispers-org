import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Zap, Plus, Trash2, Pencil, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listVendorCheckoutsFn,
  upsertVendorCheckoutFn,
  deleteVendorCheckoutFn,
} from "@/lib/vendor-checkouts.functions";

type Checkout = {
  id: string;
  nome: string;
  mensagem: string;
  link: string;
  ordem: number;
  created_at: string;
  updated_at: string;
};

type Props = {
  enabled: boolean;
  disabled?: boolean;
  onSend: (fullMessage: string) => Promise<void> | void;
};

export function VendorCheckoutButton({ enabled, disabled, onSend }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listVendorCheckoutsFn);
  const upsertFn = useServerFn(upsertVendorCheckoutFn);
  const deleteFn = useServerFn(deleteVendorCheckoutFn);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Checkout> | null>(null);
  const [confirm, setConfirm] = useState<Checkout | null>(null);

  const { data: checkouts = [], isLoading } = useQuery({
    queryKey: ["vendor-checkouts"],
    queryFn: () => listFn(),
    enabled: enabled && open,
    staleTime: 15_000,
  });

  const upsertMut = useMutation({
    mutationFn: (input: { id?: string; nome: string; mensagem: string; link: string }) =>
      upsertFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-checkouts"] });
      setEditing(null);
      toast.success("Checkout salvo");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-checkouts"] });
      toast.success("Checkout removido");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  if (!enabled) return null;

  function buildFullMessage(c: Checkout) {
    const msg = c.mensagem?.trim();
    return msg ? `${msg}\n\n${c.link}` : c.link;
  }

  async function handleConfirmSend() {
    if (!confirm) return;
    const text = buildFullMessage(confirm);
    setConfirm(null);
    setOpen(false);
    try {
      await onSend(text);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="h-12 w-12 shrink-0 rounded-2xl text-muted-foreground hover:bg-chat-soft hover:text-chat-accent"
            title="Meus checkouts"
          >
            <Zap className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-96 rounded-2xl border-chat-line bg-popover p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Meus checkouts</div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs"
              onClick={() => { setOpen(false); setEditing({ nome: "", mensagem: "", link: "" }); }}
            >
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : checkouts.length === 0 ? (
            <div className="rounded-xl bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhum checkout salvo. Clique em <b>Novo</b> para criar o primeiro.
            </div>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {checkouts.map((c) => (
                <li
                  key={c.id}
                  className="group flex items-start gap-2 rounded-xl border border-transparent bg-muted/30 p-2 hover:border-chat-line hover:bg-muted/60"
                >
                  <button
                    className="flex-1 text-left"
                    onClick={() => { setOpen(false); setConfirm(c); }}
                    title="Enviar este checkout"
                  >
                    <div className="text-sm font-medium leading-tight">{c.nome}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.link}</div>
                    {c.mensagem && (
                      <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">
                        {c.mensagem}
                      </div>
                    )}
                  </button>
                  <div className="flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => { setOpen(false); setEditing(c); }}
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(`Remover "${c.nome}"?`)) deleteMut.mutate(c.id);
                      }}
                      title="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      {/* Editor */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar checkout" : "Novo checkout"}</DialogTitle>
            <DialogDescription>Salvo só pra você, ninguém mais vê.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Nome</label>
              <Input
                placeholder="Ex: Oferta principal"
                value={editing?.nome ?? ""}
                onChange={(e) => setEditing((s) => ({ ...(s ?? {}), nome: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Link do checkout</label>
              <Input
                placeholder="https://..."
                value={editing?.link ?? ""}
                onChange={(e) => setEditing((s) => ({ ...(s ?? {}), link: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Mensagem (opcional) — enviada antes do link
              </label>
              <Textarea
                rows={4}
                placeholder="Olá! Segue o link pra você garantir agora 👇"
                value={editing?.mensagem ?? ""}
                onChange={(e) => setEditing((s) => ({ ...(s ?? {}), mensagem: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              disabled={upsertMut.isPending}
              onClick={() =>
                upsertMut.mutate({
                  id: editing?.id,
                  nome: (editing?.nome ?? "").trim(),
                  mensagem: editing?.mensagem ?? "",
                  link: (editing?.link ?? "").trim(),
                })
              }
            >
              {upsertMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de envio */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar “{confirm?.nome}”?</DialogTitle>
            <DialogDescription>Prévia da mensagem que vai pro cliente:</DialogDescription>
          </DialogHeader>
          {confirm && (
            <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm">
              {buildFullMessage(confirm)}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmSend}>
              <Send className="mr-2 h-4 w-4" /> Enviar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
