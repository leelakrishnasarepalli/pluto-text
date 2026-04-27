import {
  GENERIC_EDITOR_HINT_PATTERN,
  LONG_FORM_HINT_PATTERN,
  MIN_LARGE_INPUT_WIDTH,
  MIN_MULTILINE_HEIGHT,
  MIN_VISIBLE_HEIGHT,
  MIN_VISIBLE_WIDTH,
  OTP_HINT_PATTERN,
  REPLY_HINT_PATTERN,
  SENSITIVE_AUTOCOMPLETE_TOKENS,
  SUPPORTED_TEXT_INPUT_TYPES,
  UNSUPPORTED_TEXT_INPUT_TYPES,
} from "./constants.ts";

export type VisibilitySnapshot = {
  display: string;
  hidden: boolean;
  opacity: string;
  visibility: string;
  width: number;
  height: number;
};

export type SizeSnapshot = {
  tagName: string;
  width: number;
  height: number;
  isContentEditable: boolean;
  rows?: number;
};

export type SensitiveFieldSnapshot = {
  autocomplete?: string;
  inputMode?: string;
  maxLength?: number;
  name?: string;
  placeholder?: string;
  type?: string;
  ariaLabel?: string;
  id?: string;
};

export function normalizeTextInputType(type?: string | null): string {
  return (type ?? "").trim().toLowerCase();
}

export function isSupportedTextInputType(type?: string | null): boolean {
  const normalized = normalizeTextInputType(type);
  return SUPPORTED_TEXT_INPUT_TYPES.has(normalized);
}

export function isExplicitlyUnsupportedTextInputType(type?: string | null): boolean {
  const normalized = normalizeTextInputType(type);
  return UNSUPPORTED_TEXT_INPUT_TYPES.has(normalized);
}

export function isVisibleBySnapshot(snapshot: VisibilitySnapshot): boolean {
  if (snapshot.hidden) {
    return false;
  }

  if (snapshot.display === "none" || snapshot.visibility === "hidden") {
    return false;
  }

  const opacity = Number.parseFloat(snapshot.opacity || "1");
  if (!Number.isNaN(opacity) && opacity <= 0) {
    return false;
  }

  return snapshot.width >= MIN_VISIBLE_WIDTH && snapshot.height >= MIN_VISIBLE_HEIGHT;
}

export function isLargeEnoughForDrafting(snapshot: SizeSnapshot): boolean {
  if (snapshot.isContentEditable || snapshot.tagName === "textarea") {
    return snapshot.width >= MIN_VISIBLE_WIDTH && snapshot.height >= MIN_MULTILINE_HEIGHT;
  }

  const hasTextareaLikeRows = typeof snapshot.rows === "number" && snapshot.rows >= 3;
  return snapshot.width >= MIN_LARGE_INPUT_WIDTH && (snapshot.height >= 32 || hasTextareaLikeRows);
}

export function buildFieldHintText(snapshot: SensitiveFieldSnapshot): string {
  return [
    snapshot.id,
    snapshot.name,
    snapshot.placeholder,
    snapshot.ariaLabel,
    snapshot.autocomplete,
    snapshot.type,
  ]
    .filter(Boolean)
    .join(" ");
}

export function isLikelyOtpField(snapshot: SensitiveFieldSnapshot): boolean {
  const hintText = buildFieldHintText(snapshot);
  const maxLength = snapshot.maxLength ?? Number.POSITIVE_INFINITY;
  const numericMode = snapshot.inputMode === "numeric" || snapshot.inputMode === "decimal";

  return (
    OTP_HINT_PATTERN.test(hintText) ||
    snapshot.autocomplete === "one-time-code" ||
    (numericMode && maxLength <= 8)
  );
}

export function isLikelySensitiveField(snapshot: SensitiveFieldSnapshot): boolean {
  const normalizedType = normalizeTextInputType(snapshot.type);
  if (normalizedType === "password") {
    return true;
  }

  const autocomplete = (snapshot.autocomplete ?? "").toLowerCase();
  if (SENSITIVE_AUTOCOMPLETE_TOKENS.some((token) => autocomplete.includes(token))) {
    return true;
  }

  return isLikelyOtpField(snapshot);
}

export function guessFieldIntent(
  hintText: string,
): "email_reply" | "form_long_answer" | "generic_editor" | "unknown" {
  if (REPLY_HINT_PATTERN.test(hintText)) {
    return "email_reply";
  }

  if (LONG_FORM_HINT_PATTERN.test(hintText)) {
    return "form_long_answer";
  }

  if (GENERIC_EDITOR_HINT_PATTERN.test(hintText)) {
    return "generic_editor";
  }

  return "unknown";
}

export function getElementVisibilitySnapshot(element: HTMLElement): VisibilitySnapshot {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return {
    display: style.display,
    hidden: element.hidden,
    opacity: style.opacity,
    visibility: style.visibility,
    width: rect.width,
    height: rect.height,
  };
}

export function isElementVisible(element: HTMLElement): boolean {
  return isVisibleBySnapshot(getElementVisibilitySnapshot(element));
}

export function getElementSizeSnapshot(element: HTMLElement): SizeSnapshot {
  const rect = element.getBoundingClientRect();

  return {
    tagName: element.tagName.toLowerCase(),
    width: rect.width,
    height: rect.height,
    isContentEditable: element.isContentEditable,
    rows: element instanceof HTMLTextAreaElement ? element.rows : undefined,
  };
}

export function isElementLargeEnoughForDrafting(element: HTMLElement): boolean {
  return isLargeEnoughForDrafting(getElementSizeSnapshot(element));
}

export function getSensitiveFieldSnapshot(element: HTMLElement): SensitiveFieldSnapshot {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return {
      autocomplete: element.autocomplete || undefined,
      inputMode: element.inputMode || undefined,
      maxLength: element.maxLength > 0 ? element.maxLength : undefined,
      name: element.name || undefined,
      placeholder: element.placeholder || undefined,
      type: element instanceof HTMLInputElement ? element.type || undefined : undefined,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      id: element.id || undefined,
    };
  }

  return {
    autocomplete: element.getAttribute("autocomplete") || undefined,
    inputMode: element.getAttribute("inputmode") || undefined,
    maxLength: undefined,
    name: element.getAttribute("name") || undefined,
    placeholder: element.getAttribute("placeholder") || undefined,
    type: undefined,
    ariaLabel: element.getAttribute("aria-label") || undefined,
    id: element.id || undefined,
  };
}
