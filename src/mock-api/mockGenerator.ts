import { buildDraftPrompt } from "../shared/promptBuilder.ts";
import { postJsonWithTimeout } from "../shared/http.ts";
import {
  generationResponseSchema,
  type GenerationRequest,
  type GenerationResponse,
} from "../shared/types.ts";

const OLLAMA_REQUEST_TIMEOUT_MS = 45_000;
const OPENAI_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_OLLAMA_MODEL = "minimax-m2.7:cloud";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export type ModelProvider = {
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  name: string;
};

type OllamaConfig = {
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
};

type OpenAIConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

type LocalModelRouterConfig = {
  primaryProvider: "ollama";
  ollama: OllamaConfig;
  openai?: OpenAIConfig;
  fallbackProvider: "none" | "openai";
};

function getEnvNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

function buildOpenAIConfig(): OpenAIConfig | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }

  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    timeoutMs: getEnvNumber("OPENAI_TIMEOUT_MS", OPENAI_REQUEST_TIMEOUT_MS),
  };
}

export function getLocalModelRouterConfig(): LocalModelRouterConfig {
  const openai = buildOpenAIConfig();

  return {
    primaryProvider: "ollama",
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
      model: process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
      temperature: getEnvNumber("OLLAMA_TEMPERATURE", 0.3),
      timeoutMs: getEnvNumber("OLLAMA_TIMEOUT_MS", OLLAMA_REQUEST_TIMEOUT_MS),
    },
    openai,
    fallbackProvider: openai ? "openai" : "none",
  };
}

function buildSystemInstruction(): string {
  return [
    "You are a drafting assistant for a browser extension.",
    "Return only valid JSON with this exact shape:",
    '{"primary":"string","alternatives":["string"],"warnings":["string"]}',
    "The warnings field is optional and may be omitted if empty.",
    "Do not wrap the JSON in markdown fences.",
    "All property names must use double quotes.",
    "Escape newlines inside JSON string values as \\n.",
    "Keep alternatives meaningfully different, but relevant to the same request.",
    "Honor the requested operation: draft, shorten, make_more_professional, make_friendlier, or expand.",
    "For shorten/make_more_professional/make_friendlier/expand, transform the provided source text instead of drafting from scratch.",
  ].join("\n");
}

function normalizeSmartQuotes(text: string): string {
  return text.replace(/[“”]/g, "\"").replace(/[‘’]/g, "'");
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function quoteBarePropertyNames(text: string): string {
  return text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

function quoteSingleQuotedPropertyNames(text: string): string {
  return text.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function repairJsonLikeText(text: string): string {
  return removeTrailingCommas(
    quoteBarePropertyNames(
      quoteSingleQuotedPropertyNames(
        stripMarkdownFences(normalizeSmartQuotes(text)),
      ),
    ),
  );
}

function tryParseGenerationResponse(rawText: string): GenerationResponse | null {
  try {
    return generationResponseSchema.parse(JSON.parse(rawText));
  } catch {
    return null;
  }
}

function parseProviderJsonResponse(rawText: string): GenerationResponse {
  const trimmed = rawText.trim();
  const direct = tryParseGenerationResponse(trimmed);
  if (direct) {
    return direct;
  }

  const repairedWhole = tryParseGenerationResponse(repairJsonLikeText(trimmed));
  if (repairedWhole) {
    return repairedWhole;
  }

  const jsonMatch = stripMarkdownFences(trimmed).match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("The model did not return valid JSON.");
  }

  const extracted = jsonMatch[0];
  const parsedExtracted = tryParseGenerationResponse(extracted);
  if (parsedExtracted) {
    return parsedExtracted;
  }

  const repairedExtracted = tryParseGenerationResponse(repairJsonLikeText(extracted));
  if (repairedExtracted) {
    return repairedExtracted;
  }

  throw new Error("The model did not return valid JSON.");
}

function formatProviderError(error: unknown, providerName: string): Error {
  if (error instanceof Error && error.name === "AbortError") {
    return new Error(`The ${providerName} request timed out.`);
  }

  return new Error(
    error instanceof Error
      ? `The ${providerName} request failed: ${error.message}`
      : `The ${providerName} request failed unexpectedly.`,
  );
}

function appendWarning(
  response: GenerationResponse,
  warning: string,
): GenerationResponse {
  return generationResponseSchema.parse({
    ...response,
    warnings: [...(response.warnings ?? []), warning],
  });
}

function isCloudFallbackAllowed(request: GenerationRequest): boolean {
  return (
    request.effectiveSettings.routingMode === "local_preferred_cloud_fallback" &&
    request.effectiveSettings.cloudFallbackEnabled
  );
}

function extractOpenAIOutputText(responseJson: unknown): string {
  if (
    responseJson &&
    typeof responseJson === "object" &&
    "output_text" in responseJson &&
    typeof (responseJson as { output_text?: unknown }).output_text === "string"
  ) {
    return (responseJson as { output_text: string }).output_text;
  }

  if (
    responseJson &&
    typeof responseJson === "object" &&
    "output" in responseJson &&
    Array.isArray((responseJson as { output?: unknown }).output)
  ) {
    const output = (responseJson as { output: Array<Record<string, unknown>> }).output;
    const parts = output.flatMap((item) => {
      if (!Array.isArray(item.content)) {
        return [];
      }

      return item.content
        .filter(
          (content): content is { type: string; text: string } =>
            Boolean(
              content &&
                typeof content === "object" &&
                "type" in content &&
                "text" in content &&
                (content as { type?: unknown }).type === "output_text" &&
                typeof (content as { text?: unknown }).text === "string",
            ),
        )
        .map((content) => content.text);
    });

    return parts.join("\n").trim();
  }

  return "";
}

function buildOpenAIJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      primary: { type: "string" },
      alternatives: {
        type: "array",
        items: { type: "string" },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["primary", "alternatives"],
  };
}

export class OllamaProvider implements ModelProvider {
  readonly name = "ollama";
  private readonly config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const prompt = buildDraftPrompt(request);
    const startedAt = Date.now();

    emitTrace("provider.request", {
      provider: this.name,
      model: this.config.model,
      operation: request.operation,
      intent: request.task.intent,
      promptChars: prompt.length,
    });

    let response: Response;
    try {
      response = await postJsonWithTimeout(
        new URL("/api/generate", this.config.baseUrl).toString(),
        {
          model: this.config.model,
          stream: false,
          format: "json",
          system: buildSystemInstruction(),
          prompt,
          options: {
            temperature: this.config.temperature,
          },
        },
        this.config.timeoutMs,
      );
    } catch (error) {
      throw formatProviderError(error, this.name);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error("The Ollama endpoint returned malformed JSON.");
    }

    if (!response.ok) {
      const message =
        json && typeof json === "object" && "error" in json
          ? String((json as { error?: unknown }).error)
          : `Ollama returned status ${response.status}.`;
      throw new Error(`The Ollama endpoint returned an error: ${message}`);
    }

    const responseText =
      json && typeof json === "object" && "response" in json
        ? String((json as { response?: unknown }).response ?? "")
        : "";

    if (!responseText.trim()) {
      throw new Error("The Ollama endpoint returned an empty response.");
    }

    const parsed = parseProviderJsonResponse(responseText);

    emitTrace("provider.response", {
      provider: this.name,
      model: this.config.model,
      durationMs: Date.now() - startedAt,
      primaryChars: parsed.primary.length,
      alternatives: parsed.alternatives.length,
      warnings: parsed.warnings?.length ?? 0,
    });

    return parsed;
  }
}

export class OpenAIProvider implements ModelProvider {
  readonly name = "openai";
  private readonly config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const prompt = buildDraftPrompt(request);
    const startedAt = Date.now();

    emitTrace("provider.request", {
      provider: this.name,
      model: this.config.model,
      operation: request.operation,
      intent: request.task.intent,
      promptChars: prompt.length,
    });

    let response: Response;
    try {
      response = await postJsonWithTimeout(
        new URL("/responses", this.config.baseUrl).toString(),
        {
          model: this.config.model,
          instructions: buildSystemInstruction(),
          input: prompt,
          text: {
            format: {
              type: "json_schema",
              name: "context_draft_response",
              strict: true,
              schema: buildOpenAIJsonSchema(),
            },
          },
        },
        this.config.timeoutMs,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
      );
    } catch (error) {
      throw formatProviderError(error, this.name);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error("The OpenAI endpoint returned malformed JSON.");
    }

    if (!response.ok) {
      const message =
        json &&
        typeof json === "object" &&
        "error" in json &&
        (json as { error?: unknown }).error &&
        typeof (json as { error: { message?: unknown } }).error === "object" &&
        typeof (json as { error: { message?: unknown } }).error.message === "string"
          ? (json as { error: { message: string } }).error.message
          : `OpenAI returned status ${response.status}.`;
      throw new Error(`The OpenAI endpoint returned an error: ${message}`);
    }

    const responseText = extractOpenAIOutputText(json);
    if (!responseText) {
      throw new Error("The OpenAI endpoint returned an empty response.");
    }

    const parsed = parseProviderJsonResponse(responseText);

    emitTrace("provider.response", {
      provider: this.name,
      model: this.config.model,
      durationMs: Date.now() - startedAt,
      primaryChars: parsed.primary.length,
      alternatives: parsed.alternatives.length,
      warnings: parsed.warnings?.length ?? 0,
    });

    return parsed;
  }
}

export class LocalModelRouter {
  private readonly config: LocalModelRouterConfig;

  constructor(config: LocalModelRouterConfig) {
    this.config = config;
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const providers: ModelProvider[] = [new OllamaProvider(this.config.ollama)];
    if (
      this.config.fallbackProvider === "openai" &&
      this.config.openai &&
      isCloudFallbackAllowed(request)
    ) {
      providers.push(new OpenAIProvider(this.config.openai));
    }

    const errors: string[] = [];

    for (const [index, provider] of providers.entries()) {
      try {
        const result = await provider.generate(request);
        const normalized = generationResponseSchema.parse(result);

        if (index > 0) {
          return appendWarning(
            normalized,
            `Generated with ${provider.name} fallback after the primary local provider failed.`,
          );
        }

        return normalized;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `${provider.name} failed unexpectedly.`;
        errors.push(message);
        emitTrace("provider.failed", {
          provider: provider.name,
          error: message,
        });
      }
    }

    throw new Error(errors[0] || "No generation provider was able to produce a draft.");
  }
}

export async function generateLocalDraft(request: GenerationRequest): Promise<GenerationResponse> {
  const router = new LocalModelRouter(getLocalModelRouterConfig());
  return router.generate(request);
}
