const inputText = document.querySelector("#inputText");
const parseButton = document.querySelector("#parseButton");
const advisorButton = document.querySelector("#advisorButton");
const clearButton = document.querySelector("#clearButton");
const reloadExamples = document.querySelector("#reloadExamples");
const examplesList = document.querySelector("#examplesList");
const stdoutBox = document.querySelector("#stdout");
const stderrBox = document.querySelector("#stderr");
const statusBox = document.querySelector("#status");
const copyOutput = document.querySelector("#copyOutput");
const speechLanguage = document.querySelector("#speechLanguage");
const micButton = document.querySelector("#micButton");
const stopMicButton = document.querySelector("#stopMicButton");
const speechPreview = document.querySelector("#speechPreview");
const autoPeriod = document.querySelector("#autoPeriod");
const advisorProvider = document.querySelector("#advisorProvider");
const scenicScore = document.querySelector("#scenicScore");
const riskScore = document.querySelector("#riskScore");
const rideFit = document.querySelector("#rideFit");
const advisorExplanation = document.querySelector("#advisorExplanation");
const advisorTags = document.querySelector("#advisorTags");
const advisorJson = document.querySelector("#advisorJson");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let permissionStream = null;
let speechStartTimer = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecordingFallback = false;

const defaultCommand =
  "Vreau tura relaxata din Brasov pana in Sinaia fara autostrada prefera viraje vizibilitate > 5 km ploaie < 30 temperatura intre 10 si 28 C distanta maxim 180 km risc maxim 2 model_ml da.";

inputText.value = defaultCommand;

parseButton.addEventListener("click", parseCommand);
advisorButton.addEventListener("click", runAdvisor);
clearButton.addEventListener("click", () => {
  inputText.value = "";
  stdoutBox.textContent = "";
  stderrBox.textContent = "";
  resetAdvisor();
  setStatus("Ready", "neutral");
});
reloadExamples.addEventListener("click", loadExamples);
copyOutput.addEventListener("click", async () => {
  await navigator.clipboard.writeText(stdoutBox.textContent);
  setStatus("Output copied", "ok");
});
micButton.addEventListener("click", startSpeech);
stopMicButton.addEventListener("click", stopSpeech);

setupSpeechRecognition();
loadExamples();

async function loadExamples() {
  setStatus("Loading examples", "neutral");
  examplesList.innerHTML = "";

  try {
    const response = await fetch("/api/examples");
    const examples = await response.json();

    for (const example of examples) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "example-button";
      button.innerHTML = `<span>${escapeHtml(example.name)}</span><small>${escapeHtml(
        compact(example.content),
      )}</small>`;
      button.addEventListener("click", () => {
        inputText.value = example.content.trim();
        parseCommand();
      });
      examplesList.appendChild(button);
    }

    setStatus(`${examples.length} examples loaded`, "ok");
  } catch (error) {
    setStatus("Could not load examples", "error");
    stderrBox.textContent = error.message;
  }
}

async function parseCommand() {
  // This action shows the raw Lex/Yacc output.
  const input = inputText.value.trim();
  if (!input) {
    setStatus("Input is empty", "error");
    return;
  }

  parseButton.disabled = true;
  setStatus("Parsing", "neutral");
  stdoutBox.textContent = "";
  stderrBox.textContent = "";

  try {
    const response = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });

    const result = await response.json();
    stdoutBox.textContent = result.stdout || "";
    stderrBox.textContent = result.stderr || `Exit code: ${result.exitCode}`;
    setStatus(result.ok ? "Parsed successfully" : "Parser error", result.ok ? "ok" : "error");
  } catch (error) {
    stderrBox.textContent = error.message;
    setStatus("Request failed", "error");
  } finally {
    parseButton.disabled = false;
  }
}

async function runAdvisor() {
  // This action parses first, then analyzes the normalized JSON.
  const input = inputText.value.trim();
  if (!input) {
    setStatus("Input is empty", "error");
    return;
  }

  advisorButton.disabled = true;
  setStatus("Running advisor", "neutral");
  advisorExplanation.textContent = "Analyzing parsed command...";
  advisorJson.textContent = "";

  try {
    const response = await fetch("/api/advise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });

    const result = await response.json();

    if (!result.ok) {
      stdoutBox.textContent = result.parser?.stdout || "";
      stderrBox.textContent = result.parser?.stderr || result.error || "Advisor failed";
      resetAdvisor();
      setStatus("Advisor error", "error");
      return;
    }

    stdoutBox.textContent = result.parser.stdout || "";
    stderrBox.textContent = result.parser.stderr || `Exit code: ${result.parser.exitCode}`;
    renderAdvisor(result.advice, result.command);
    setStatus("Advisor ready", "ok");
  } catch (error) {
    advisorExplanation.textContent = error.message;
    setStatus("Advisor request failed", "error");
  } finally {
    advisorButton.disabled = false;
  }
}

function renderAdvisor(advice, command) {
  advisorProvider.textContent = advice.provider || "local";
  scenicScore.textContent = advice.scenicScore === null ? "N/A" : `${advice.scenicScore}/100`;
  riskScore.textContent = advice.riskScore === null ? "N/A" : `${advice.riskScore}/100`;
  rideFit.textContent = advice.rideFit || "-";
  advisorExplanation.textContent = advice.explanation || "No explanation returned.";
  advisorTags.innerHTML = "";

  for (const tag of advice.tags || []) {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = tag;
    advisorTags.appendChild(el);
  }

  advisorJson.textContent = JSON.stringify({ command, advice }, null, 2);
}

function resetAdvisor() {
  advisorProvider.textContent = "Not run yet";
  scenicScore.textContent = "-";
  riskScore.textContent = "-";
  rideFit.textContent = "-";
  advisorExplanation.textContent = "Run the advisor after writing or dictating a valid command.";
  advisorTags.innerHTML = "";
  advisorJson.textContent = "";
}

function setupSpeechRecognition() {
  // Web Speech works best in Chrome and Edge.
  if (!SpeechRecognition) {
    stopMicButton.disabled = true;
    speechPreview.textContent =
      "Speech recognition is not supported in this browser. Use Chrome or Microsoft Edge.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    clearSpeechStartTimer();
    isListening = true;
    micButton.classList.add("is-recording");
    micButton.disabled = true;
    stopMicButton.disabled = false;
    micButton.querySelector("span").textContent = "Listening";
    speechPreview.textContent = "Listening...";
    setStatus("Listening", "neutral");
  });

  recognition.addEventListener("result", (event) => {
    let finalText = "";
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.trim();
      if (event.results[i].isFinal) {
        finalText += ` ${transcript}`;
      } else {
        interimText += ` ${transcript}`;
      }
    }

    if (finalText.trim()) {
      appendRecognizedText(finalText);
    }

    speechPreview.textContent = interimText.trim()
      ? `Heard: ${normalizeSpeechText(interimText.trim())}`
      : "Listening...";
  });

  recognition.addEventListener("end", () => {
    clearSpeechStartTimer();
    if (isRecordingFallback) return;
    isListening = false;
    micButton.classList.remove("is-recording");
    micButton.disabled = false;
    stopMicButton.disabled = true;
    micButton.querySelector("span").textContent = "Mic";
    releaseMicrophone();
    finishRecognizedCommand();
    speechPreview.textContent = inputText.value.trim()
      ? "Speech inserted in the command box"
      : "Microphone ready";
    setStatus("Speech stopped", "ok");
  });

  recognition.addEventListener("error", (event) => {
    clearSpeechStartTimer();
    isListening = false;
    micButton.classList.remove("is-recording");
    micButton.disabled = false;
    stopMicButton.disabled = true;
    micButton.querySelector("span").textContent = "Mic";
    releaseMicrophone();
    speechPreview.textContent = explainSpeechError(event.error);
    setStatus("Speech error", "error");
  });

  stopMicButton.disabled = true;
  speechPreview.textContent = "Press Mic to request permission and start listening";
}

async function startSpeech() {
  // The microphone starts only after the user presses the Mic button.
  if (!SpeechRecognition) {
    speechPreview.textContent =
      "Speech recognition is not supported in this browser. Try Chrome or Microsoft Edge.";
    setStatus("Speech unsupported", "error");
    return;
  }

  if (!recognition || isListening) return;

  micButton.disabled = true;
  stopMicButton.disabled = true;
  speechPreview.textContent = "Requesting microphone permission...";
  setStatus("Requesting mic", "neutral");

  try {
    await requestMicrophonePermission();
    recognition.lang = speechLanguage.value;
    recognition.start();
    speechStartTimer = setTimeout(() => {
      if (isListening) return;

      try {
        recognition.abort();
      } catch {
        // Some browsers throw if recognition never actually started.
      }

      micButton.classList.remove("is-recording");
      micButton.disabled = false;
      stopMicButton.disabled = true;
      micButton.querySelector("span").textContent = "Mic";
      speechPreview.textContent =
        "Browser speech recognition did not start. Switching to recorded-audio fallback...";
      startRecordingFallback();
    }, 4000);
  } catch (error) {
    micButton.disabled = false;
    stopMicButton.disabled = true;
    releaseMicrophone();
    speechPreview.textContent = explainPermissionError(error);
    setStatus("Mic permission blocked", "error");
  }
}

function stopSpeech() {
  if (isRecordingFallback) {
    stopRecordingFallback();
    return;
  }

  if (!recognition || !isListening) return;
  speechPreview.textContent = "Stopping microphone...";
  recognition.stop();
}

async function requestMicrophonePermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return;
  }

  try {
    permissionStream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true }),
      new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
  } catch (error) {
    throw error;
  }

  releaseMicrophone();
}

function clearSpeechStartTimer() {
  if (!speechStartTimer) return;
  clearTimeout(speechStartTimer);
  speechStartTimer = null;
}

function releaseMicrophone() {
  if (!permissionStream) return;

  for (const track of permissionStream.getTracks()) {
    track.stop();
  }

  permissionStream = null;
}

function explainPermissionError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Microphone permission was denied. Allow microphone access for localhost and press Mic again.";
  }

  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "No microphone was found on this device.";
  }

  if (error?.name === "NotReadableError") {
    return "The microphone is already in use by another app.";
  }

  return `Could not start microphone: ${error?.message || error}`;
}

function explainSpeechError(error) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Speech recognition permission was blocked. Allow microphone access and try again.";
  }

  if (error === "no-speech") {
    return "No speech was detected. Press Mic and try speaking again.";
  }

  if (error === "audio-capture") {
    return "The browser could not capture audio from the microphone.";
  }

  if (error === "network") {
    return "Speech recognition service reported a network error.";
  }

  return `Speech error: ${error}`;
}

async function startRecordingFallback() {
  // This fallback records audio and sends it to the server for transcription.
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    speechPreview.textContent =
      "This browser cannot record audio for fallback transcription. Try Chrome or Microsoft Edge.";
    setStatus("Audio fallback unavailable", "error");
    return;
  }

  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(permissionStream);
    isRecordingFallback = true;

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", transcribeRecordedAudio);
    mediaRecorder.start();

    micButton.classList.add("is-recording");
    micButton.disabled = true;
    stopMicButton.disabled = false;
    micButton.querySelector("span").textContent = "Recording";
    speechPreview.textContent =
      "Recording audio fallback. Speak now, then press Stop to transcribe.";
    setStatus("Recording audio", "neutral");
  } catch (error) {
    isRecordingFallback = false;
    releaseMicrophone();
    micButton.disabled = false;
    stopMicButton.disabled = true;
    speechPreview.textContent = explainPermissionError(error);
    setStatus("Mic permission blocked", "error");
  }
}

function stopRecordingFallback() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  speechPreview.textContent = "Uploading audio for transcription...";
  stopMicButton.disabled = true;
  mediaRecorder.stop();
}

async function transcribeRecordedAudio() {
  const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
  isRecordingFallback = false;
  mediaRecorder = null;
  recordedChunks = [];
  releaseMicrophone();
  micButton.classList.remove("is-recording");
  micButton.disabled = false;
  stopMicButton.disabled = true;
  micButton.querySelector("span").textContent = "Mic";

  try {
    const audioBase64 = await blobToBase64(blob);
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64,
        mimeType: blob.type || "audio/webm",
        language: speechLanguage.value,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      speechPreview.textContent = result.error || "Audio transcription failed.";
      setStatus("Transcription unavailable", "error");
      return;
    }

    appendRecognizedText(result.text);
    finishRecognizedCommand();
    speechPreview.textContent = `Transcribed: ${normalizeSpeechText(result.text)}`;
    setStatus("Speech transcribed", "ok");
  } catch (error) {
    speechPreview.textContent = `Audio transcription failed: ${error.message}`;
    setStatus("Transcription failed", "error");
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function appendRecognizedText(text) {
  const normalized = normalizeSpeechText(text);
  const current = inputText.value.trim();
  inputText.value = current ? `${current} ${normalized}` : normalized;
}

function finishRecognizedCommand() {
  if (!autoPeriod.checked) return;

  const current = inputText.value.trim();
  if (!current || /[.;]$/.test(current)) return;

  inputText.value = `${current}.`;
}

function normalizeSpeechText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00df/g, "ss")
    .replace(/\u1e9e/g, "SS")
    .replace(/[\u2019']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function setStatus(text, kind) {
  statusBox.textContent = text;
  statusBox.dataset.kind = kind;
}

function compact(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
