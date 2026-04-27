import { applyGeneratedTextToFocusedField } from "./insertion";
import { inspectFocusedFieldWithContext } from "../detection/contextExtractor";
import { backgroundToContentMessageSchema } from "../messaging/contracts";
import { focusedFieldInspectionSchema, insertionResultSchema } from "../shared/types";

function createContentInspectionFailure(message: string) {
  return focusedFieldInspectionSchema.parse({
    debug: {
      tagName: "unknown",
      isContentEditable: false,
      isDisabled: false,
      isReadonly: false,
      width: 0,
      height: 0,
      isCandidate: false,
      score: 0,
      reasonCodes: ["no_focus_target"],
      fieldTypeGuess: "unknown",
      reason: message,
    },
  });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const parsed = backgroundToContentMessageSchema.safeParse(message);
  if (!parsed.success) {
    return false;
  }

  try {
    if (parsed.data.type === "inspect-focused-field") {
      sendResponse(inspectFocusedFieldWithContext());
      return false;
    }

    if (parsed.data.type === "apply-generated-text") {
      sendResponse(applyGeneratedTextToFocusedField(parsed.data.mode, parsed.data.text));
      return false;
    }
  } catch (error) {
    if (parsed.data.type === "inspect-focused-field") {
      sendResponse(
        createContentInspectionFailure(
          error instanceof Error ? `Inspection failed: ${error.message}` : "Inspection failed unexpectedly.",
        ),
      );
      return false;
    }

    sendResponse(
      insertionResultSchema.parse({
        ok: false,
        mode: parsed.data.mode,
        message:
          error instanceof Error ? `Insertion failed: ${error.message}` : "Insertion failed unexpectedly.",
      }),
    );
    return false;
  }

  return false;
});
