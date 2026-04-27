import type {
  EffectiveSiteSettings,
  FocusedFieldInspection,
  TaskClassification,
  TaskIntent,
} from "./types.ts";
import { taskClassificationSchema } from "./types.ts";
import { isSupportHostname, isSupportLikeText } from "../detection/support.ts";

type TaskClassificationInput = {
  hostname?: string;
  inspection?: FocusedFieldInspection;
  effectiveSettings: EffectiveSiteSettings;
};

function normalizeText(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function determineIntent(input: TaskClassificationInput): TaskIntent {
  const hostname = normalizeText(input.hostname);
  const fieldGuess = input.inspection?.debug.fieldTypeGuess;
  const nearbyText = normalizeText(
    [
      input.inspection?.context?.field.labelText,
      input.inspection?.context?.nearby.helpText,
      input.inspection?.context?.nearby.textBefore,
      input.inspection?.context?.nearby.textAfter,
      input.inspection?.context?.support?.issueSummary,
      input.inspection?.context?.support?.requestDetails,
      input.inspection?.context?.support?.conversationText,
      input.inspection?.context?.support?.statusText,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const gmailMode = input.inspection?.context?.gmail?.composeModeGuess;
  const gmailRecipients = input.inspection?.context?.gmail?.recipients.length ?? 0;
  const gmailSubject = normalizeText(input.inspection?.context?.gmail?.subject);

  if (
    fieldGuess === "email_reply" ||
    gmailMode === "reply" ||
    (hostname === "mail.google.com" && (gmailMode !== "unknown" || gmailRecipients > 0 || Boolean(gmailSubject)))
  ) {
    return "email_reply";
  }

  if (
    isSupportHostname(hostname) ||
    isSupportLikeText(nearbyText) ||
    /support|help|ticket|customer service|issue|case|conversation|incident|request/.test(
      `${hostname} ${nearbyText}`,
    )
  ) {
    return "support_reply";
  }

  if (fieldGuess === "form_long_answer" || /application|answer|details|describe|question/.test(nearbyText)) {
    return "form_answer";
  }

  return "generic_draft";
}

function determineTone(input: TaskClassificationInput, intent: TaskIntent): EffectiveSiteSettings["defaultTone"] {
  if (intent === "support_reply") {
    return ["friendly", "formal", "persuasive"].includes(input.effectiveSettings.defaultTone)
      ? "professional"
      : input.effectiveSettings.defaultTone;
  }

  if (intent === "email_reply" && input.inspection?.context?.gmail?.composeModeGuess === "reply") {
    return input.effectiveSettings.defaultTone === "formal"
      ? "professional"
      : input.effectiveSettings.defaultTone;
  }

  return input.effectiveSettings.defaultTone;
}

function determineLength(
  input: TaskClassificationInput,
  intent: TaskIntent,
): EffectiveSiteSettings["defaultLength"] {
  const nearbyText = normalizeText(
    [
      input.inspection?.context?.nearby.helpText,
      input.inspection?.context?.field.labelText,
      input.inspection?.context?.field.placeholder,
      input.inspection?.context?.support?.requestDetails,
      input.inspection?.context?.support?.issueSummary,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (intent === "email_reply" && input.inspection?.context?.gmail?.composeModeGuess === "reply") {
    return input.effectiveSettings.defaultLength === "long"
      ? "medium"
      : input.effectiveSettings.defaultLength;
  }

  if (intent === "form_answer" && /detail|explain|describe|background|why/.test(nearbyText)) {
    return input.effectiveSettings.defaultLength === "short" ? "medium" : input.effectiveSettings.defaultLength;
  }

  if (intent === "support_reply") {
    if (/urgent|incident|outage|critical|sev|severity/.test(nearbyText)) {
      return input.effectiveSettings.defaultLength === "short" ? "medium" : input.effectiveSettings.defaultLength;
    }

    return input.effectiveSettings.defaultLength === "long"
      ? "medium"
      : input.effectiveSettings.defaultLength;
  }

  return input.effectiveSettings.defaultLength;
}

function buildInstructions(
  input: TaskClassificationInput,
  intent: TaskIntent,
  tone: EffectiveSiteSettings["defaultTone"],
  length: EffectiveSiteSettings["defaultLength"],
): string[] {
  const instructions = [
    `Write as a ${tone} ${intent.replace(/_/g, " ")}.`,
    `Target a ${length} response.`,
  ];

  if (input.effectiveSettings.includeGreeting) {
    instructions.push("Include a greeting if it fits naturally.");
  }

  if (input.effectiveSettings.includeSignoff) {
    instructions.push(
      input.effectiveSettings.signoffText
        ? `Use this signoff when appropriate: ${input.effectiveSettings.signoffText}`
        : "Include a brief signoff when appropriate.",
    );
  }

  if (intent === "support_reply") {
    instructions.push("Acknowledge the customer issue clearly and stay solution-oriented.");
    instructions.push("Briefly summarize the request before proposing next steps.");
    instructions.push("Keep the reply action-oriented and grounded in the visible ticket context.");
  }

  if (intent === "form_answer") {
    instructions.push("Answer directly and use nearby field guidance when available.");
  }

  if (intent === "email_reply") {
    instructions.push("Stay aligned with the existing thread context and recipients.");
  }

  return instructions;
}

export function classifyDraftTask(input: TaskClassificationInput): TaskClassification {
  const intent = determineIntent(input);
  const tone = determineTone(input, intent);
  const length = determineLength(input, intent);
  const instructions = buildInstructions(input, intent, tone, length);

  return taskClassificationSchema.parse({
    intent,
    tone,
    length,
    instructions,
  });
}
