// Service worker MV3
// Abre side panel ao clicar no ícone
chrome.runtime.onInstalled.addListener(() => {
  try { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch {}
});

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
    justification: "Capturar mic + áudio da aba e gravar",
  });
}

async function closeOffscreen() {
  if (await hasOffscreen()) {
    try { await chrome.offscreen.closeDocument(); } catch {}
  }
}

// Pega a aba ativa que NÃO é a do próprio side panel
async function findTargetTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const t = tabs.find((x) => x.url && !x.url.startsWith("chrome://") && !x.url.startsWith("chrome-extension://"));
  return t || tabs[0];
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "start-recording") {
        const tab = await findTargetTab();
        if (!tab?.id) throw new Error("Sem aba de call ativa. Abre o Meet/Zoom e tenta de novo.");

        // getMediaStreamId requer user gesture — o clique no botão da side panel conta
        const streamId = await new Promise((resolve, reject) => {
          chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
            if (chrome.runtime.lastError || !id) {
              reject(new Error(
                chrome.runtime.lastError?.message ||
                "Não consegui capturar áudio da aba. A aba precisa estar tocando som (call ativa).",
              ));
            } else resolve(id);
          });
        });

        await ensureOffscreen();
        const { endpoint } = await chrome.storage.local.get("endpoint");
        // pequena espera pro offscreen carregar
        await new Promise((r) => setTimeout(r, 200));
        const resp = await chrome.runtime.sendMessage({
          type: "offscreen-start",
          streamId,
          endpoint: endpoint || "https://warm-whispers-org.lovable.app/api/public/transcribe",
        });
        if (!resp?.ok) throw new Error(resp?.error || "Falha no offscreen");
        await chrome.storage.local.set({ recording: true });
        sendResponse({ ok: true });
      } else if (msg.type === "stop-recording") {
        const resp = await chrome.runtime.sendMessage({ type: "offscreen-stop" });
        await chrome.storage.local.set({ recording: false, recordingStartedAt: null });
        await closeOffscreen();
        if (!resp?.ok) throw new Error(resp?.error || "Falha ao parar");
        sendResponse({ ok: true, text: resp.text });
      }
    } catch (e) {
      await chrome.storage.local.set({ recording: false });
      try { await closeOffscreen(); } catch {}
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});
