// Service worker — MV3
// Fluxo: popup pede pra iniciar -> pegamos streamId da aba ativa via chrome.tabCapture.getMediaStreamId
// -> abrimos offscreen document que faz getUserMedia(mic) + getUserMedia(tab) + mix + MediaRecorder
// -> ao parar, offscreen faz upload pro endpoint e responde com o texto.

const OFFSCREEN_URL = "offscreen.html";

async function hasOffscreen() {
  if (chrome.offscreen?.hasDocument) return chrome.offscreen.hasDocument();
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA"],
    justification: "Capturar mic + audio da aba e gravar",
  });
}

async function closeOffscreen() {
  if (await hasOffscreen()) {
    try { await chrome.offscreen.closeDocument(); } catch {}
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "start-recording") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("Nenhuma aba ativa");
        const streamId = await new Promise((resolve, reject) => {
          chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
            if (chrome.runtime.lastError || !id) {
              reject(new Error(chrome.runtime.lastError?.message || "Sem streamId (a aba precisa estar tocando áudio, ex: numa call)"));
            } else resolve(id);
          });
        });
        await ensureOffscreen();
        const { endpoint } = await chrome.storage.local.get("endpoint");
        const resp = await chrome.runtime.sendMessage({
          type: "offscreen-start",
          streamId,
          endpoint: endpoint || "https://warm-whispers-org.lovable.app/api/public/transcribe",
        });
        if (!resp?.ok) throw new Error(resp?.error || "Offscreen falhou");
        await chrome.storage.local.set({ recording: true });
        sendResponse({ ok: true });
      } else if (msg.type === "stop-recording") {
        const resp = await chrome.runtime.sendMessage({ type: "offscreen-stop" });
        await chrome.storage.local.set({ recording: false });
        await closeOffscreen();
        if (!resp?.ok) throw new Error(resp?.error || "Falha ao parar");
        sendResponse({ ok: true, text: resp.text });
      }
    } catch (e) {
      await chrome.storage.local.set({ recording: false });
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true; // manter canal assíncrono
});
