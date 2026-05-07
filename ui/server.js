const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { adviseCommand } = require("./advisor");

const projectRoot = path.resolve(__dirname, "..");
const webRoot = __dirname;
const port = Number(process.env.PORT || 3000);
const hfToken = process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_TOKEN || "";
const hfAsrModel = process.env.HF_ASR_MODEL || "openai/whisper-small";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      return serveFile(res, path.join(webRoot, "index.html"));
    }

    if (req.method === "GET" && req.url === "/app.js") {
      return serveFile(res, path.join(webRoot, "app.js"));
    }

    if (req.method === "GET" && req.url === "/styles.css") {
      return serveFile(res, path.join(webRoot, "styles.css"));
    }

    if (req.method === "GET" && req.url === "/api/examples") {
      return sendJson(res, 200, readExamples());
    }

    if (req.method === "POST" && req.url === "/api/parse") {
      // This endpoint exposes only the Lex/Yacc parser result.
      const body = await readJsonBody(req);
      const input = typeof body.input === "string" ? body.input : "";
      const result = await runParser(input);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (req.method === "POST" && req.url === "/api/advise") {
      // The advisor runs after parsing, so invalid grammar never reaches AI.
      const body = await readJsonBody(req);
      const input = typeof body.input === "string" ? body.input : "";
      const parsed = await runParser(input);

      if (!parsed.ok) {
        return sendJson(res, 400, {
          ok: false,
          error: "Parser failed. AI advisor only runs after valid Lex/Yacc output.",
          parser: parsed,
        });
      }

      const command = extractFirstJsonObject(parsed.stdout);
      const advice = await adviseCommand(command, input);

      return sendJson(res, advice.ok ? 200 : 400, {
        ok: advice.ok,
        parser: parsed,
        command,
        advice,
      });
    }

    if (req.method === "POST" && req.url === "/api/transcribe") {
      // Audio transcription is a fallback for browsers without Web Speech support.
      const body = await readJsonBody(req);
      const result = await transcribeAudio(body);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    sendJson(res, 404, { ok: false, error: "Route not found" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`MotoRide CNL UI running at http://127.0.0.1:${port}`);
});

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { ok: false, error: "File not found" });
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

// Hugging Face Whisper style transcription is optional and needs HF_API_TOKEN.
async function transcribeAudio(body) {
  if (!hfToken) {
    return {
      ok: false,
      error:
        "Audio fallback needs HF_API_TOKEN. Set a Hugging Face token, restart the server, then try Mic again.",
    };
  }

  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "audio/webm";

  if (!audioBase64) {
    return { ok: false, error: "Missing audio payload." };
  }

  const audio = Buffer.from(audioBase64, "base64");

  const response = await fetch(`https://api-inference.huggingface.co/models/${hfAsrModel}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfToken}`,
      "Content-Type": mimeType,
    },
    body: audio,
    signal: AbortSignal.timeout(30000),
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    payload = { text };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: payload.error || `Hugging Face ASR failed with status ${response.status}.`,
      details: payload,
    };
  }

  return {
    ok: true,
    provider: "huggingface",
    model: hfAsrModel,
    text: payload.text || "",
    raw: payload,
  };
}

// The C parser prints JSON followed by a parse tree, so we extract the first JSON object.
function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) {
    throw new Error("Parser output does not contain JSON.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }

  throw new Error("Could not extract complete JSON from parser output.");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function readExamples() {
  const examplesDir = path.join(projectRoot, "examples");
  if (!fs.existsSync(examplesDir)) return [];

  return fs
    .readdirSync(examplesDir)
    .filter((name) => name.endsWith(".txt"))
    .sort()
    .map((name) => ({
      name,
      content: fs.readFileSync(path.join(examplesDir, name), "utf8"),
    }));
}

function runParser(input) {
  return new Promise((resolve) => {
    const exeName = process.platform === "win32" ? "motoride.exe" : "motoride";
    const exePath = path.join(projectRoot, exeName);

    if (!fs.existsSync(exePath)) {
      resolve({
        ok: false,
        stdout: "",
        stderr: `${exeName} not found. Ruleaza mai intai scripts/build.ps1.`,
        exitCode: null,
      });
      return;
    }

    const child = spawn(exePath, [], {
      cwd: projectRoot,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        child.kill();
      }
    }, 5000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        exitCode: code,
      });
    });

    child.stdin.write(input.endsWith("\n") ? input : `${input}\n`);
    child.stdin.end();
  });
}
