let recorder = null;
let chunks = [];
let audioCtx = null;
let tabStream = null;
let micStream = null;
let currentEndpoint = null;
let stopResolver = null;

async function startCapture(streamId, endpoint) {
  currentEndpoint = endpoint;
  chunks = [];

  // Audio da aba
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
    video: false,
  });

  // Mic
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    micStream = null; // segue só com áudio da aba
  }

  // Reproduz o audio da aba de volta pro usuário (senão MediaStreamAudioSourceNode silencia a aba)
  audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  const tabSrc = audioCtx.createMediaStreamSource(tabStream);
  tabSrc.connect(dest);
  tabSrc.connect(audioCtx.destination); // devolve pro speaker

  if (micStream) {
    const micSrc = audioCtx.createMediaStreamSource(micStream);
    micSrc.connect(dest);
  }

  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  recorder = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 96000 });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    try {
      const blob = new Blob(chunks, { type: mime });
      const text = await uploadForTranscription(blob, currentEndpoint);
      stopResolver?.({ ok: true, text });
    } catch (e) {
      stopResolver?.({ ok: false, error: String(e?.message || e) });
    } finally {
      cleanup();
    }
  };
  recorder.start(); // sem timeslice = 1 blob final decodificável
}

function cleanup() {
  try { tabStream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { micStream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { audioCtx?.close(); } catch {}
  recorder = null;
  tabStream = null;
  micStream = null;
  audioCtx = null;
  chunks = [];
}

async function uploadForTranscription(blob, endpoint) {
  if (!blob || blob.size < 2048) throw new Error("Gravação vazia");
  const fd = new FormData();
  fd.append("file", blob, "call.webm");
  const res = await fetch(endpoint, { method: "POST", body: fd });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Servidor ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.text || "";
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "offscreen-start") {
        await startCapture(msg.streamId, msg.endpoint);
        sendResponse({ ok: true });
      } else if (msg.type === "offscreen-stop") {
        if (!recorder) return sendResponse({ ok: false, error: "Nada gravando" });
        const done = new Promise((resolve) => { stopResolver = resolve; });
        recorder.stop();
        const result = await done;
        sendResponse(result);
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});
