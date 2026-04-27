import type { GenerationRequest } from "./types.ts";

function optionalSection(label: string, value?: string | string[]): string {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return "";
  }

  const content = Array.isArray(value) ? value.join("\n") : value;
  return `${label}:\n${content}\n`;
}

export function buildDraftPrompt(request: GenerationRequest): string {
  const isTransform = request.operation !== "draft";
  const isSupportReply = request.task.intent === "support_reply";
  const isEmailReply = request.task.intent === "email_reply";
  const hasDraftInput = Boolean(request.draftInput?.trim());
  const operationInstruction = isTransform
    ? [
        "Transformation rules:",
        `- Apply the "${request.operation}" operation to the provided source text.`,
        "- Preserve the original meaning unless the operation explicitly implies expansion or tone adjustment.",
        "- Return a rewrite of the source text, not a brand-new unrelated draft.",
        "- Use the surrounding context only to keep the rewrite relevant and consistent.",
      ].join("\n")
    : [
        "Drafting rules:",
        "- Create a new draft that fits the detected task and visible context.",
        "- Use the nearby context to keep the draft relevant and grounded.",
        ...((isEmailReply || isSupportReply)
          ? [
              "- Use the best available recent thread and request context before assuming details are missing.",
              "- If some details are still incomplete, reply as specifically as possible from the visible context instead of defaulting to a generic disclaimer.",
            ]
          : []),
        ...(hasDraftInput
          ? [
              "- Treat the provided user answer as the substance of the reply.",
              "- Preserve the user's intended meaning while turning it into a polished draft.",
              "- Use the surrounding context to format and ground the reply, but do not override the user's answer.",
            ]
          : []),
        ...(isSupportReply
          ? [
              "- Write this as a support reply to the visible customer issue.",
              "- Briefly acknowledge the issue and summarize the request before the next steps.",
              "- Keep the reply practical, calm, and action-oriented.",
            ]
          : []),
      ].join("\n");

  return [
    `Operation: ${request.operation}`,
    `Intent: ${request.task.intent}`,
    `Tone: ${request.task.tone}`,
    `Length: ${request.task.length}`,
    `Routing mode: ${request.effectiveSettings.routingMode}`,
    `Include greeting: ${request.effectiveSettings.includeGreeting ? "yes" : "no"}`,
    `Include signoff: ${request.effectiveSettings.includeSignoff ? "yes" : "no"}`,
    operationInstruction,
    optionalSection("User answer seed", request.draftInput),
    optionalSection("Source text", request.sourceText),
    optionalSection("Task instructions", request.task.instructions),
    optionalSection("Page title", request.context.page.title),
    optionalSection("Page headings", request.context.page.headings),
    optionalSection("Field label", request.context.field.labelText),
    optionalSection("Field placeholder", request.context.field.placeholder),
    optionalSection(
      isTransform ? "Current field text (for reference only)" : "Current field text",
      request.context.field.currentText,
    ),
    optionalSection("Nearby help text", request.context.nearby.helpText),
    optionalSection("Nearby error text", request.context.nearby.errorText),
    optionalSection("Nearby text before", request.context.nearby.textBefore),
    optionalSection("Nearby text after", request.context.nearby.textAfter),
    optionalSection("Nearest container text", request.context.nearby.nearestContainerText),
    optionalSection("Gmail subject", request.context.gmail?.subject),
    optionalSection("Gmail recipients", request.context.gmail?.recipients),
    optionalSection("Gmail recent thread turns", request.context.gmail?.recentThreadTurns),
    optionalSection("Gmail request details", request.context.gmail?.requestDetails),
    optionalSection("Gmail thread text", request.context.gmail?.threadText),
    optionalSection("Gmail truncated sections", request.context.gmail?.truncatedSections),
    optionalSection("Support issue summary", request.context.support?.issueSummary),
    optionalSection("Support request details", request.context.support?.requestDetails),
    optionalSection("Support recent conversation turns", request.context.support?.recentConversationTurns),
    optionalSection("Support conversation text", request.context.support?.conversationText),
    optionalSection("Support status", request.context.support?.statusText),
    optionalSection("Support truncated sections", request.context.support?.truncatedSections),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}
