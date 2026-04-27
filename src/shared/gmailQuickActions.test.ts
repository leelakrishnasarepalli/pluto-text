import test from "node:test";
import assert from "node:assert/strict";
import { applyGmailQuickAction } from "./gmailQuickActions.ts";
import type { TaskClassification } from "./types.ts";

const baseTask: TaskClassification = {
  intent: "email_reply",
  tone: "professional",
  length: "medium",
  instructions: ["Stay aligned with the thread."],
};

test("applyGmailQuickAction makes short professional replies concise", () => {
  const result = applyGmailQuickAction(baseTask, "short_professional_reply");

  assert.equal(result.tone, "professional");
  assert.equal(result.length, "short");
});

test("applyGmailQuickAction makes friendly replies warmer", () => {
  const result = applyGmailQuickAction(baseTask, "friendly_reply");

  assert.equal(result.tone, "friendly");
  assert.ok(result.instructions.some((instruction) => instruction.includes("warm")));
});
