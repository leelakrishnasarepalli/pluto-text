import test from "node:test";
import assert from "node:assert/strict";
import { backgroundResponseSchema, popupToBackgroundMessageSchema } from "./contracts.ts";
import { DEFAULT_EXTENSION_SETTINGS } from "../shared/settings.ts";
import { generationRequestSchema, generationResponseSchema } from "../shared/types.ts";

test("popupToBackgroundMessageSchema validates transform messages", () => {
  const parsed = popupToBackgroundMessageSchema.safeParse({
    type: "transform-text",
    operation: "shorten",
    sourceText: "Please shorten this.",
  });

  assert.equal(parsed.success, true);
});

test("popupToBackgroundMessageSchema validates draft input on generate messages", () => {
  const parsed = popupToBackgroundMessageSchema.safeParse({
    type: "generate-draft",
    quickAction: "friendly_reply",
    draftInput: "Please tell them I uploaded the revised document and can resend if needed.",
  });

  assert.equal(parsed.success, true);
});

test("generation request and response schemas validate expected payloads", () => {
  const request = generationRequestSchema.parse({
    operation: "draft",
    effectiveSettings: DEFAULT_EXTENSION_SETTINGS,
    task: {
      intent: "generic_draft",
      tone: "professional",
      length: "medium",
      instructions: ["Keep it clear."],
    },
    context: {
      page: {
        url: "https://example.com",
        hostname: "example.com",
        title: "Example",
        headings: [],
      },
      field: {
        tagName: "textarea",
        fieldTypeGuess: "form_long_answer",
      },
      nearby: {},
    },
    draftInput: "Please thank them and confirm I sent the file.",
  });
  const response = generationResponseSchema.parse({
    primary: "Draft text",
    alternatives: ["Alternative 1"],
  });

  assert.equal(request.operation, "draft");
  assert.equal(request.draftInput, "Please thank them and confirm I sent the file.");
  assert.equal(response.primary, "Draft text");
});

test("background response schema accepts structured error details", () => {
  const response = backgroundResponseSchema.parse({
    ok: false,
    message: "The local draft API is unavailable.",
    errorCode: "local_api_unavailable",
    errorDetails: "connect ECONNREFUSED 127.0.0.1:8787",
  });

  assert.equal(response.errorCode, "local_api_unavailable");
});
