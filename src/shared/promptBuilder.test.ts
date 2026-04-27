import test from "node:test";
import assert from "node:assert/strict";
import { buildDraftPrompt } from "./promptBuilder.ts";
import { DEFAULT_EXTENSION_SETTINGS } from "./settings.ts";
import type { GenerationRequest } from "./types.ts";

const sampleRequest: GenerationRequest = {
  operation: "draft",
  effectiveSettings: DEFAULT_EXTENSION_SETTINGS,
  task: {
    intent: "email_reply",
    tone: "professional",
    length: "medium",
    instructions: ["Keep the reply clear.", "Reference the thread context."],
  },
  context: {
    page: {
      url: "https://mail.google.com",
      hostname: "mail.google.com",
      title: "Inbox",
      headings: ["Compose"],
    },
    field: {
      tagName: "div",
      fieldTypeGuess: "email_reply",
      labelText: "Message Body",
      currentText: "Thanks for the update",
    },
    nearby: {
      textBefore: "Can you send a follow-up?",
    },
    gmail: {
      recipients: ["alex@example.com"],
      subject: "Project update",
      recentThreadTurns: [
        "Alex asked whether we can ship the revised file today.",
        "I replied that I was preparing the upload.",
      ],
      requestDetails: "The visible thread asks for a revised PDF and confirmation once uploaded.",
      truncatedSections: ["gmail_thread"],
      composeModeGuess: "reply",
    },
  },
};

test("buildDraftPrompt includes intent, settings, and context snippets", () => {
  const prompt = buildDraftPrompt(sampleRequest);

  assert.match(prompt, /Intent: email_reply/);
  assert.match(prompt, /Tone: professional/);
  assert.match(prompt, /Gmail subject:/);
  assert.match(prompt, /Project update/);
  assert.match(prompt, /Gmail recent thread turns:/);
  assert.match(prompt, /Use the best available recent thread and request context/);
});

test("buildDraftPrompt includes source text for transform requests", () => {
  const prompt = buildDraftPrompt({
    ...sampleRequest,
    operation: "shorten",
    sourceText: "Please shorten this draft.",
  });

  assert.match(prompt, /Operation: shorten/);
  assert.match(prompt, /Source text:/);
  assert.match(prompt, /Please shorten this draft\./);
  assert.match(prompt, /Transformation rules:/);
  assert.match(prompt, /Apply the "shorten" operation to the provided source text\./i);
  assert.match(prompt, /Current field text \(for reference only\)/);
});

test("buildDraftPrompt includes support reply guidance and context", () => {
  const prompt = buildDraftPrompt({
    ...sampleRequest,
    task: {
      intent: "support_reply",
      tone: "professional",
      length: "medium",
      instructions: ["Acknowledge the issue.", "Keep the response action-oriented."],
    },
    context: {
      ...sampleRequest.context,
      support: {
        issueSummary: "Customer cannot upload a signed document",
        requestDetails: "Ticket #4412 asks for troubleshooting steps and ETA.",
        conversationText: "The customer says the upload fails after choosing the PDF.",
        recentConversationTurns: [
          "Customer: The upload keeps failing after I select the file.",
          "Agent: Can you share the file type and exact error?",
        ],
        statusText: "Open | High priority",
        truncatedSections: ["support_conversation"],
      },
    },
  });

  assert.match(prompt, /Write this as a support reply to the visible customer issue\./);
  assert.match(prompt, /Support issue summary:/);
  assert.match(prompt, /Customer cannot upload a signed document/);
  assert.match(prompt, /Support status:/);
  assert.match(prompt, /Support recent conversation turns:/);
  assert.match(prompt, /instead of defaulting to a generic disclaimer/i);
});

test("buildDraftPrompt includes user answer seed for draft generation", () => {
  const prompt = buildDraftPrompt({
    ...sampleRequest,
    operation: "draft",
    draftInput: "Thank them, confirm I uploaded the revised PDF, and offer to resend it.",
  });

  assert.match(prompt, /User answer seed:/);
  assert.match(prompt, /Treat the provided user answer as the substance of the reply\./);
  assert.match(prompt, /offer to resend it/);
});
