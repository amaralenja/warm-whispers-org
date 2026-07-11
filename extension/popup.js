const DEFAULT_ENDPOINT = "https://warm-whispers-org.lovable.app/api/public/transcribe";

const $ = (id) => document.getElementById(id);
const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
const dot = $("dot");
const statusText = $("statusText");
const transcript = $("transcript");
const endpointInput = $("endpoint");

async function refreshUi() {
  const { recording, lastTranscript, endpoint } = await chrome.storage.local.get([
    "recording",
    "lastTranscript",
    "endpoint",
  ]);
  endpointInput.value = endpoint || DEFAULT_ENDPOINT;
  if (recording) {
    dot.className = "dot rec";
    statusText.textContent = "Gravando...";
    startBtn.style.display = "none";
    stopBtn.style.display = "block";
  } else {
    dot.className = "dot";
    statusText.textContent = "Pronto pra gravar";
    startBtn.style.display = "block";
    stopBtn.style.display = "none";
  }
  if (lastTranscript) transcript.textContent = lastTranscript;
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  statusText.textContent = "Iniciando captura...";
  try {
    const resp = await chrome.runtime.sendMessage({ type: "start-recording" });
    if (!resp?.ok) throw new Error(resp?.error || "Falha ao iniciar");
  } catch (e) {
    dot.className = "dot";
    statusText.textContent = "Erro: " + e.message;
    startBtn.disabled = false;
    return;
  }
  startBtn.disabled = false;
  refreshUi();
});

stopBtn.addEventListener("click", async () => {
  stopBtn.disabled = true;
  dot.className = "dot ok";
  statusText.textContent = "Transcrevendo (pode levar 30s)...";
  try {
    const resp = await chrome.runtime.sendMessage({ type: "stop-recording" });
    if (!resp?.ok) throw new Error(resp?.error || "Falha ao transcrever");
    transcript.textContent = resp.text || "(vazio)";
    await chrome.storage.local.set({ lastTranscript: resp.text || "" });
    statusText.textContent = "Pronto";
    dot.className = "dot";
  } catch (e) {
    statusText.textContent = "Erro: " + e.message;
    dot.className = "dot";
  }
  stopBtn.disabled = false;
  refreshUi();
});

$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(transcript.textContent || "");
  statusText.textContent = "Copiado!";
});

$("clearBtn").addEventListener("click", async () => {
  transcript.textContent = "";
  await chrome.storage.local.remove("lastTranscript");
});

$("saveEndpoint").addEventListener("click", async () => {
  await chrome.storage.local.set({ endpoint: endpointInput.value.trim() || DEFAULT_ENDPOINT });
  statusText.textContent = "Endpoint salvo";
});

refreshUi();
setInterval(refreshUi, 1500);
