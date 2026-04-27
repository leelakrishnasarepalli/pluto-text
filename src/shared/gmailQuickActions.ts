import type { GmailQuickAction, TaskClassification } from "./types.ts";
import { taskClassificationSchema } from "./types.ts";

export function applyGmailQuickAction(
  task: TaskClassification,
  quickAction?: GmailQuickAction,
): TaskClassification {
  if (!quickAction) {
    return task;
  }

  if (quickAction === "draft_reply") {
    return taskClassificationSchema.parse({
      ...task,
      intent: "email_reply",
      instructions: [
        ...task.instructions,
        "Write a direct Gmail reply that fits the visible thread context.",
      ],
    });
  }

  if (quickAction === "short_professional_reply") {
    return taskClassificationSchema.parse({
      ...task,
      intent: "email_reply",
      tone: "professional",
      length: "short",
      instructions: [
        ...task.instructions,
        "Keep the reply short, polished, and ready to send after review.",
      ],
    });
  }

  if (quickAction === "friendly_reply") {
    return taskClassificationSchema.parse({
      ...task,
      intent: "email_reply",
      tone: "friendly",
      instructions: [
        ...task.instructions,
        "Use warm, conversational wording while keeping the email clear.",
      ],
    });
  }

  return taskClassificationSchema.parse({
    ...task,
    intent: "email_reply",
    tone: task.tone === "friendly" ? "professional" : task.tone,
    length: task.length === "short" ? "medium" : task.length,
    instructions: [
      ...task.instructions,
      "Write this as a polite follow-up email that gently nudges next steps.",
    ],
  });
}
