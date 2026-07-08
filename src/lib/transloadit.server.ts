import { createHmac } from "crypto";

const API_BASE = "https://api2.transloadit.com";

function getCreds() {
  const key = process.env.TRANSLOADIT_AUTH_KEY;
  const secret = process.env.TRANSLOADIT_AUTH_SECRET;
  if (!key || !secret) throw new Error("Transloadit credentials não configuradas");
  return { key, secret };
}

function signParams(paramsJson: string, secret: string) {
  return createHmac("sha384", secret).update(paramsJson).digest("hex");
}

/**
 * Converts a remote audio file to OGG/Opus mono (WhatsApp voice format)
 * and returns the resulting public URL.
 */
export async function convertAudioToWhatsappVoice(sourceUrl: string): Promise<string> {
  const { key, secret } = getCreds();

  const expires = new Date(Date.now() + 1000 * 60 * 10) // 10 min
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "+00:00");

  const params = {
    auth: { key, expires },
    steps: {
      imported: {
        robot: "/http/import",
        url: sourceUrl,
      },
      encoded: {
        use: "imported",
        robot: "/audio/encode",
        preset: "ogg",
        ffmpeg_stack: "v6.0.0",
        ffmpeg: {
          c: "libopus",
          ac: 1,
          ar: 48000,
          "b:a": "32k",
          application: "voip",
        },
      },
    },
  };

  const paramsJson = JSON.stringify(params);
  const signature = signParams(paramsJson, secret);

  const form = new FormData();
  form.append("params", paramsJson);
  form.append("signature", signature);

  const createRes = await fetch(`${API_BASE}/assemblies`, {
    method: "POST",
    body: form,
  });
  const created: any = await createRes.json();
  if (!createRes.ok || created?.error) {
    throw new Error(`Transloadit create failed: ${created?.message || created?.error || createRes.status}`);
  }

  const assemblyUrl: string = created.assembly_ssl_url;

  // Poll until completed — áudios grandes podem levar bem mais que 90s.
  const deadline = Date.now() + 240_000;
  let assembly: any = created;
  while (Date.now() < deadline) {
    if (assembly?.ok === "ASSEMBLY_COMPLETED") break;
    if (assembly?.error) throw new Error(`Transloadit erro: ${assembly.error} ${assembly.message ?? ""}`);
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(assemblyUrl);
      assembly = await res.json();
    } catch {
      // ignore intermittent poll errors, tenta de novo
    }
  }

  if (assembly?.ok !== "ASSEMBLY_COMPLETED") {
    throw new Error(`Transloadit timeout (status=${assembly?.ok ?? "unknown"})`);
  }

  const encoded = assembly?.results?.encoded?.[0];
  const url: string | undefined = encoded?.ssl_url || encoded?.url;
  if (!url) throw new Error("Transloadit não retornou URL do áudio convertido");
  return url;
}
