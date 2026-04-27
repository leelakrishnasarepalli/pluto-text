import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXTENSION_SETTINGS, resolveEffectiveSiteSettings } from "./settings.ts";
import { classifyDraftTask } from "./taskClassification.ts";
import type { FocusedFieldInspection } from "./types";

function createInspection(partial?: Partial<FocusedFieldInspection>): FocusedFieldInspection {
  return {
    debug: {
      tagName: "textarea",
      isContentEditable: false,
      isDisabled: false,
      isReadonly: false,
      width: 400,
      height: 120,
      isCandidate: true,
      score: 90,
      reasonCodes: ["textarea_detected", "candidate_long_form_target"],
      fieldTypeGuess: "form_long_answer",
      reason: "Focused field looks suitable for long-form drafting.",
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
      ...partial?.context,
    },
    ...partial,
  };
}

test("classifyDraftTask detects gmail replies", () => {
  const effectiveSettings = resolveEffectiveSiteSettings(DEFAULT_EXTENSION_SETTINGS, "mail.google.com");
  const result = classifyDraftTask({
    hostname: "mail.google.com",
    effectiveSettings,
    inspection: createInspection({
      debug: {
        ...createInspection().debug,
        fieldTypeGuess: "email_reply",
      },
      context: {
        ...createInspection().context!,
        gmail: {
          recipients: ["a@example.com"],
          composeModeGuess: "reply",
        },
      },
    }),
  });

  assert.equal(result.intent, "email_reply");
  assert.equal(result.length, "medium");
});

test("classifyDraftTask detects support replies from nearby text", () => {
  const effectiveSettings = resolveEffectiveSiteSettings(DEFAULT_EXTENSION_SETTINGS, "support.example.com");
  const result = classifyDraftTask({
    hostname: "support.example.com",
    effectiveSettings,
    inspection: createInspection({
      context: {
        ...createInspection().context!,
        nearby: {
          helpText: "Reply to the customer support ticket with the next steps.",
        },
      },
    }),
  });

  assert.equal(result.intent, "support_reply");
  assert.ok(result.instructions.some((instruction) => instruction.includes("solution-oriented")));
});

test("classifyDraftTask prefers support replies when support context is visible", () => {
  const effectiveSettings = resolveEffectiveSiteSettings(DEFAULT_EXTENSION_SETTINGS, "app.example.com");
  const result = classifyDraftTask({
    hostname: "app.example.com",
    effectiveSettings,
    inspection: createInspection({
      context: {
        ...createInspection().context!,
        support: {
          issueSummary: "Customer cannot upload the signed document",
          requestDetails: "Ticket #4412 asks for next steps and ETA.",
          conversationText: "Customer says the upload fails after selecting the file.",
          statusText: "Open | High priority",
        },
      },
    }),
  });

  assert.equal(result.intent, "support_reply");
  assert.ok(result.instructions.some((instruction) => instruction.includes("summarize the request")));
});

test("classifyDraftTask avoids false support positives for generic forms", () => {
  const effectiveSettings = resolveEffectiveSiteSettings(DEFAULT_EXTENSION_SETTINGS, "forms.example.com");
  const result = classifyDraftTask({
    hostname: "forms.example.com",
    effectiveSettings,
    inspection: createInspection({
      context: {
        ...createInspection().context!,
        field: {
          ...createInspection().context!.field,
          labelText: "Describe your experience",
        },
        nearby: {
          helpText: "Answer the application question in detail.",
        },
      },
    }),
  });

  assert.equal(result.intent, "form_answer");
});
