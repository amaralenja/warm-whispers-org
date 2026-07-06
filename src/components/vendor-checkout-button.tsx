import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Zap, Plus, Trash2, Pencil, Loader2, Send, ImageIcon, X } from "lucide-react";
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
  uploadVendorCheckoutImageFn,
  getVendorCheckoutSendUrlFn,
} from "@/lib/vendor-checkouts.functions";

type Checkout = {
  id: string;
  nome: string;
  mensagem: string;
  link: string;
  image_path: string | null;
  image_url: string | null;
  ordem: number;
  created_at: string;
  updated_at: string;
};

export type QuickSendPayload =
  | { kind: "text"; text: string }
  | { kind: "image"; imageUrl: string; caption?: string };

type Props = {
  enabled: boolean;
  disabled?: boolean;
  onSend: (payload: QuickSendPayload) => Promise<void> | void;
};

type EditingState = Partial<Checkout> & {
  _newImageFile?: File | null;
  _newImagePreview?: string | null;
  _newImagePath?: string | null;
  _removeImage?: boolean;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function VendorCheckoutButton({ enabled, disabled, onSend }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listVendorCheckoutsFn);
  const upsertFn = useServerFn(upsertVendorCheckoutFn);
  const deleteFn = useServerFn(deleteVendorCheckoutFn);
  const uploadFn = useServerFn(uploadVendorCheckoutImageFn);
  const getSignedFn = useServerFn(getVendorCheckoutSendUrlFn);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [confirm, setConfirm] = useState<Checkout | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: checkouts = [], isLoading } = useQuery({
    queryKey: ["vendor-checkouts"],
    queryFn: () => listFn(),
    enabled: enabled && open,
    staleTime: 15_000,
  });

  const upsertMut = useMutation({
    mutationFn: (input: {
      id?: string;
      nome: string;
      mensagem: string;
      link: string;
      imagePath?: string | null;
      clearImage?: boolean;
    }) => upsertFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-checkouts"] });
      setEditing(null);
      toast.success("Mensagem salva");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-checkouts"] });
      toast.success("Mensagem removida");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  if (!enabled) return null;

  function buildTextOnly(c: Checkout) {
    const msg = (c.mensagem ?? "").trim();
    const link = (c.link ?? "").trim();
    if (msg && link) return `${msg}\n\n${link}`;
    return msg || link;
  }

  async function handleConfirmSend() {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    setOpen(false);
    try {
      if (c.image_path) {
        const { signedUrl } = await getSignedFn({ data: { path: c.image_path } });
        const caption = buildTextOnly(c);
        await onSend({ kind: "image", imageUrl: signedUrl, caption: caption || undefined });
      } else {
        const text = buildTextOnly(c);
        if (!text) return;
        await onSend({ kind: "text", text });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    }
  }

  async function handlePickImage(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 8MB)");
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const { path } = await uploadFn({ data: { filename: file.name, contentType: file.type, base64 } });
      const preview = URL.createObjectURL(file);
      setEditing((s) => ({ ...(s ?? {}), _newImagePath: path, _newImagePreview: preview, _removeImage: false }));
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  function removeImage() {
    setEditing((s) => ({
      ...(s ?? {}),
      _newImagePath: null,
      _newImagePreview: null,
      _removeImage: true,
    }));
  }

  const currentPreview = editing?._newImagePreview ?? (editing?._removeImage ? null : editing?.image_url ?? null);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="h-12 w-12 shrink-0 rounded-2xl text-muted-foreground hover:bg-chat-soft hover:text-chat-accent"
            title="Minhas mensagens rápidas"
          >
            <Zap className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-96 rounded-2xl border-chat-line bg-popover p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Mensagens rápidas</div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs"
              onClick={() => { setOpen(false); setEditing({ nome: "", mensagem: "" }); }}
            >
              <Plus className="h-4 w-4" /> Nova
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (checkouts?.length ?? 0) === 0 ? (
            <div className="rounded-xl bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma mensagem salva. Clique em <b>Nova</b> para criar a primeira.
            </div>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {checkouts.map((c) => (
                <li
                  key={c.id}
                  className="group flex items-start gap-2 rounded-xl border border-transparent bg-muted/30 p-2 hover:border-chat-line hover:bg-muted/60"
                >
                  <button
                    className="flex flex-1 items-start gap-2 text-left"
                    onClick={() => { setOpen(false); setConfirm(c); }}
                    title="Enviar esta mensagem"
                  >
                    {c.image_url ? (
                      <img
                        src={c.image_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-tight">{c.nome}</div>
                      {c.mensagem && (
                        <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">
                          {c.mensagem}
                        </div>
                      )}
                      {c.image_url && !c.mensagem && (
                        <div className="mt-1 text-[11px] text-muted-foreground/60">📷 imagem</div>
                      )}
                    </div>
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
            <DialogTitle>{editing?.id ? "Editar mensagem rápida" : "Nova mensagem rápida"}</DialogTitle>
            <DialogDescription>
              Salva só pra você. Pode ser só texto, só imagem, ou os dois (imagem com legenda).
            </DialogDescription>
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
              <label className="mb-1 block text-xs font-medium">Imagem (opcional)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePickImage(f);
                  e.target.value = "";
                }}
              />
              {currentPreview ? (
                <div className="relative w-fit">
                  <img src={currentPreview} alt="" className="max-h-40 rounded-lg border object-cover" />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
                    title="Remover imagem"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
                  {uploading ? "Enviando..." : "Adicionar imagem"}
                </Button>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">
                {currentPreview ? "Legenda da imagem (opcional)" : "Mensagem"}
              </label>
              <Textarea
                rows={5}
                placeholder={
                  currentPreview
                    ? "Legenda que vai junto com a imagem. Deixa vazio pra mandar só a imagem."
                    : "Escreve a mensagem. Pode colar link aqui dentro."
                }
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
              disabled={upsertMut.isPending || uploading}
              onClick={() => {
                const nome = (editing?.nome ?? "").trim();
                const mensagem = (editing?.mensagem ?? "").trim();
                const hasNewImage = !!editing?._newImagePath;
                const keepExistingImage = !editing?._removeImage && !!editing?.image_path && !hasNewImage;
                const hasImage = hasNewImage || keepExistingImage;
                if (!nome) { toast.error("Preencha o nome"); return; }
                if (!mensagem && !hasImage) { toast.error("Coloque uma mensagem ou imagem"); return; }
                upsertMut.mutate({
                  id: editing?.id,
                  nome,
                  mensagem,
                  link: "",
                  imagePath: hasNewImage ? editing?._newImagePath ?? null : undefined,
                  clearImage: editing?._removeImage === true,
                });
              }}
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
            <DialogDescription>Prévia do que vai pro cliente:</DialogDescription>
          </DialogHeader>
          {confirm && (
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-muted/40 p-3 text-sm">
              {confirm.image_url && (
                <img src={confirm.image_url} alt="" className="max-h-48 rounded-lg object-cover" />
              )}
              {buildTextOnly(confirm) && (
                <div className="whitespace-pre-wrap">{buildTextOnly(confirm)}</div>
              )}
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
