import { createHmac, randomUUID } from "crypto";

const API_BASE = "https://api2.transloadit.com";

function getCreds() {
  const key = process.env.TRANSLOADIT_AUTH_KEY?.trim();
  const secret = process.env.TRANSLOADIT_AUTH_SECRET?.trim();
  if (!key || !secret) throw new Error("Transloadit credentials não configuradas");
  return { key, secret };
}

function signParams(paramsJson: string, secret: string) {
  return createHmac("sha384", secret).update(paramsJson).digest("hex");
}

async function runAssembly(steps: Record<string, any>, timeoutMs = 240_000) {
  const { key, secret } = getCreds();

  const expires = new Date(Date.now() + 1000 * 60 * 10).toISOString();

  const params = {
    auth: { key, expires, nonce: randomUUID() },
    steps,
  };

  const paramsJson = JSON.stringify(params);
  const signature = signParams(paramsJson, secret);

  const form = new FormData();
  form.append("params", paramsJson);
  form.append("signature", `sha384:${signature}`);

  const createRes = await fetch(`${API_BASE}/assemblies`, {
    method: "POST",
    body: form,
  });
  const created: any = await createRes.json();
  if (!createRes.ok || created?.error) {
    throw new Error(`Transloadit create failed: ${created?.message || created?.error || createRes.status}`);
  }

  const assemblyUrl: string = created.assembly_ssl_url;
  const deadline = Date.now() + timeoutMs;
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
  return assembly;
}

/**
 * Converts a remote audio file to OGG/Opus mono (WhatsApp voice format)
 * and returns the resulting public URL.
 */
export async function convertAudioToWhatsappVoice(sourceUrl: string): Promise<string> {
  const assembly = await runAssembly({
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
  });

  const encoded = assembly?.results?.encoded?.[0];
  const url: string | undefined = encoded?.ssl_url || encoded?.url;
  if (!url) throw new Error("Transloadit não retornou URL do áudio convertido");
  return url;
}

/**
 * Normalizes screenshots/PNGs to a WhatsApp-friendly JPEG. Meta sometimes
 * accepts big PNG sends synchronously and later reports status=failed.
 */
export async function convertImageToWhatsappJpeg(sourceUrl: string): Promise<string> {
  const assembly = await runAssembly({
    imported: {
      robot: "/http/import",
      url: sourceUrl,
    },
    optimized: {
      use: "imported",
      robot: "/image/resize",
      format: "jpg",
      quality: 86,
      resize_strategy: "fit",
      width: 1600,
      height: 1600,
      imagemagick_stack: "v3.0.1",
    },
  }, 180_000);

  const optimized = assembly?.results?.optimized?.[0];
  const url: string | undefined = optimized?.ssl_url || optimized?.url;
  if (!url) throw new Error("Transloadit não retornou URL da imagem convertida");
  return url;
}

/**
 * Converts any remote video to a WhatsApp-friendly MP4 (H.264/AAC).
 * iPhone videos often arrive as MOV/HEVC and Meta rejects them with generic
 * "Something went wrong" / 131000 errors, so flows and manual sends normalize
 * videos before handing the URL to WhatsApp.
 */
export async function convertVideoToWhatsappMp4(sourceUrl: string): Promise<string> {
  const assembly = await runAssembly({
    imported: {
      robot: "/http/import",
      url: sourceUrl,
    },
    encoded: {
      use: "imported",
      robot: "/video/encode",
      preset: "iphone-high",
      ffmpeg_stack: "v6.0.0",
      ffmpeg: {
        vcodec: "libx264",
        acodec: "aac",
        pix_fmt: "yuv420p",
        movflags: "+faststart",
        "profile:v": "main",
        level: "4.0",
        "b:v": "1800k",
        "maxrate": "2200k",
        "bufsize": "4400k",
        "b:a": "128k",
      },
      result: true,
    },
  }, 300_000);

  const encoded = assembly?.results?.encoded?.[0];
  const url: string | undefined = encoded?.ssl_url || encoded?.url;
  if (!url) throw new Error("Transloadit não retornou URL do vídeo convertido");
  return url;
}
