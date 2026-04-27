import test from "node:test";
import assert from "node:assert/strict";
import {
  LocalModelRouter,
  OllamaProvider,
  OpenAIProvider,
  getLocalModelRouterConfig,
} from "./mockGenerator.ts";
import { DEFAULT_EXTENSION_SETTINGS } from "../shared/settings.ts";
import { applyGmailQuickAction } from "../shared/gmailQuickActions.ts";
import type { GenerationRequest } from "../shared/types.ts";

function createRequest(intent: GenerationRequest["task"]["intent"]): GenerationRequest {
  return {
    operation: "draft",
    effectiveSettings: DEFAULT_EXTENSION_SETTINGS,
    task: {
      intent,
      tone: "professional",
      length: "medium",
      instructions: ["Keep it clear."],
    },
    context: {
      page: {
        url: "https://example.com",
        hostname: "example.com",
        title: "Example",
        headings: ["Example Heading"],
      },
      field: {
        tagName: "textarea",
        fieldTypeGuess: intent === "email_reply" ? "email_reply" : "form_long_answer",
        labelText: "Response",
      },
      nearby: {
        textBefore: "Please provide a response.",
      },
      gmail:
        intent === "email_reply"
          ? {
              recipients: ["a@example.com"],
              subject: "Status update",
              composeModeGuess: "reply",
            }
          : undefined,
    },
  };
}

test("getLocalModelRouterConfig provides local-first Ollama defaults", () => {
  const config = getLocalModelRouterConfig();

  assert.equal(config.primaryProvider, "ollama");
  assert.equal(config.ollama.baseUrl, "http://127.0.0.1:11434");
  assert.equal(config.ollama.model, "minimax-m2.7:cloud");
});

test("OpenAIProvider normalizes structured response output", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '{"primary":"Cloud draft","alternatives":["Cloud alt"]}',
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-test",
      timeoutMs: 1000,
    });
    const result = await provider.generate(createRequest("email_reply"));

    assert.equal(result.primary, "Cloud draft");
    assert.deepEqual(result.alternatives, ["Cloud alt"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OllamaProvider normalizes valid JSON output from response field", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        response:
          '{"primary":"Draft text","alternatives":["Alternative 1"],"warnings":["Note"]}',
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "test-model",
      temperature: 0.1,
      timeoutMs: 1000,
    });
    const result = await provider.generate(createRequest("email_reply"));

    assert.equal(result.primary, "Draft text");
    assert.deepEqual(result.alternatives, ["Alternative 1"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OllamaProvider rejects malformed model output cleanly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        response: "not valid json",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "test-model",
      temperature: 0.1,
      timeoutMs: 1000,
    });

    await assert.rejects(
      () => provider.generate(createRequest("form_answer")),
      /did not return valid JSON/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OllamaProvider repairs JSON-like output with bare property names and trailing commas", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        response: `\`\`\`json
{
  primary: "Friendly follow-up draft",
  alternatives: ["Alt 1", "Alt 2",],
  warnings: ["Used repaired JSON",],
}
\`\`\``,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "test-model",
      temperature: 0.1,
      timeoutMs: 1000,
    });
    const result = await provider.generate(createRequest("email_reply"));

    assert.equal(result.primary, "Friendly follow-up draft");
    assert.deepEqual(result.alternatives, ["Alt 1", "Alt 2"]);
    assert.deepEqual(result.warnings, ["Used repaired JSON"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LocalModelRouter falls back to OpenAI after Ollama failure", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      throw new Error("connect ECONNREFUSED");
    }

    return new Response(
      JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '{"primary":"Fallback draft","alternatives":["Fallback alt"]}',
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const router = new LocalModelRouter({
      primaryProvider: "ollama",
      ollama: {
        baseUrl: "http://127.0.0.1:11434",
        model: "minimax-m2.7:cloud",
        temperature: 0.1,
        timeoutMs: 1000,
      },
      openai: {
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-test",
        timeoutMs: 1000,
      },
      fallbackProvider: "openai",
    });
    const request = {
      ...createRequest("email_reply"),
      effectiveSettings: {
        ...DEFAULT_EXTENSION_SETTINGS,
        routingMode: "local_preferred_cloud_fallback",
        cloudFallbackEnabled: true,
      },
    } satisfies GenerationRequest;

    const result = await router.generate(request);

    assert.equal(result.primary, "Fallback draft");
    assert.match(result.warnings?.[0] ?? "", /fallback/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LocalModelRouter does not use OpenAI fallback when routing stays local_only", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    throw new Error("connect ECONNREFUSED");
  };

  try {
    const router = new LocalModelRouter({
      primaryProvider: "ollama",
      ollama: {
        baseUrl: "http://127.0.0.1:11434",
        model: "minimax-m2.7:cloud",
        temperature: 0.1,
        timeoutMs: 1000,
      },
      openai: {
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-test",
        timeoutMs: 1000,
      },
      fallbackProvider: "openai",
    });
    const request = {
      ...createRequest("email_reply"),
      effectiveSettings: {
        ...DEFAULT_EXTENSION_SETTINGS,
        routingMode: "local_only",
        cloudFallbackEnabled: true,
      },
    } satisfies GenerationRequest;

    await assert.rejects(() => router.generate(request), /ollama/i);
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LocalModelRouter does not use OpenAI fallback when cloud fallback is disabled", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    throw new Error("connect ECONNREFUSED");
  };

  try {
    const router = new LocalModelRouter({
      primaryProvider: "ollama",
      ollama: {
        baseUrl: "http://127.0.0.1:11434",
        model: "minimax-m2.7:cloud",
        temperature: 0.1,
        timeoutMs: 1000,
      },
      openai: {
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-test",
        timeoutMs: 1000,
      },
      fallbackProvider: "openai",
    });
    const request = {
      ...createRequest("email_reply"),
      effectiveSettings: {
        ...DEFAULT_EXTENSION_SETTINGS,
        routingMode: "local_preferred_cloud_fallback",
        cloudFallbackEnabled: false,
      },
    } satisfies GenerationRequest;

    await assert.rejects(() => router.generate(request), /ollama/i);
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("applyGmailQuickAction supports every Gmail quick reply variant", () => {
  const baseTask = createRequest("email_reply").task;

  const draftReply = applyGmailQuickAction(baseTask, "draft_reply");
  const shortProfessional = applyGmailQuickAction(baseTask, "short_professional_reply");
  const friendlyReply = applyGmailQuickAction(baseTask, "friendly_reply");
  const followUp = applyGmailQuickAction(baseTask, "follow_up_style_draft");

  assert.equal(draftReply.intent, "email_reply");
  assert.match(draftReply.instructions.at(-1) ?? "", /gmail reply/i);

  assert.equal(shortProfessional.tone, "professional");
  assert.equal(shortProfessional.length, "short");

  assert.equal(friendlyReply.tone, "friendly");
  assert.match(friendlyReply.instructions.at(-1) ?? "", /warm/i);

  assert.equal(followUp.intent, "email_reply");
  assert.match(followUp.instructions.at(-1) ?? "", /follow-up email/i);
});
