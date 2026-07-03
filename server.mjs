import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const env = await loadEnv();
const port = Number(process.env.PORT || env.PORT || 8000);
const qwenModel = process.env.QWEN_MODEL || env.QWEN_MODEL || "qwen3.7-plus";
const qwenBaseUrl =
  process.env.QWEN_BASE_URL || env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const qwenApiKey = process.env.DASHSCOPE_API_KEY || env.DASHSCOPE_API_KEY || "";

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendCors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/qwen-health" && req.method === "GET") {
      sendJson(res, {
        configured: Boolean(qwenApiKey && !qwenApiKey.includes("your_")),
        model: qwenModel,
        acceptsClientKey: true,
      });
      return;
    }

    if (url.pathname === "/api/qwen-report" && req.method === "POST") {
      await handleQwenReport(req, res);
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, { error: error.message || "Server error" }, 500);
  }
});

server.listen(port, () => {
  console.log(`Energy Mix Agent running at http://localhost:${port}`);
  console.log(qwenApiKey ? `Qwen proxy enabled with model ${qwenModel}` : "Qwen proxy disabled: missing DASHSCOPE_API_KEY");
});

async function handleQwenReport(req, res) {
  const body = await readJsonBody(req);
  const clientApiKey = cleanEnvValue(body.apiKey);
  const effectiveApiKey = clientApiKey || qwenApiKey;
  const effectiveModel = cleanEnvValue(body.model) || qwenModel;
  if (!effectiveApiKey || effectiveApiKey.includes("your_")) {
    sendJson(res, { error: "请在 .env 中配置 DASHSCOPE_API_KEY，或在页面输入自己的 API Key。" }, 400);
    return;
  }

  const payload = body.analysisSummary || {};
  const question = body.question || "";
  const localAnswer = body.localAnswer || "";

  const userPrompt = [
    "请基于下面的结构化能源数据分析结果，生成中文回答。",
    "要求：",
    "1. 直接回答用户问题，不要泛泛介绍。",
    "2. 只能引用给定数据，不要编造政策、新闻或外部事实。",
    "3. 说明关键指标依据，例如可再生占比、风光占比、化石占比、变化幅度、异常数量或预测趋势。",
    "4. 输出适合课程项目展示，语气专业、简洁。",
    "5. 可以使用 Markdown 的标题、加粗和列表组织内容。",
    "",
    `用户问题：${question || "请生成本次智能体分析结论。"}`,
    localAnswer ? `本地工具初步回答：${localAnswer}` : "",
    `结构化分析结果：${JSON.stringify(payload, null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(`${qwenBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${effectiveApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: effectiveModel,
      messages: [
        {
          role: "system",
          content:
            "你是多国家电力能源结构分析智能体的报告生成模块。你基于工具计算结果生成结论，不直接处理原始 CSV。",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    sendJson(
      res,
      {
        error: result?.error?.message || result?.message || `Qwen request failed with ${response.status}`,
      },
      response.status,
    );
    return;
  }

  const text = result?.choices?.[0]?.message?.content || "";
  sendJson(res, { text, model: effectiveModel });
}

async function serveStatic(pathname, res) {
  const safePath = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(rootDir, safePath);
  if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
    sendJson(res, { error: "Not found" }, 404);
    return;
  }
  const content = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store",
  });
  res.end(content);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function loadEnv() {
  const filePath = join(rootDir, ".env");
  if (!existsSync(filePath)) return {};
  const text = await readFile(filePath, "utf8");
  return text.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return acc;
    const index = trimmed.indexOf("=");
    if (index === -1) return acc;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    acc[key] = value;
    return acc;
  }, {});
}

function cleanEnvValue(value) {
  return value == null ? "" : String(value).trim().replace(/^['"]|['"]$/g, "");
}

function sendJson(res, payload, status = 200) {
  sendCors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function contentType(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };
  return types[extname(filePath)] || "application/octet-stream";
}
