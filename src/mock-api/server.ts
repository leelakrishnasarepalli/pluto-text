import http from "node:http";
import { generationRequestSchema } from "../shared/types.ts";
import { loadLocalApiEnv } from "./env.ts";
import { generateLocalDraft } from "./mockGenerator.ts";

const HOST = "127.0.0.1";
const PORT = 8787;

loadLocalApiEnv();

function isTraceEnabled(): boolean {
  const value = process.env.LOCAL_API_TRACE;
  return value === "1" || value === "true";
}

function emitTrace(event: string, details: Record<string, unknown>): void {
  if (!isTraceEnabled()) {
    return;
  }

  console.log(
    `[local-api trace] ${event} ${JSON.stringify({
      ts: new Date().toISOString(),
      ...details,
    })}`,
  );
}

function sendJson(
  response: http.ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function readRequestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const startedAt = Date.now();

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (request.method !== "POST" || request.url !== "/generate") {
      sendJson(response, 404, {
        error: "Not found.",
      });
      return;
    }

    const rawBody = await readRequestBody(request);
    const parsedBody = generationRequestSchema.safeParse(JSON.parse(rawBody || "{}"));

    if (!parsedBody.success) {
      emitTrace("request.invalid", {
        method: request.method,
        url: request.url,
        durationMs: Date.now() - startedAt,
      });
      sendJson(response, 400, {
        error: "Invalid request payload.",
        issues: parsedBody.error.flatten(),
      });
      return;
    }

    emitTrace("request.accepted", {
      method: request.method,
      url: request.url,
      operation: parsedBody.data.operation,
      intent: parsedBody.data.task.intent,
      hostname: parsedBody.data.context.page.hostname,
    });

    const result = await generateLocalDraft(parsedBody.data);
    emitTrace("request.completed", {
      method: request.method,
      url: request.url,
      durationMs: Date.now() - startedAt,
      primaryChars: result.primary.length,
      alternatives: result.alternatives.length,
    });
    sendJson(response, 200, result);
  } catch (error) {
    emitTrace("request.failed", {
      method: request.method,
      url: request.url,
      error: error instanceof Error ? error.message : "Unexpected local API error.",
    });
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected local API error.",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Pluto Text local API listening on http://${HOST}:${PORT}`);
});
