const askButton = document.getElementById("ask");
const statusBox = document.getElementById("status");

function setStatus(message, className = "") {
  statusBox.className = className ? `box ${className}` : "box";
  statusBox.textContent = message;
}

async function checkPermission() {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const permission = await navigator.permissions.query({ name: "microphone" });
    return permission.state;
  } catch {
    return "unknown";
  }
}

async function requestMicrophone() {
  askButton.disabled = true;
  setStatus("Solicitando permissão do microfone...");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    setStatus("✓ Microfone autorizado! Pode fechar esta aba e voltar ao painel lateral da Multium Meet.", "ok");
    await chrome.storage.local.set({ micPermissionGrantedAt: Date.now() });
    setTimeout(() => window.close(), 1400);
  } catch (error) {
    const message = String(error?.message || error);
    setStatus(
      `Não consegui liberar o microfone.\n\n${message}\n\nSe apareceu Bloqueado/Denied, remova a extensão e carregue a pasta nova da versão 0.3.0, ou mude a permissão de microfone nas configurações do site da extensão.`,
      "err",
    );
    askButton.disabled = false;
  }
}

askButton.addEventListener("click", requestMicrophone);

checkPermission().then((state) => {
  if (state === "granted") {
    setStatus("✓ Microfone já está autorizado. Pode fechar esta aba e iniciar a gravação no painel lateral.", "ok");
    askButton.disabled = true;
  } else if (state === "denied") {
    setStatus("Microfone está bloqueado para esta extensão. Ajuste a permissão no Chrome ou remova e carregue a extensão novamente.", "err");
  }
});