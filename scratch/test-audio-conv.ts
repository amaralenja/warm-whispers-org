import { convertAudioToWhatsappVoice } from "../src/lib/transloadit.server";

async function main() {
  const url = "https://wvcwrozwnwdlpandwubp.supabase.co/storage/v1/object/sign/wa-media/flows/256f1ee8-79ce-4a8f-96c3-f709f2f31475/1784143204270.ogg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8wZGE1YWE5OS0xNWU3LTRmYjctYmE5Zi0zNWRkZjU5MWZhMWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ3YS1tZWRpYS9mbG93cy8yNTZmMWVlOC03OWNlLTRhOGYtOTZjMy1mNzA5ZjJmMzE0NzUvMTc4NDE0MzIwNDI3MC5vZ2ciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg0MTQzMjA1LCJleHAiOjE4MTU2NzkyMDV9.xgo9aT_fVkpsEom2EZZDExx54AcGyGOXuc_4XPnhARw";

  console.log("Testing audio fetch...");
  const res = await fetch(url);
  console.log("Fetch HTTP status:", res.status, res.statusText);

  if (res.ok) {
    console.log("Testing Transloadit conversion...");
    try {
      const converted = await convertAudioToWhatsappVoice(url);
      console.log("CONVERTED SUCCESSFULLY:", converted);
    } catch (err) {
      console.error("CONVERSION FAILED:", err);
    }
  }
}

main().catch(console.error);
