export const SUPPORTED_TEXT_INPUT_TYPES = new Set(["", "text"]);

export const UNSUPPORTED_TEXT_INPUT_TYPES = new Set([
  "email",
  "hidden",
  "number",
  "password",
  "search",
  "tel",
]);

export const SENSITIVE_AUTOCOMPLETE_TOKENS = [
  "cc-",
  "current-password",
  "new-password",
  "one-time-code",
  "otp",
  "webauthn",
];

export const OTP_HINT_PATTERN =
  /\b(otp|2fa|mfa|verification|verify|one[-\s]?time|passcode|auth(?:entication)?\s?code|security\s?code)\b/i;

export const REPLY_HINT_PATTERN =
  /\b(reply|compose|message|mail|gmail|outlook|inbox|send\s?a\s?reply)\b/i;

export const LONG_FORM_HINT_PATTERN =
  /\b(answer|bio|comment|context|description|details|draft|essay|feedback|message|note|response|summary)\b/i;

export const GENERIC_EDITOR_HINT_PATTERN =
  /\b(editor|document|notion|prosemirror|quill|rich\s?text|slate|wysiwyg)\b/i;

export const MIN_VISIBLE_WIDTH = 140;
export const MIN_VISIBLE_HEIGHT = 24;
export const MIN_LARGE_INPUT_WIDTH = 280;
export const MIN_MULTILINE_HEIGHT = 60;
