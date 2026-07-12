const DEFAULT_ENDPOINT = "https://warm-whispers-org.lovable.app/api/public/transcribe";

const $ = (id) => document.getElementById(id);
const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
const ring = $("ring");
const statusText = $("statusText");
const timerEl = $("timer");
const transcript = $("transcript");
const endpointInput = $("endpoint");
const errorBox = $("errorBox");

let timerInterval = null;
let startedAt = null;
let micPermissionState = "unknown";
let lastTargetTab = null;

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function showError(msg) {
  if (!msg) { errorBox.style.display = "none"; errorBox.textContent = ""; return; }
  errorBox.style.display = "block";
  errorBox.textContent = msg;
}

function isCapturableUrl(url) {
  return Boolean(
    url &&
    !url.startsWith("chrome://") &&
    !url.startsWith("chrome-extension://") &&
    !url.startsWith("edge://") &&
    !url.startsWith("about:"),
  );
}

async function getInvokedTargetTab() {
  const stored = await chrome.storage.local.get(["lastInvokedTabId", "lastInvokedTabUrl", "lastInvokedAt"]);
  const lastInvokedAt = Number(stored.lastInvokedAt || 0);
  const isFresh = Date.now() - lastInvokedAt < 10 * 60 * 1000;
  if (stored.lastInvokedTabId && isFresh) {
    try {
      const tab = await chrome.tabs.get(Number(stored.lastInvokedTabId));
      if (tab?.id && isCapturableUrl(tab.url || stored.lastInvokedTabUrl || "")) return tab;
    } catch {}
  }

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs.find((t) => t?.id && isCapturableUrl(t.url || "")) || null;
}

async function getMicPermissionState() {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const permission = await navigator.permissions.query({ name: "microphone" });
    micPermissionState = permission.state;
    permission.onchange = () => {
      micPermissionState = permission.state;
      refreshUi();
    };
    return permission.state;
  } catch {
    return "unknown";
  }
}

async function openMicPermissionPage() {
  await chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
}

async function refreshUi() {
  const micState = await getMicPermissionState();
  const { recording, lastTranscript, endpoint, recordingStartedAt } = await chrome.storage.local.get([
    "recording", "lastTranscript", "endpoint", "recordingStartedAt",
  ]);
  endpointInput.value = endpoint || DEFAULT_ENDPOINT;
  getInvokedTargetTab().then((tab) => { lastTargetTab = tab; }).catch(() => {});
  if (recording) {
    ring.className = "pulse-ring rec";
    statusText.innerHTML = "<strong>Gravando.</strong> Deixa a call rolando.";
    startBtn.style.display = "none";
    stopBtn.style.display = "flex";
    if (!timerInterval && recordingStartedAt) {
      startedAt = recordingStartedAt;
      timerInterval = setInterval(() => {
        timerEl.textContent = fmt(Date.now() - startedAt);
      }, 500);
    }
  } else {
    ring.className = "pulse-ring";
    if (statusText.textContent.indexOf("Transcrevendo") === -1) {
      if (micState === "granted") {
        statusText.innerHTML = lastTargetTab?.url
          ? "<strong>Mic autorizado.</strong> Clique em iniciar nesta barra lateral."
          : "<strong>Mic autorizado.</strong> Volte na aba do Meet/Zoom e clique no ícone da extensão.";
      } else if (micState === "denied") {
        statusText.innerHTML = "<strong>Mic bloqueado.</strong> Clique em iniciar para abrir a página de permissão.";
      } else {
        statusText.innerHTML = "<strong>Autorize o mic primeiro.</strong> Clique em iniciar e aceite o pop-up.";
      }
    }
    startBtn.style.display = "flex";
    stopBtn.style.display = "none";
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (!startBtn.disabled) timerEl.textContent = "00:00";
  }
  if (lastTranscript) transcript.textContent = lastTranscript;
}

// Side panels podem suprimir o prompt. A permissão precisa acontecer numa aba de extensão.
async function warmupMicPermission() {
  const state = await getMicPermissionState();
  if (state !== "granted") {
    await openMicPermissionPage();
    throw new Error("Abri a aba de autorização do microfone. Clique em Autorizar, aceite o pop-up do Chrome e volte aqui.");
  }
  return true;
}

startBtn.addEventListener("click", async () => {
  showError("");
  startBtn.disabled = true;
  statusText.innerHTML = "<strong>Iniciando...</strong>";
  try {
    await warmupMicPermission();

    const targetTab = await getInvokedTargetTab();
    if (!targetTab?.id) {
      throw new Error("Abre a aba do Meet/Zoom/WhatsApp Web, clique no ícone da Multium Meet nessa mesma aba e só então aperte Iniciar.");
    }

    // getMediaStreamId PRECISA rodar aqui (gesto do usuário no sidepanel)
    // Chamar do background perde o gesto e Chrome bloqueia com "Extension has not been invoked"
    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: targetTab.id }, (id) => {
        if (chrome.runtime.lastError || !id) {
          reject(new Error(
            (chrome.runtime.lastError?.message || "Falha ao capturar áudio da aba.") +
            " Dica: remova a versão antiga, carregue a v0.5.0, vá pra aba do Meet/Zoom/WhatsApp Web e clique no ícone da extensão nessa aba. Não abra o painel por atalho nem por página chrome://.",
          ));
        } else resolve(id);
      });
    });

    const resp = await chrome.runtime.sendMessage({ type: "start-recording", streamId });
    if (!resp?.ok) throw new Error(resp?.error || "Falha ao iniciar");
    await chrome.storage.local.set({ recordingStartedAt: Date.now() });
  } catch (e) {
    showError(e.message);
    statusText.innerHTML = "<strong>Não deu.</strong> Ajusta e tenta de novo.";
  } finally {
    startBtn.disabled = false;
    refreshUi();
  }
});

stopBtn.addEventListener("click", async () => {
  showError("");
  stopBtn.disabled = true;
  ring.className = "pulse-ring working";
  statusText.innerHTML = "<strong>Transcrevendo...</strong> pode levar até 30s.";
  try {
    const resp = await chrome.runtime.sendMessage({ type: "stop-recording" });
    if (!resp?.ok) throw new Error(resp?.error || "Falha ao transcrever");
    transcript.textContent = resp.text || "(vazio)";
    await chrome.storage.local.set({ lastTranscript: resp.text || "" });
    statusText.innerHTML = "<strong>Pronto!</strong> Transcrição abaixo.";
  } catch (e) {
    showError(e.message);
    statusText.innerHTML = "<strong>Erro ao transcrever.</strong>";
  } finally {
    stopBtn.disabled = false;
    refreshUi();
  }
});

$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(transcript.textContent || "");
  statusText.innerHTML = "<strong>Copiado!</strong>";
});

$("clearBtn").addEventListener("click", async () => {
  transcript.textContent = "";
  await chrome.storage.local.remove("lastTranscript");
});

$("saveEndpoint").addEventListener("click", async () => {
  await chrome.storage.local.set({ endpoint: endpointInput.value.trim() || DEFAULT_ENDPOINT });
  statusText.innerHTML = "<strong>Endpoint salvo.</strong>";
});

refreshUi();
setInterval(refreshUi, 1000);
