import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listVendorLinksAdmin,
  upsertVendorLink,
  deleteVendorLink,
  type VendorPaymentLink,
} from "@/lib/vendor-links.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: number | null;
  vendorName: string | null;
};

export function VendorLinksDialog({ open, onOpenChange, vendorId, vendorName }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listVendorLinksAdmin);
  const upsertFn = useServerFn(upsertVendorLink);
  const deleteFn = useServerFn(deleteVendorLink);

  const key = ["vendor-payment-links", vendorId];
  const { data: links = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { vendorId: vendorId! } }),
    enabled: open && !!vendorId,
  });

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) {
      setTitle("");
      setUrl("");
    }
  }, [open]);

  const addMut = useMutation({
    mutationFn: () => upsertFn({ data: { vendorId: vendorId!, title, url } }),
    onSuccess: () => {
      toast.success("Link adicionado");
      setTitle("");
      setUrl("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Link removido");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Link copiado"),
      () => toast.error("Não consegui copiar"),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Links de pagamento</DialogTitle>
          <DialogDescription>
            {vendorName ? <>Vendedor: <span className="font-medium">{vendorName}</span></> : "Vendedor"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adicionar link
            </div>
            <div className="space-y-2">
              <Input
                placeholder="Título (ex: Curso VIP - PIX)"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Input
                placeholder="https://..."
                value={url}
                maxLength={2000}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button
                onClick={() => addMut.mutate()}
                disabled={addMut.isPending || !title.trim() || !url.trim()}
                className="w-full"
              >
                {addMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Adicionar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Links cadastrados
            </div>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : links.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                Nenhum link cadastrado ainda.
              </div>
            ) : (
              <ul className="space-y-2">
                {links.map((l: VendorPaymentLink) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{l.url}</div>
                    </div>
                    <button
                      onClick={() => copy(l.url)}
                      title="Copiar link"
                      className="rounded p-1.5 text-muted-foreground transition hover:bg-emerald-500/10 hover:text-emerald-400"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => delMut.mutate(l.id)}
                      disabled={delMut.isPending}
                      title="Remover"
                      className="rounded p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
