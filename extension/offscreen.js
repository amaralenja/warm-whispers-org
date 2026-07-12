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

  // 1) Áudio da aba (constraints legadas exigidas pelo tabCapture)
  try {
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
      },
      video: false,
    });
  } catch (e) {
    throw new Error("Não peguei o áudio da aba: " + (e.message || e));
  }

  // 2) Microfone (opcional — segue mesmo se falhar)
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (e) {
    micStream = null;
  }

  if (!tabStream && !micStream) throw new Error("Sem fonte de áudio disponível");

  // 3) Mixdown mic + aba
  audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  if (tabStream) {
    const tabSrc = audioCtx.createMediaStreamSource(tabStream);
    tabSrc.connect(dest);
    // IMPORTANTE: devolve pro speaker senão a aba fica muda
    tabSrc.connect(audioCtx.destination);
  }
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
  recorder.start();
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
  if (!blob || blob.size < 2048) throw new Error("Gravação vazia (menos de 2KB)");
  const fd = new FormData();
  fd.append("file", blob, "call.webm");
  const res = await fetch(endpoint, { method: "POST", body: fd });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Servidor ${res.status}: ${bodyText.slice(0, 200)}`);
  }
  let json;
  try { json = JSON.parse(bodyText); } catch { throw new Error("Resposta inválida do servidor"); }
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
