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

async function refreshUi() {
  const { recording, lastTranscript, endpoint, recordingStartedAt } = await chrome.storage.local.get([
    "recording", "lastTranscript", "endpoint", "recordingStartedAt",
  ]);
  endpointInput.value = endpoint || DEFAULT_ENDPOINT;
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
      statusText.innerHTML = "<strong>Pronto pra gravar.</strong> Abre a call e clica abaixo.";
    }
    startBtn.style.display = "flex";
    stopBtn.style.display = "none";
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (!startBtn.disabled) timerEl.textContent = "00:00";
  }
  if (lastTranscript) transcript.textContent = lastTranscript;
}

// Side panels não mostram prompt de mic — abre página dedicada em aba normal.
async function warmupMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (e) {
    const url = chrome.runtime.getURL("permission.html");
    await chrome.tabs.create({ url });
    throw new Error("Abri uma aba pra você autorizar o mic. Aceita o pop-up e volta aqui.");
  }
}

startBtn.addEventListener("click", async () => {
  showError("");
  startBtn.disabled = true;
  statusText.innerHTML = "<strong>Iniciando...</strong>";
  try {
    await warmupMicPermission();
    const resp = await chrome.runtime.sendMessage({ type: "start-recording" });
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
