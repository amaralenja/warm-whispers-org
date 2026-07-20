export type VendorSticker = {
  id: string;
  url: string;
  createdAt: string;
  name?: string;
  isFavorite?: boolean;
  lastUsedAt?: string;
};

const STORAGE_PREFIX = "multium_vendor_stickers_";

function getStorageKey(vendorId?: string | number | null): string {
  const cleanId = vendorId != null ? String(vendorId).trim() : "default";
  return `${STORAGE_PREFIX}${cleanId || "default"}`;
}

export function getVendorStickers(vendorId?: string | number | null): VendorSticker[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(vendorId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[sticker-utils] Error reading vendor stickers:", err);
    return [];
  }
}

export function saveVendorSticker(
  vendorId: string | number | null | undefined,
  sticker: Omit<VendorSticker, "id" | "createdAt"> & { id?: string; createdAt?: string }
): VendorSticker[] {
  if (typeof window === "undefined") return [];
  try {
    const list = getVendorStickers(vendorId);
    const existingIndex = list.findIndex((s) => s.url === sticker.url || (sticker.id && s.id === sticker.id));
    
    const newSticker: VendorSticker = {
      id: sticker.id || `stk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      url: sticker.url,
      createdAt: sticker.createdAt || new Date().toISOString(),
      name: sticker.name || "Figurinha",
      isFavorite: sticker.isFavorite ?? false,
      lastUsedAt: sticker.lastUsedAt || new Date().toISOString(),
    };

    let updated: VendorSticker[];
    if (existingIndex >= 0) {
      updated = [...list];
      updated[existingIndex] = {
        ...updated[existingIndex],
        ...newSticker,
        isFavorite: sticker.isFavorite ?? updated[existingIndex].isFavorite,
      };
    } else {
      updated = [newSticker, ...list];
    }

    localStorage.setItem(getStorageKey(vendorId), JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("[sticker-utils] Error saving vendor sticker:", err);
    return [];
  }
}

export function toggleFavoriteSticker(
  vendorId: string | number | null | undefined,
  stickerIdOrUrl: string
): VendorSticker[] {
  if (typeof window === "undefined") return [];
  try {
    const list = getVendorStickers(vendorId);
    const index = list.findIndex((s) => s.id === stickerIdOrUrl || s.url === stickerIdOrUrl);
    if (index < 0) {
      // Se não existe na galeria ainda, adiciona como favorita
      return saveVendorSticker(vendorId, {
        id: `stk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url: stickerIdOrUrl,
        isFavorite: true,
        createdAt: new Date().toISOString(),
      });
    }

    const updated = [...list];
    updated[index] = {
      ...updated[index],
      isFavorite: !updated[index].isFavorite,
    };

    localStorage.setItem(getStorageKey(vendorId), JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("[sticker-utils] Error toggling favorite sticker:", err);
    return [];
  }
}

export function removeVendorSticker(
  vendorId: string | number | null | undefined,
  stickerIdOrUrl: string
): VendorSticker[] {
  if (typeof window === "undefined") return [];
  try {
    const list = getVendorStickers(vendorId);
    const updated = list.filter((s) => s.id !== stickerIdOrUrl && s.url !== stickerIdOrUrl);
    localStorage.setItem(getStorageKey(vendorId), JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("[sticker-utils] Error removing vendor sticker:", err);
    return [];
  }
}

export function recordRecentSticker(
  vendorId: string | number | null | undefined,
  sticker: { url: string; id?: string; name?: string }
): VendorSticker[] {
  if (typeof window === "undefined") return [];
  return saveVendorSticker(vendorId, {
    ...sticker,
    lastUsedAt: new Date().toISOString(),
  });
}

/**
 * Converte qualquer imagem (File, Blob ou URL) no formato padronizado de figurinhas do WhatsApp:
 * Canvas 512x512px quadrado, centralizado mantendo proporção, formato image/webp com transparência.
 */
export async function convertImageToWhatsappSticker(
  input: File | Blob | string
): Promise<{ blob: Blob; base64: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    let objectUrlToRevoke: string | null = null;
    if (typeof input === "string") {
      img.src = input;
    } else {
      objectUrlToRevoke = URL.createObjectURL(input);
      img.src = objectUrlToRevoke;
    }

    img.onload = () => {
      try {
        if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);

        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível criar o contexto 2D do Canvas"));
          return;
        }

        // Fundo transparente
        ctx.clearRect(0, 0, 512, 512);

        // Calcula proporções mantendo o aspect ratio dentro de 512x512
        const srcW = img.width || 512;
        const srcH = img.height || 512;
        const scale = Math.min(512 / srcW, 512 / srcH);

        const destW = Math.round(srcW * scale);
        const destH = Math.round(srcH * scale);

        // Centraliza a imagem no canvas 512x512
        const destX = Math.round((512 - destW) / 2);
        const destY = Math.round((512 - destH) / 2);

        ctx.drawImage(img, 0, 0, srcW, srcH, destX, destY, destW, destH);

        // Exporta como image/webp
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Falha ao exportar a figurinha como WEBP"));
              return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              // Remove o prefixo data:image/webp;base64,
              const base64 = dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
              const filename = `figurinha_${Date.now()}.webp`;

              resolve({ blob, base64, filename });
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(blob);
          },
          "image/webp",
          0.9
        );
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
      reject(new Error("Falha ao carregar a imagem para conversão em figurinha"));
    };
  });
}
