import { z } from "zod";
import {
  effectiveSiteSettingsSchema,
  errorCodeSchema,
  extensionSettingsSchema,
  gmailQuickActionSchema,
  generationResponseSchema,
  focusedFieldInspectionSchema,
  insertionModeSchema,
  insertionResultSchema,
  taskClassificationSchema,
} from "../shared/types.ts";

export const backgroundToContentMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inspect-focused-field"),
  }),
  z.object({
    type: z.literal("apply-generated-text"),
    mode: insertionModeSchema,
    text: z.string(),
  }),
]);

export type BackgroundToContentMessage = z.infer<typeof backgroundToContentMessageSchema>;

export const popupToBackgroundMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inspect-active-tab"),
  }),
  z.object({
    type: z.literal("get-settings"),
  }),
  z.object({
    type: z.literal("save-settings"),
    settings: extensionSettingsSchema,
  }),
  z.object({
    type: z.literal("generate-draft"),
    quickAction: gmailQuickActionSchema.optional(),
    draftInput: z.string().optional(),
  }),
  z.object({
    type: z.literal("transform-text"),
    operation: z.enum([
      "shorten",
      "make_more_professional",
      "make_friendlier",
      "expand",
    ]),
    sourceText: z.string().optional(),
  }),
  z.object({
    type: z.literal("insert-generated-text"),
    mode: insertionModeSchema,
    text: z.string(),
  }),
]);

export type PopupToBackgroundMessage = z.infer<typeof popupToBackgroundMessageSchema>;

export const backgroundResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
  errorCode: errorCodeSchema.optional(),
  errorDetails: z.string().optional(),
  hostname: z.string().optional(),
  settings: extensionSettingsSchema.optional(),
  effectiveSettings: effectiveSiteSettingsSchema.optional(),
  taskClassification: taskClassificationSchema.optional(),
  inspection: focusedFieldInspectionSchema.optional(),
  generation: generationResponseSchema.optional(),
  insertion: insertionResultSchema.optional(),
});

export type BackgroundResponse = z.infer<typeof backgroundResponseSchema>;
