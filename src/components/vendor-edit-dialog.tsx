import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { defaultPermissoes } from "@/lib/menu-permissions";

type Vendor = {
  id?: number;
  nome?: string | null;
  utm?: string | null;
  expert?: string | null;
  ativo?: boolean | null;
  foto_url?: string | null;
  meta?: number | null;
  genero?: string | null;
};

export function VendorEditDialog({
  open,
  onOpenChange,
  vendor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendor: Vendor | null;
  onSaved?: () => void;
}) {
  const isNew = !vendor?.id;
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Vendor>({});

  useEffect(() => {
    if (open) setForm(vendor ?? { ativo: true, meta: 1000, genero: "M" });
  }, [open, vendor]);

  function set<K extends keyof Vendor>(k: K, v: Vendor[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `vendor-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("wa-media").upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });
      if (error) throw error;
      const { data, error: signErr } = await supabase.storage
        .from("wa-media")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10 anos
      if (signErr) throw signErr;
      set("foto_url", data.signedUrl);
      toast.success("Foto enviada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.nome?.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!form.utm?.trim()) {
      toast.error("UTM é obrigatório");
      return;
    }
    setSaving(true);
    const payload: any = {
      nome: form.nome.trim(),
      utm: form.utm.trim().toUpperCase(),
      expert: form.expert?.trim() || null,
      foto_url: form.foto_url || null,
      meta: Number(form.meta ?? 0),
      genero: form.genero || null,
      ativo: form.ativo ?? true,
    };
    let error;
    if (isNew) {
      payload.permissoes = defaultPermissoes() as any;
      ({ error } = await supabase.from("vendedores").insert(payload as any));
    } else {
      ({ error } = await supabase.from("vendedores").update(payload).eq("id", vendor!.id!));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isNew ? "Vendedor cadastrado" : "Vendedor atualizado");
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg scrollbar-fancy max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-400" />
            {isNew ? "Novo vendedor" : `Editar ${vendor?.nome ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            Dados básicos, foto e meta {isNew && "(novos vendedores entram com acesso só ao CRM X1 e WhatsApp)"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Foto */}
          <div className="flex items-center gap-4">
            {form.foto_url ? (
              <img
                src={form.foto_url}
                alt=""
                className="h-20 w-20 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-2xl text-muted-foreground">
                ?
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Upload className="mr-2 h-3 w-3" />}
                Enviar foto
              </Button>
              <Input
                placeholder="ou cole uma URL"
                value={form.foto_url ?? ""}
                onChange={(e) => set("foto_url", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome</Label>
              <Input value={form.nome ?? ""} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div>
              <Label>UTM</Label>
              <Input
                value={form.utm ?? ""}
                onChange={(e) => set("utm", e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
            </div>
            <div>
              <Label>Expert</Label>
              <Input value={form.expert ?? ""} onChange={(e) => set("expert", e.target.value)} />
            </div>
            <div>
              <Label>Meta diária (R$)</Label>
              <Input
                type="number"
                min={0}
                value={form.meta ?? 0}
                onChange={(e) => set("meta", Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Gênero</Label>
              <select
                value={form.genero ?? "M"}
                onChange={(e) => set("genero", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">Ativo</div>
                <div className="text-xs text-muted-foreground">Vendedor recebe leads e aparece no ranking</div>
              </div>
              <Switch checked={form.ativo ?? true} onCheckedChange={(v) => set("ativo", v)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
