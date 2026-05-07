const HF_MODEL = process.env.HF_MODEL || "facebook/bart-large-mnli";
const HF_TOKEN = process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_TOKEN || "";

// The advisor runs only after Lex/Yacc produces valid JSON.
async function adviseCommand(command, sourceText) {
  const local = buildLocalAdvice(command, sourceText);

  if (!HF_TOKEN || command.intent !== "PLAN_RIDE") {
    return local;
  }

  try {
    const hf = await runHuggingFaceZeroShot(command, sourceText);
    return mergeHuggingFaceAdvice(local, hf);
  } catch (error) {
    return {
      ...local,
      provider: "local",
      notes: [
        ...local.notes,
        `Hugging Face unavailable, used local advisor only: ${error.message}`,
      ],
    };
  }
}

// The local advisor is deterministic and works without any API key.
function buildLocalAdvice(command, sourceText) {
  if (!command || typeof command !== "object") {
    return {
      ok: false,
      provider: "local",
      error: "No parsed command available for AI advisor.",
    };
  }

  if (command.intent === "REPORT_HAZARD") {
    return adviseHazard(command);
  }

  if (command.intent !== "PLAN_RIDE") {
    return {
      ok: false,
      provider: "local",
      error: `Unsupported intent for advisor: ${command.intent}`,
    };
  }

  const features = extractRouteFeatures(command, sourceText);
  const scenicScore = scoreScenic(features);
  const riskScore = scoreRisk(features);
  const rideFit = pickRideFit(scenicScore, riskScore, features);
  const tags = buildTags(features, scenicScore, riskScore);
  const explanation = explainRoute(features, scenicScore, riskScore, rideFit);

  return {
    ok: true,
    provider: "local",
    mode: "route-advisor",
    scenicScore,
    riskScore,
    rideFit,
    tags,
    explanation,
    features,
    notes: [
      "Local advisor uses parsed Lex/Yacc JSON and transparent scoring rules.",
      "It does not fetch real map geometry unless the optional MotoRide route API is added later.",
    ],
  };
}

// Hazard advice uses the normalized severity from the parser.
function adviseHazard(command) {
  const severity = command.severity || "medium";
  const riskScore = severity === "high" ? 82 : severity === "medium" ? 55 : 28;

  return {
    ok: true,
    provider: "local",
    mode: "hazard-advisor",
    scenicScore: null,
    riskScore,
    rideFit: severity === "high" ? "avoid-or-slow-down" : "caution",
    tags: ["hazard-report", `${severity}-severity`],
    explanation: [
      `Reported ${command.hazardType || "hazard"} on ${command.road || "unknown road"}.`,
      `Severity is classified as ${severity}, so riders should be warned before route selection.`,
    ].join(" "),
    features: {
      hazardType: command.hazardType || null,
      road: command.road || null,
      near: command.near || null,
      severity,
    },
    notes: ["Hazard advice is based on the structured REPORT_HAZARD command."],
  };
}

// These features are simple until real route geometry is connected.
function extractRouteFeatures(command, sourceText) {
  const start = command.start || "";
  const destination = command.destination || "";
  const style = command.style || "unspecified";
  const filters = command.filters || {};
  const weather = command.weather || {};
  const risk = command.risk || {};
  const text = `${sourceText || ""} ${start} ${destination}`.toLowerCase();

  return {
    start,
    destination,
    style,
    avoidHighways: Boolean(filters.avoidHighways),
    preferCurves: Boolean(filters.preferCurves),
    maxDistanceKm: normalizeDistance(filters.maxDistance),
    visibilityKm: normalizeWeatherValue(weather.visibility),
    rainPercent: normalizeWeatherValue(weather.rain),
    temperatureMin: weather.temperature?.min ?? null,
    temperatureMax: weather.temperature?.max ?? null,
    maxSeverity: risk.maxSeverity ?? null,
    useMlModel: Boolean(risk.useMlModel),
    mountainHint: containsAny(text, [
      "brasov",
      "sinaia",
      "transfagarasan",
      "transalpina",
      "rucar",
      "bran",
      "predeal",
      "carpathian",
      "carpati",
    ]),
    cityHeavyHint: containsAny(text, ["bucuresti", "bucharest", "urban", "city"]),
    knownScenicHint: containsAny(text, [
      "sinaia",
      "brasov",
      "turda",
      "transfagarasan",
      "transalpina",
      "cheile",
      "defileu",
    ]),
  };
}

// Scenic score rewards choices that usually make motorcycle rides more enjoyable.
function scoreScenic(features) {
  let score = 42;

  if (features.avoidHighways) score += 18;
  if (features.preferCurves) score += 20;
  if (features.mountainHint) score += 16;
  if (features.knownScenicHint) score += 12;
  if (features.style === "adventure") score += 10;
  if (features.style === "touring") score += 8;
  if (features.style === "relaxed") score += 5;
  if (!features.avoidHighways) score -= 8;
  if (features.cityHeavyHint) score -= 12;
  if (features.maxDistanceKm && features.maxDistanceKm < 60) score -= 6;

  return clampScore(score);
}

// Risk score is based on style, weather, and parsed safety constraints.
function scoreRisk(features) {
  let score = 30;

  if (features.preferCurves) score += 12;
  if (features.style === "sport") score += 12;
  if (features.style === "adventure") score += 8;
  if (features.rainPercent !== null && features.rainPercent >= 30) score += 18;
  if (features.visibilityKm !== null && features.visibilityKm < 5) score += 18;
  if (features.temperatureMin !== null && features.temperatureMin < 5) score += 8;
  if (features.temperatureMax !== null && features.temperatureMax > 32) score += 6;
  if (features.maxSeverity !== null && features.maxSeverity <= 2) score -= 8;
  if (features.avoidHighways) score -= 4;
  if (features.useMlModel) score -= 2;

  return clampScore(score);
}

function pickRideFit(scenicScore, riskScore, features) {
  if (riskScore >= 72) return "risky-ride";
  if (scenicScore >= 72 && riskScore <= 55) return "strong-scenic-fit";
  if (scenicScore >= 58) return "moderate-scenic-fit";
  if (features.avoidHighways && features.style === "relaxed") return "relaxed-fit";
  return "functional-route";
}

function buildTags(features, scenicScore, riskScore) {
  const tags = [];

  if (scenicScore >= 72) tags.push("scenic");
  if (scenicScore < 45) tags.push("not-very-scenic");
  if (features.avoidHighways) tags.push("avoids-highways");
  if (features.preferCurves) tags.push("curve-friendly");
  if (features.mountainHint) tags.push("mountain-context");
  if (riskScore >= 65) tags.push("higher-risk");
  if (riskScore <= 38) tags.push("lower-risk");
  if (features.useMlModel) tags.push("ml-risk-requested");

  return tags;
}

function explainRoute(features, scenicScore, riskScore, rideFit) {
  const parts = [
    `The parsed route from ${features.start || "unknown start"} to ${features.destination || "unknown destination"} is classified as ${rideFit}.`,
    `Scenic score is ${scenicScore}/100 and risk score is ${riskScore}/100.`,
  ];

  if (features.avoidHighways) {
    parts.push("Avoiding highways improves scenic potential for motorcycle rides.");
  }

  if (features.preferCurves) {
    parts.push("Curve preference increases scenic appeal, but also adds riding complexity.");
  }

  if (features.mountainHint || features.knownScenicHint) {
    parts.push("Known mountain or scenic place hints increase the scenic score.");
  }

  if (features.rainPercent !== null || features.visibilityKm !== null) {
    parts.push("Weather constraints were included in the risk estimate.");
  }

  return parts.join(" ");
}

// Hugging Face is optional and acts as a semantic classification layer.
async function runHuggingFaceZeroShot(command, sourceText) {
  const description = [
    `Motorcycle route from ${command.start || "unknown"} to ${command.destination || "unknown"}.`,
    `Style: ${command.style || "unspecified"}.`,
    `Filters: ${JSON.stringify(command.filters || {})}.`,
    `Weather: ${JSON.stringify(command.weather || {})}.`,
    `Original request: ${sourceText || ""}`,
  ].join(" ");

  const response = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: description,
      parameters: {
        candidate_labels: [
          "scenic motorcycle route",
          "relaxed motorcycle route",
          "technical mountain route",
          "highway-heavy route",
          "risky motorcycle route",
        ],
      },
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`HF status ${response.status}`);
  }

  return response.json();
}

function mergeHuggingFaceAdvice(local, hf) {
  const labels = Array.isArray(hf.labels) ? hf.labels : [];
  const scores = Array.isArray(hf.scores) ? hf.scores : [];
  const hfRanking = labels.map((label, index) => ({
    label,
    score: Number(scores[index] || 0),
  }));

  return {
    ...local,
    provider: "local+huggingface",
    huggingFace: {
      model: HF_MODEL,
      ranking: hfRanking,
    },
    notes: [
      ...local.notes,
      "Hugging Face zero-shot classification was used as an optional semantic layer.",
    ],
  };
}

function normalizeDistance(distance) {
  if (!distance || typeof distance.value !== "number") return null;
  if ((distance.unit || "km") === "m") return distance.value / 1000;
  return distance.value;
}

function normalizeWeatherValue(value) {
  if (!value || typeof value.value !== "number") return null;
  return value.value;
}

function containsAny(text, words) {
  return words.some((word) => text.includes(word));
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = {
  adviseCommand,
};
