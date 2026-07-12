// Service worker MV3
// IMPORTANTE: não use openPanelOnActionClick=true aqui.
// Quando o Chrome abre o side panel automaticamente, chrome.action.onClicked não dispara,
// então a permissão activeTab não é concedida e tabCapture falha com
// "Extension has not been invoked for the current page".
async function configureSidePanel() {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }); } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanel();
  try { chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") }); } catch {}
});

chrome.runtime.onStartup?.addListener(() => {
  configureSidePanel();
});

function isCapturableTab(tab) {
  const url = tab?.url || "";
  return Boolean(tab?.id && url && !url.startsWith("chrome://") && !url.startsWith("chrome-extension://") && !url.startsWith("edge://") && !url.startsWith("about:"));
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!isCapturableTab(tab)) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
    return;
  }

  await chrome.storage.local.set({
    lastInvokedTabId: tab.id,
    lastInvokedTabUrl: tab.url || "",
    lastInvokedAt: Date.now(),
  });

  try {
    await chrome.sidePanel.setOptions({ tabId: tab.id, path: "sidepanel.html", enabled: true });
  } catch {}
  await chrome.sidePanel.open({ tabId: tab.id });
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "start-recording") {
        const streamId = msg.streamId;
        if (!streamId) throw new Error("streamId ausente. Reabra o painel na aba do Meet/Zoom.");

        await ensureOffscreen();
        const { endpoint } = await chrome.storage.local.get("endpoint");
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
