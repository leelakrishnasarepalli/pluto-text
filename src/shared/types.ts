import { z } from "zod";
import { DEFAULT_API_BASE_URL } from "./constants.ts";

export const toneSchema = z.enum([
  "professional",
  "concise",
  "friendly",
  "formal",
  "persuasive",
  "neutral",
]);

export type Tone = z.infer<typeof toneSchema>;

export const lengthSchema = z.enum(["short", "medium", "long"]);

export type Length = z.infer<typeof lengthSchema>;

export const routingModeSchema = z.enum(["local_only", "local_preferred_cloud_fallback"]);

export type RoutingMode = z.infer<typeof routingModeSchema>;

export const effectiveSiteSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  defaultTone: toneSchema.default("professional"),
  defaultLength: lengthSchema.default("medium"),
  includeGreeting: z.boolean().default(true),
  includeSignoff: z.boolean().default(false),
  signoffText: z.string().default(""),
  routingMode: routingModeSchema.default("local_only"),
  localApiBaseUrl: z.string().url().default(DEFAULT_API_BASE_URL),
  cloudFallbackEnabled: z.boolean().default(false),
  debugMode: z.boolean().default(false),
});

export type EffectiveSiteSettings = z.infer<typeof effectiveSiteSettingsSchema>;

export const siteOverrideSettingsSchema = effectiveSiteSettingsSchema.partial();

export type SiteOverrideSettings = z.infer<typeof siteOverrideSettingsSchema>;

export const extensionSettingsSchema = effectiveSiteSettingsSchema.extend({
  siteOverrides: z.record(z.string(), siteOverrideSettingsSchema).default({}),
});

export type ExtensionSettings = z.infer<typeof extensionSettingsSchema>;

export const taskIntentSchema = z.enum([
  "email_reply",
  "form_answer",
  "support_reply",
  "generic_draft",
]);

export type TaskIntent = z.infer<typeof taskIntentSchema>;

export const taskClassificationSchema = z.object({
  intent: taskIntentSchema,
  tone: toneSchema,
  length: lengthSchema,
  instructions: z.array(z.string()),
});

export type TaskClassification = z.infer<typeof taskClassificationSchema>;

export const focusedFieldReasonCodeSchema = z.enum([
  "no_focus_target",
  "not_editable",
  "nested_editable_root",
  "visible",
  "hidden_or_invisible",
  "enabled",
  "disabled",
  "editable",
  "readonly",
  "textarea_detected",
  "contenteditable_detected",
  "text_input_detected",
  "supported_text_input_type",
  "unsupported_input_type",
  "sufficient_size",
  "tiny_field",
  "likely_sensitive_field",
  "likely_otp_field",
  "reply_intent_detected",
  "long_form_intent_detected",
  "generic_editor_intent_detected",
  "candidate_long_form_target",
]);

export type FocusedFieldReasonCode = z.infer<typeof focusedFieldReasonCodeSchema>;

export const focusedFieldTypeGuessSchema = z.enum([
  "email_reply",
  "form_long_answer",
  "generic_editor",
  "unknown",
]);

export type FocusedFieldTypeGuess = z.infer<typeof focusedFieldTypeGuessSchema>;

export const focusedFieldDebugSchema = z.object({
  tagName: z.string(),
  id: z.string().optional(),
  className: z.string().optional(),
  type: z.string().optional(),
  role: z.string().optional(),
  isContentEditable: z.boolean(),
  isDisabled: z.boolean(),
  isReadonly: z.boolean(),
  width: z.number(),
  height: z.number(),
  isCandidate: z.boolean(),
  score: z.number(),
  reasonCodes: z.array(focusedFieldReasonCodeSchema),
  fieldTypeGuess: focusedFieldTypeGuessSchema,
  reason: z.string(),
});

export type FocusedFieldDebug = z.infer<typeof focusedFieldDebugSchema>;

export const contextPageSchema = z.object({
  url: z.string(),
  hostname: z.string(),
  title: z.string(),
  headings: z.array(z.string()),
});

export type ContextPage = z.infer<typeof contextPageSchema>;

export const contextFieldSchema = z.object({
  tagName: z.string(),
  inputType: z.string().optional(),
  placeholder: z.string().optional(),
  ariaLabel: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  currentText: z.string().optional(),
  labelText: z.string().optional(),
  fieldTypeGuess: focusedFieldTypeGuessSchema,
});

export type ContextField = z.infer<typeof contextFieldSchema>;

export const contextNearbySchema = z.object({
  nearestContainerText: z.string().optional(),
  textBefore: z.string().optional(),
  textAfter: z.string().optional(),
  helpText: z.string().optional(),
  errorText: z.string().optional(),
});

export type ContextNearby = z.infer<typeof contextNearbySchema>;

export const gmailComposeModeGuessSchema = z.enum(["reply", "new_message", "unknown"]);

export type GmailComposeModeGuess = z.infer<typeof gmailComposeModeGuessSchema>;

export const gmailContextSchema = z.object({
  subject: z.string().optional(),
  recipients: z.array(z.string()),
  threadText: z.string().optional(),
  recentThreadTurns: z.array(z.string()).optional(),
  requestDetails: z.string().optional(),
  truncatedSections: z.array(z.string()).optional(),
  composeModeGuess: gmailComposeModeGuessSchema,
});

export type GmailContext = z.infer<typeof gmailContextSchema>;

export const supportContextSchema = z.object({
  issueSummary: z.string().optional(),
  requestDetails: z.string().optional(),
  conversationText: z.string().optional(),
  recentConversationTurns: z.array(z.string()).optional(),
  statusText: z.string().optional(),
  truncatedSections: z.array(z.string()).optional(),
});

export type SupportContext = z.infer<typeof supportContextSchema>;

export const focusedFieldContextSchema = z.object({
  page: contextPageSchema,
  field: contextFieldSchema,
  nearby: contextNearbySchema,
  gmail: gmailContextSchema.optional(),
  support: supportContextSchema.optional(),
});

export type FocusedFieldContext = z.infer<typeof focusedFieldContextSchema>;

export const focusedFieldInspectionSchema = z.object({
  debug: focusedFieldDebugSchema,
  context: focusedFieldContextSchema.optional(),
});

export type FocusedFieldInspection = z.infer<typeof focusedFieldInspectionSchema>;

export const generationOperationSchema = z.enum([
  "draft",
  "shorten",
  "make_more_professional",
  "make_friendlier",
  "expand",
]);

export type GenerationOperation = z.infer<typeof generationOperationSchema>;

export const generationRequestSchema = z.object({
  operation: generationOperationSchema,
  context: focusedFieldContextSchema,
  task: taskClassificationSchema,
  effectiveSettings: effectiveSiteSettingsSchema,
  sourceText: z.string().optional(),
  draftInput: z.string().optional(),
});

export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export const generationResponseSchema = z.object({
  primary: z.string(),
  alternatives: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
});

export type GenerationResponse = z.infer<typeof generationResponseSchema>;

export const gmailQuickActionSchema = z.enum([
  "draft_reply",
  "short_professional_reply",
  "friendly_reply",
  "follow_up_style_draft",
]);

export type GmailQuickAction = z.infer<typeof gmailQuickActionSchema>;

export const insertionModeSchema = z.enum(["insert", "replace", "append", "copy"]);

export type InsertionMode = z.infer<typeof insertionModeSchema>;

export const insertionResultSchema = z.object({
  ok: z.boolean(),
  mode: insertionModeSchema,
  message: z.string(),
});

export type InsertionResult = z.infer<typeof insertionResultSchema>;

export const errorCodeSchema = z.enum([
  "invalid_message",
  "active_tab_unavailable",
  "content_script_unavailable",
  "no_focused_field",
  "unsupported_field",
  "local_api_unavailable",
  "local_api_timeout",
  "malformed_api_response",
  "focus_changed",
  "clipboard_error",
  "unexpected_error",
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;
