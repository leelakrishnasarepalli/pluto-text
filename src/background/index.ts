import { getActiveTab, sendTabMessage } from "../shared/chrome";
import { postJsonWithTimeout } from "../shared/http";
import { ensureSettings, getSettings, saveSettings } from "../shared/storage";
import { applyGmailQuickAction } from "../shared/gmailQuickActions";
import { resolveEffectiveSiteSettings } from "../shared/settings";
import { classifyDraftTask } from "../shared/taskClassification";
import {
  backgroundResponseSchema,
  popupToBackgroundMessageSchema,
} from "../messaging/contracts";
import {
  extensionSettingsSchema,
  type ErrorCode,
  type GenerationOperation,
  generationRequestSchema,
  generationResponseSchema,
  focusedFieldInspectionSchema,
  insertionResultSchema,
} from "../shared/types";
import { ZodError } from "zod";

const GENERATION_TIMEOUT_MS = 75_000;

function buildErrorResponse(
  message: string,
  errorCode: ErrorCode,
  errorDetails?: string,
) {
  return backgroundResponseSchema.parse({
    ok: false,
    message,
    errorCode,
    errorDetails,
  });
}

function normalizeBackgroundError(error: unknown) {
  if (error instanceof ZodError) {
    return buildErrorResponse(
      "Received malformed data while processing the request.",
      "malformed_api_response",
      error.message,
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected error.";

  if (/No active tab found/i.test(message)) {
    return buildErrorResponse(
      "No active tab is available right now. Focus a regular browser tab and try again.",
      "active_tab_unavailable",
      message,
    );
  }

  if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
    return buildErrorResponse(
      "The page helper is not ready on this tab. Reload the page and try again.",
      "content_script_unavailable",
      message,
    );
  }

  if (/timed out/i.test(message)) {
    return buildErrorResponse(
      "Draft generation took longer than expected. Check your local model or OpenAI fallback configuration and try again.",
      "local_api_timeout",
      message,
    );
  }

  if (/Unable to reach the local draft API/i.test(message)) {
    return buildErrorResponse(
      "The local draft API is unavailable. Start the local API server and verify the base URL in settings.",
      "local_api_unavailable",
      message,
    );
  }

  if (/invalid JSON|malformed/i.test(message)) {
    return buildErrorResponse(
      "The local draft API returned malformed data.",
      "malformed_api_response",
      message,
    );
  }

  if (/No supported focused field/i.test(message)) {
    return buildErrorResponse(message, "no_focused_field", message);
  }

  if (/focused field changed|not supported for insertion|supported draft target/i.test(message)) {
    return buildErrorResponse(message, "focus_changed", message);
  }

  if (/disabled for this site/i.test(message) || /not a supported draft target/i.test(message)) {
    return buildErrorResponse(message, "unsupported_field", message);
  }

  return buildErrorResponse(message, "unexpected_error", message);
}

async function collectActiveTabState() {
  const tab = await getActiveTab();
  if (!tab.id) {
    throw new Error("No active tab found.");
  }

  const rawResponse = await sendTabMessage<unknown>(tab.id, {
    type: "inspect-focused-field",
  });
  const inspection = focusedFieldInspectionSchema.parse(rawResponse);
  const settings = await getSettings();
  const hostname =
    inspection.context?.page.hostname ??
    (() => {
      try {
        return tab.url ? new URL(tab.url).hostname : "";
      } catch {
        return "";
      }
    })();
  const effectiveSettings = resolveEffectiveSiteSettings(settings, hostname);
  const taskClassification = classifyDraftTask({
    hostname,
    inspection,
    effectiveSettings,
  });

  return {
    tab,
    inspection,
    settings,
    hostname,
    effectiveSettings,
    taskClassification,
  };
}

async function runGenerationOperationForActiveTab(
  operation: GenerationOperation,
  sourceText?: string,
  quickAction?: import("../shared/types").GmailQuickAction,
  draftInput?: string,
) {
  const state = await collectActiveTabState();

  if (!state.effectiveSettings.enabled) {
    throw new Error("Pluto Text is disabled for this site.");
  }

  if (!state.inspection.context || !state.inspection.debug.isCandidate) {
    throw new Error("The focused field is not a supported draft target.");
  }

  const normalizedSourceText = sourceText?.trim();
  const normalizedDraftInput = draftInput?.trim();
  const fallbackFieldText = state.inspection.context.field.currentText?.trim();

  if (operation !== "draft" && !normalizedSourceText && !fallbackFieldText) {
    throw new Error("No source text is available to transform. Generate a draft first or focus a field that already has text.");
  }

  const payload = generationRequestSchema.parse({
    operation,
    context: state.inspection.context,
    task:
      operation === "draft"
        ? applyGmailQuickAction(state.taskClassification, quickAction)
        : state.taskClassification,
    effectiveSettings: state.effectiveSettings,
    sourceText: operation === "draft" ? undefined : normalizedSourceText || fallbackFieldText,
    draftInput: operation === "draft" ? normalizedDraftInput || undefined : undefined,
  });

  const endpoint = new URL("/generate", state.effectiveSettings.localApiBaseUrl).toString();

  let response: Response;
  try {
    response = await postJsonWithTimeout(endpoint, payload, GENERATION_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Draft generation timed out.");
    }

    throw new Error(
      error instanceof Error ? `Unable to reach the local draft API: ${error.message}` : "Unable to reach the local draft API.",
    );
  }

  let responseJson: unknown;
  try {
    responseJson = await response.json();
  } catch {
    throw new Error("The local draft API returned invalid JSON.");
  }

  if (!response.ok) {
    const apiError =
      responseJson && typeof responseJson === "object" && "error" in responseJson
        ? String((responseJson as { error?: unknown }).error)
        : `Draft generation failed with status ${response.status}.`;
    throw new Error(apiError);
  }

  const generation = generationResponseSchema.parse(responseJson);

  return {
    ...state,
    generation,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureSettings();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const parsed = popupToBackgroundMessageSchema.safeParse(message);
  if (!parsed.success) {
    sendResponse(buildErrorResponse("Invalid message.", "invalid_message", parsed.error.message));
    return false;
  }

  void (async () => {
    try {
      if (parsed.data.type === "inspect-active-tab") {
        const state = await collectActiveTabState();

        sendResponse(
          backgroundResponseSchema.parse({
            ok: true,
            message: state.inspection.debug.reason,
            hostname: state.hostname,
            settings: state.settings,
            effectiveSettings: state.effectiveSettings,
            taskClassification: state.taskClassification,
            inspection: state.inspection,
          }),
        );
        return;
      }

      if (parsed.data.type === "get-settings") {
        sendResponse(
          backgroundResponseSchema.parse({
            ok: true,
            settings: await ensureSettings(),
          }),
        );
        return;
      }

      if (parsed.data.type === "generate-draft") {
        const state = await runGenerationOperationForActiveTab(
          "draft",
          undefined,
          parsed.data.quickAction,
          parsed.data.draftInput,
        );

        sendResponse(
          backgroundResponseSchema.parse({
            ok: true,
            message: "Draft generated.",
            hostname: state.hostname,
            settings: state.settings,
            effectiveSettings: state.effectiveSettings,
            taskClassification:
              parsed.data.quickAction
                ? applyGmailQuickAction(state.taskClassification, parsed.data.quickAction)
                : state.taskClassification,
            inspection: state.inspection,
            generation: state.generation,
          }),
        );
        return;
      }

      if (parsed.data.type === "transform-text") {
        const state = await runGenerationOperationForActiveTab(
          parsed.data.operation,
          parsed.data.sourceText,
        );

        sendResponse(
          backgroundResponseSchema.parse({
            ok: true,
            message: "Text transformed.",
            hostname: state.hostname,
            settings: state.settings,
            effectiveSettings: state.effectiveSettings,
            taskClassification: state.taskClassification,
            inspection: state.inspection,
            generation: state.generation,
          }),
        );
        return;
      }

      if (parsed.data.type === "insert-generated-text") {
        const tab = await getActiveTab();
        if (!tab.id) {
          throw new Error("No active tab found.");
        }

        const rawResponse = await sendTabMessage<unknown>(tab.id, {
          type: "apply-generated-text",
          mode: parsed.data.mode,
          text: parsed.data.text,
        });
        const insertion = insertionResultSchema.parse(rawResponse);

        sendResponse(
          backgroundResponseSchema.parse({
            ok: insertion.ok,
            message: insertion.message,
            insertion,
          }),
        );
        return;
      }

      const settings = extensionSettingsSchema.parse(parsed.data.settings);
      await saveSettings(settings);
      sendResponse(
        backgroundResponseSchema.parse({
          ok: true,
          message: "Settings saved.",
          settings,
        }),
      );
    } catch (error) {
      sendResponse(normalizeBackgroundError(error));
    }
  })();

  return true;
});
