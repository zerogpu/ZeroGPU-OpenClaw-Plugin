import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 8787);
const CATALOG_PATH = path.join(__dirname, "model-catalog.json");
const TRACKING_PATH = path.join(__dirname, "tracking-events.jsonl");
const CATALOG_REFRESH_MS = 60_000;
const ESTIMATED_LLM_COST_PER_1K = Number(process.env.ESTIMATED_LLM_COST_PER_1K || 0.01);

let catalogCache = { updatedAt: null, models: [] };
let lastCatalogLoad = 0;

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

async function loadCatalog(force = false) {
  const now = Date.now();
  if (!force && now - lastCatalogLoad < CATALOG_REFRESH_MS && catalogCache.models.length > 0) {
    return catalogCache;
  }

  const raw = await fs.readFile(CATALOG_PATH, "utf8");
  catalogCache = JSON.parse(raw);
  lastCatalogLoad = now;
  return catalogCache;
}

function detectTaskType(messages, taskTypeHint) {
  if (taskTypeHint) return taskTypeHint;
  const text = (messages || [])
    .map((m) => String(m.content || ""))
    .join("\n")
    .toLowerCase();

  if (text.includes("classify") || text.includes("label") || text.includes("category")) {
    return "classification";
  }
  if (text.includes("extract") || text.includes("pull out") || text.includes("parse")) {
    return "extraction";
  }
  if (text.includes("follow-up") || text.includes("follow up") || text.includes("next question")) {
    return "follow_up_generation";
  }
  if (text.includes("summarize") || text.includes("summary") || text.includes("tl;dr")) {
    return "summarization";
  }
  return "summarization";
}

function selectModel(catalog, taskType) {
  const candidates = catalog.models.filter((m) => (m.supportedTaskTypes || []).includes(taskType));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.costPer1kTokensUsd - b.costPer1kTokensUsd || a.avgLatencyMs - b.avgLatencyMs);
  return candidates[0];
}

function estimateTokens(messages) {
  const chars = (messages || []).map((m) => String(m.content || "")).join(" ").length;
  return Math.max(1, Math.ceil(chars / 4));
}

function buildMockOutput(taskType, messages) {
  const userText = (messages || [])
    .filter((m) => m.role === "user")
    .map((m) => String(m.content || ""))
    .join("\n")
    .slice(0, 240);

  switch (taskType) {
    case "classification":
      return `Predicted class: general_request\nReason: message appears informational.\nInput preview: ${userText}`;
    case "extraction":
      return JSON.stringify(
        {
          entities: [],
          key_points: [userText || "No user text provided."],
        },
        null,
        2
      );
    case "follow_up_generation":
      return `1) What is your target output format?\n2) What constraints should I apply?\n3) Any examples to follow?`;
    case "summarization":
    default:
      return `- Main intent: user requests assistance.\n- Input preview: ${userText}\n- Suggested next step: execute task-specific action.`;
  }
}

async function appendTrackingEvent(event) {
  await fs.appendFile(TRACKING_PATH, `${JSON.stringify(event)}\n`, "utf8");
}

async function readTrackingEvents(limit = 100) {
  try {
    const raw = await fs.readFile(TRACKING_PATH, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function toOpenAiLikeResponse({ modelId, content, promptTokens, completionTokens }) {
  return {
    id: `zgpu_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "zerogpu-plugin" });
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      const catalog = await loadCatalog();
      return sendJson(res, 200, catalog);
    }

    if (req.method === "POST" && url.pathname === "/v1/zerogpu/chat/completions") {
      const body = await parseJsonBody(req);
      const messages = body.messages || [];
      const taskType = detectTaskType(messages, body?.metadata?.taskTypeHint);
      const catalog = await loadCatalog();
      const selectedModel = selectModel(catalog, taskType);
      if (!selectedModel) {
        return sendJson(res, 400, { error: `No model available for task type: ${taskType}` });
      }

      const startedAt = Date.now();
      const promptTokens = estimateTokens(messages);
      const completionText = buildMockOutput(taskType, messages);
      const completionTokens = estimateTokens([{ content: completionText }]);
      const totalTokens = promptTokens + completionTokens;

      const zerogpuCost = (totalTokens / 1000) * selectedModel.costPer1kTokensUsd;
      const estimatedLlmCost = (totalTokens / 1000) * ESTIMATED_LLM_COST_PER_1K;
      const savings = Math.max(0, estimatedLlmCost - zerogpuCost);
      const latencyMs = Date.now() - startedAt;

      const event = {
        timestamp: new Date().toISOString(),
        taskType,
        model: selectedModel.id,
        latencyMs,
        totalTokens,
        zerogpuCostUsd: Number(zerogpuCost.toFixed(8)),
        estimatedLlmCostUsd: Number(estimatedLlmCost.toFixed(8)),
        savingsUsd: Number(savings.toFixed(8)),
      };

      appendTrackingEvent(event).catch(() => {});

      return sendJson(
        res,
        200,
        toOpenAiLikeResponse({
          modelId: selectedModel.id,
          content: completionText,
          promptTokens,
          completionTokens,
        })
      );
    }

    if (req.method === "GET" && url.pathname === "/dashboard/events") {
      const limit = Number(url.searchParams.get("limit") || 50);
      const events = await readTrackingEvents(limit);
      return sendJson(res, 200, { count: events.length, events });
    }

    if (req.method === "GET" && url.pathname === "/dashboard/summary") {
      const events = await readTrackingEvents(10_000);
      const totals = events.reduce(
        (acc, e) => {
          acc.requests += 1;
          acc.totalSavingsUsd += e.savingsUsd || 0;
          acc.totalZeroGpuCostUsd += e.zerogpuCostUsd || 0;
          acc.totalEstimatedLlmCostUsd += e.estimatedLlmCostUsd || 0;
          acc.avgLatencyMs += e.latencyMs || 0;
          acc.byTaskType[e.taskType] = (acc.byTaskType[e.taskType] || 0) + 1;
          return acc;
        },
        {
          requests: 0,
          totalSavingsUsd: 0,
          totalZeroGpuCostUsd: 0,
          totalEstimatedLlmCostUsd: 0,
          avgLatencyMs: 0,
          byTaskType: {},
        }
      );

      if (totals.requests > 0) {
        totals.avgLatencyMs = Number((totals.avgLatencyMs / totals.requests).toFixed(2));
      }

      totals.totalSavingsUsd = Number(totals.totalSavingsUsd.toFixed(8));
      totals.totalZeroGpuCostUsd = Number(totals.totalZeroGpuCostUsd.toFixed(8));
      totals.totalEstimatedLlmCostUsd = Number(totals.totalEstimatedLlmCostUsd.toFixed(8));

      return sendJson(res, 200, totals);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: "Internal server error", detail: String(error.message || error) });
  }
});

server.listen(PORT, () => {
  console.log(`zerogpu plugin listening on http://localhost:${PORT}`);
});
