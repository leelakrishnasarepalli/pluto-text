import type { FocusedFieldDebug, FocusedFieldReasonCode, FocusedFieldTypeGuess } from "../shared/types";
import { focusedFieldDebugSchema } from "../shared/types";
import { getDeepActiveElement, resolveFocusedEditableElement } from "./dom";
import {
  buildFieldHintText,
  getElementSizeSnapshot,
  getElementVisibilitySnapshot,
  getSensitiveFieldSnapshot,
  guessFieldIntent,
  isExplicitlyUnsupportedTextInputType,
  isLargeEnoughForDrafting,
  isLikelyOtpField,
  isLikelySensitiveField,
  isSupportedTextInputType,
  isVisibleBySnapshot,
  normalizeTextInputType,
} from "./utils";

type ClassificationDraft = {
  isCandidate: boolean;
  score: number;
  reasonCodes: FocusedFieldReasonCode[];
  fieldTypeGuess: FocusedFieldTypeGuess;
  reason: string;
};

function createUnsupportedDebug(reason: string, reasonCodes: FocusedFieldReasonCode[]): FocusedFieldDebug {
  return focusedFieldDebugSchema.parse({
    tagName: "unknown",
    isContentEditable: false,
    isDisabled: false,
    isReadonly: false,
    width: 0,
    height: 0,
    isCandidate: false,
    score: 0,
    reasonCodes,
    fieldTypeGuess: "unknown",
    reason,
  });
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getFieldTypeGuess(
  element: HTMLElement,
  isTextInputCandidate: boolean,
  hintGuess: FocusedFieldTypeGuess,
): FocusedFieldTypeGuess {
  if (hintGuess !== "unknown") {
    return hintGuess;
  }

  if (element.isContentEditable) {
    return "generic_editor";
  }

  if (element instanceof HTMLTextAreaElement || isTextInputCandidate) {
    return "form_long_answer";
  }

  return "unknown";
}

export function classifyFocusedField(element: HTMLElement | null): FocusedFieldDebug {
  if (!element) {
    return createUnsupportedDebug("No focused editable field found.", ["no_focus_target"]);
  }

  const size = getElementSizeSnapshot(element);
  const visibility = getElementVisibilitySnapshot(element);
  const sensitiveSnapshot = getSensitiveFieldSnapshot(element);
  const hintText = buildFieldHintText({
    ...sensitiveSnapshot,
    type: element instanceof HTMLInputElement ? element.type || undefined : undefined,
  });
  const hintGuess = guessFieldIntent(hintText);
  const normalizedType =
    element instanceof HTMLInputElement ? normalizeTextInputType(element.type) : undefined;
  const isTextInput = element instanceof HTMLInputElement;
  const isTextarea = element instanceof HTMLTextAreaElement;
  const contentEditableValue = element.getAttribute("contenteditable");
  const isContentEditable =
    element.isContentEditable ||
    contentEditableValue === "" ||
    contentEditableValue === "true" ||
    contentEditableValue === "plaintext-only";
  const isVisible = isVisibleBySnapshot(visibility);
  const isLargeEnough = isLargeEnoughForDrafting(size);
  const isDisabled =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
      ? element.disabled
      : element.getAttribute("aria-disabled") === "true";
  const isReadonly =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.readOnly
      : element.getAttribute("contenteditable") === "false" ||
        element.getAttribute("aria-readonly") === "true";

  const reasonCodes: FocusedFieldReasonCode[] = [];
  let score = 0;

  if (isTextarea) {
    score += 55;
    reasonCodes.push("textarea_detected");
  } else if (isContentEditable) {
    score += 50;
    reasonCodes.push("contenteditable_detected");
  } else if (isTextInput) {
    score += 20;
    reasonCodes.push("text_input_detected");
  } else {
    reasonCodes.push("not_editable");
  }

  if (isVisible) {
    score += 15;
    reasonCodes.push("visible");
  } else {
    score -= 35;
    reasonCodes.push("hidden_or_invisible");
  }

  if (isLargeEnough) {
    score += 20;
    reasonCodes.push("sufficient_size");
  } else {
    score -= 35;
    reasonCodes.push("tiny_field");
  }

  if (isDisabled) {
    score -= 60;
    reasonCodes.push("disabled");
  } else {
    reasonCodes.push("enabled");
  }

  if (isReadonly) {
    score -= 60;
    reasonCodes.push("readonly");
  } else {
    reasonCodes.push("editable");
  }

  if (isTextInput) {
    if (isSupportedTextInputType(normalizedType)) {
      score += 10;
      reasonCodes.push("supported_text_input_type");
    } else if (isExplicitlyUnsupportedTextInputType(normalizedType)) {
      score -= 60;
      reasonCodes.push("unsupported_input_type");
    } else {
      score -= 25;
      reasonCodes.push("unsupported_input_type");
    }
  }

  if (isLikelySensitiveField(sensitiveSnapshot)) {
    score -= 70;
    reasonCodes.push("likely_sensitive_field");
  }

  if (isLikelyOtpField(sensitiveSnapshot)) {
    score -= 70;
    reasonCodes.push("likely_otp_field");
  }

  if (hintGuess === "email_reply") {
    score += 10;
    reasonCodes.push("reply_intent_detected");
  } else if (hintGuess === "form_long_answer") {
    score += 10;
    reasonCodes.push("long_form_intent_detected");
  } else if (hintGuess === "generic_editor") {
    score += 10;
    reasonCodes.push("generic_editor_intent_detected");
  }

  const isTextInputCandidate = isTextInput && isSupportedTextInputType(normalizedType) && isLargeEnough;
  const fieldTypeGuess = getFieldTypeGuess(element, isTextInputCandidate, hintGuess);
  const blocked =
    reasonCodes.includes("hidden_or_invisible") ||
    reasonCodes.includes("disabled") ||
    reasonCodes.includes("readonly") ||
    reasonCodes.includes("unsupported_input_type") ||
    reasonCodes.includes("likely_sensitive_field") ||
    reasonCodes.includes("likely_otp_field") ||
    reasonCodes.includes("tiny_field") ||
    reasonCodes.includes("not_editable");
  const clampedScore = clampScore(score);
  const isCandidate = !blocked && clampedScore >= 45;

  if (isCandidate) {
    reasonCodes.push("candidate_long_form_target");
  }

  const reason = isCandidate
    ? "Focused field looks suitable for long-form drafting."
    : "Focused field is not a suitable long-form drafting target.";

  return focusedFieldDebugSchema.parse({
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: typeof element.className === "string" ? element.className : undefined,
    type: normalizedType || undefined,
    role: element.getAttribute("role") || undefined,
    isContentEditable,
    isDisabled,
    isReadonly,
    width: Math.round(size.width),
    height: Math.round(size.height),
    isCandidate,
    score: clampedScore,
    reasonCodes,
    fieldTypeGuess,
    reason,
  });
}

export function inspectFocusedField(doc: Document = document): FocusedFieldDebug {
  const activeElement = getDeepActiveElement(doc);
  const editableElement = resolveFocusedEditableElement(doc);
  const result = classifyFocusedField(editableElement);

  if (!editableElement || !activeElement || editableElement === activeElement) {
    return result;
  }

  return focusedFieldDebugSchema.parse({
    ...result,
    reasonCodes: [...result.reasonCodes, "nested_editable_root"],
  });
}
