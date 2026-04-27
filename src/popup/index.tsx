import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { backgroundResponseSchema, type BackgroundResponse } from "../messaging/contracts";
import type {
  ErrorCode,
  EffectiveSiteSettings,
  FocusedFieldContext,
  FocusedFieldDebug,
  FocusedFieldInspection,
  GmailQuickAction,
  GenerationOperation,
  GenerationResponse,
  InsertionMode,
  TaskClassification,
} from "../shared/types";
import "./styles.css";

type PopupInspectionResult = {
  hostname?: string;
  effectiveSettings?: EffectiveSiteSettings;
  inspection: FocusedFieldInspection;
  taskClassification?: TaskClassification;
  generation?: GenerationResponse;
};

type TransformSourceMode = "current_draft" | "focused_field";
type RecentError = {
  at: string;
  code?: ErrorCode;
  message: string;
  details?: string;
};

function formatReasonCode(reasonCode: string): string {
  return reasonCode.replace(/_/g, " ");
}

function PreviewBlock({
  label,
  value,
}: {
  label: string;
  value?: string;
}): JSX.Element | null {
  if (!value) {
    return null;
  }

  return (
    <div className="preview-block">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReplyInputPanel({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <section className="panel result-panel">
      <h2 className="section-title">Your Answer</h2>
      <label className="reply-seed-field">
        <textarea
          className="reply-seed-input"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="Add your rough answer, points to cover, or a short reply note. Pluto Text will turn it into a polished reply draft."
          rows={5}
          disabled={disabled}
        />
      </label>
      <p className="meta">
        Optional. This input is used only for the next draft generation in this popup session. Rewrite actions still use the current draft or focused field text.
      </p>
    </section>
  );
}

function summarizeContext(context?: FocusedFieldContext): string {
  if (!context) {
    return "No extracted context.";
  }

  const parts = [
    context.page.hostname,
    context.page.title,
    context.field.labelText || context.field.placeholder || context.field.tagName,
    context.gmail?.subject ? `Subject: ${context.gmail.subject}` : undefined,
    context.gmail?.recipients.length ? `Recipients: ${context.gmail.recipients.length}` : undefined,
    context.support?.issueSummary ? `Issue: ${context.support.issueSummary}` : undefined,
    context.support?.statusText ? `Status: ${context.support.statusText}` : undefined,
  ].filter(Boolean);

  return parts.join(" | ");
}

function SiteSettingsPanel({
  hostname,
  effectiveSettings,
}: {
  hostname?: string;
  effectiveSettings?: EffectiveSiteSettings;
}): JSX.Element | null {
  if (!effectiveSettings) {
    return null;
  }

  return (
    <section className="panel result-panel">
      <div className="result-header">
        <span className={`badge ${effectiveSettings.enabled ? "supported" : "unsupported"}`}>
          {effectiveSettings.enabled ? "Enabled" : "Disabled"}
        </span>
        <span className="score">{hostname || "unknown host"}</span>
      </div>

      <dl className="facts">
        <div>
          <dt>Effective tone</dt>
          <dd>{effectiveSettings.defaultTone}</dd>
        </div>
        <div>
          <dt>Effective length</dt>
          <dd>{effectiveSettings.defaultLength}</dd>
        </div>
        <div>
          <dt>Routing</dt>
          <dd>{effectiveSettings.routingMode}</dd>
        </div>
        <div>
          <dt>Debug mode</dt>
          <dd>{effectiveSettings.debugMode ? "on" : "off"}</dd>
        </div>
      </dl>
    </section>
  );
}

function GmailQuickActions({
  disabled,
  onAction,
}: {
  disabled: boolean;
  onAction: (quickAction: GmailQuickAction) => void;
}): JSX.Element {
  return (
    <section className="panel result-panel">
      <h2 className="section-title">Gmail Quick Actions</h2>
      <div className="insert-actions">
        <button className="button button-primary" onClick={() => onAction("draft_reply")} disabled={disabled}>
          Draft reply
        </button>
        <button
          className="button button-secondary"
          onClick={() => onAction("short_professional_reply")}
          disabled={disabled}
        >
          Short professional reply
        </button>
        <button
          className="button button-secondary"
          onClick={() => onAction("friendly_reply")}
          disabled={disabled}
        >
          Friendly reply
        </button>
        <button
          className="button button-secondary"
          onClick={() => onAction("follow_up_style_draft")}
          disabled={disabled}
        >
          Follow-up style draft
        </button>
      </div>
    </section>
  );
}

function DraftPanel({
  generation,
  previousGeneration,
}: {
  generation: GenerationResponse;
  previousGeneration?: GenerationResponse | null;
}): JSX.Element {
  return (
    <section className="panel result-panel">
      <h2 className="section-title">Generated Draft</h2>
      <pre className="draft-block">{generation.primary}</pre>

      {previousGeneration ? (
        <p className="meta">A previous draft version is available for this popup session.</p>
      ) : null}

      {generation.alternatives.length > 0 ? (
        <div className="context-section">
          <h3 className="section-title">Alternatives</h3>
          <div className="alternative-list">
            {generation.alternatives.map((alternative, index) => (
              <pre className="draft-block secondary-draft" key={`${index}-${alternative.slice(0, 24)}`}>
                {alternative}
              </pre>
            ))}
          </div>
        </div>
      ) : null}

      {generation.warnings && generation.warnings.length > 0 ? (
        <div className="warning-list">
          {generation.warnings.map((warning) => (
            <p className="warning-text" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TransformActions({
  disabled,
  sourceMode,
  onSourceModeChange,
  onAction,
  canUseCurrentDraft,
  canUseFieldText,
  canGoBack,
  onBack,
}: {
  disabled: boolean;
  sourceMode: TransformSourceMode;
  onSourceModeChange: (mode: TransformSourceMode) => void;
  onAction: (operation: Exclude<GenerationOperation, "draft">) => void;
  canUseCurrentDraft: boolean;
  canUseFieldText: boolean;
  canGoBack: boolean;
  onBack: () => void;
}): JSX.Element {
  return (
    <section className="panel result-panel">
      <h2 className="section-title">Rewrite Actions</h2>
      <div className="source-toggle">
        <button
          className={`chip-button ${sourceMode === "current_draft" ? "active" : ""}`}
          onClick={() => onSourceModeChange("current_draft")}
          disabled={disabled || !canUseCurrentDraft}
        >
          Use current draft
        </button>
        <button
          className={`chip-button ${sourceMode === "focused_field" ? "active" : ""}`}
          onClick={() => onSourceModeChange("focused_field")}
          disabled={disabled || !canUseFieldText}
        >
          Use focused field text
        </button>
      </div>
      <div className="insert-actions">
        <button className="button button-secondary" onClick={() => onAction("shorten")} disabled={disabled}>
          Shorter
        </button>
        <button
          className="button button-secondary"
          onClick={() => onAction("make_more_professional")}
          disabled={disabled}
        >
          More professional
        </button>
        <button
          className="button button-secondary"
          onClick={() => onAction("make_friendlier")}
          disabled={disabled}
        >
          Friendlier
        </button>
        <button className="button button-secondary" onClick={() => onAction("expand")} disabled={disabled}>
          Expand
        </button>
      </div>
      {canGoBack ? (
        <button className="link-button" onClick={onBack} disabled={disabled}>
          Back to previous draft
        </button>
      ) : null}
    </section>
  );
}

function DraftActions({
  disabled,
  onAction,
}: {
  disabled: boolean;
  onAction: (mode: InsertionMode) => void;
}): JSX.Element {
  return (
    <section className="panel result-panel">
      <h2 className="section-title">Draft Actions</h2>
      <div className="insert-actions">
        <button className="button button-primary" onClick={() => onAction("insert")} disabled={disabled}>
          Insert
        </button>
        <button className="button button-secondary" onClick={() => onAction("replace")} disabled={disabled}>
          Replace
        </button>
        <button className="button button-secondary" onClick={() => onAction("append")} disabled={disabled}>
          Append
        </button>
        <button className="button button-secondary" onClick={() => onAction("copy")} disabled={disabled}>
          Copy
        </button>
      </div>
    </section>
  );
}

function ClassificationPanel({
  debug,
  context,
  taskClassification,
  effectiveSettings,
  hostname,
  generation,
  previousGeneration,
  showRaw,
  onToggleRaw,
  draftInput,
}: {
  debug: FocusedFieldDebug;
  context?: FocusedFieldContext;
  taskClassification?: TaskClassification;
  effectiveSettings?: EffectiveSiteSettings;
  hostname?: string;
  generation?: GenerationResponse;
  previousGeneration?: GenerationResponse | null;
  showRaw: boolean;
  onToggleRaw: () => void;
  draftInput?: string;
}): JSX.Element {
  return (
    <section className="panel result-panel">
      <div className="result-header">
        <span className={`badge ${debug.isCandidate ? "supported" : "unsupported"}`}>
          {debug.isCandidate ? "Supported" : "Unsupported"}
        </span>
        <span className="score">Score {debug.score}</span>
      </div>

      <dl className="facts">
        <div>
          <dt>Field type guess</dt>
          <dd>{debug.fieldTypeGuess}</dd>
        </div>
        <div>
          <dt>Element</dt>
          <dd>
            {debug.tagName}
            {debug.type ? ` (${debug.type})` : ""}
          </dd>
        </div>
        <div>
          <dt>Task intent</dt>
          <dd>{taskClassification?.intent ?? "unknown"}</dd>
        </div>
        <div>
          <dt>Task tone/length</dt>
          <dd>
            {taskClassification ? `${taskClassification.tone} / ${taskClassification.length}` : "unknown"}
          </dd>
        </div>
      </dl>

      <p className="meta summary">{debug.reason}</p>

      <div className="reason-list">
        {debug.reasonCodes.map((reasonCode) => (
          <span className="reason-chip" key={reasonCode}>
            {formatReasonCode(reasonCode)}
          </span>
        ))}
      </div>

      {taskClassification ? (
        <section className="context-section">
          <h2 className="section-title">Task Classification</h2>
          <dl className="preview-grid">
            <PreviewBlock label="Intent" value={taskClassification.intent} />
            <PreviewBlock label="Tone" value={taskClassification.tone} />
            <PreviewBlock label="Length" value={taskClassification.length} />
            <PreviewBlock label="Instructions" value={taskClassification.instructions.join("\n")} />
          </dl>
        </section>
      ) : null}

      {context ? (
        <>
          <section className="context-section">
            <h2 className="section-title">Field Summary</h2>
            <dl className="preview-grid">
              <PreviewBlock label="Label" value={context.field.labelText} />
              <PreviewBlock label="Placeholder" value={context.field.placeholder} />
              <PreviewBlock label="Current text" value={context.field.currentText} />
              <PreviewBlock label="Page title" value={context.page.title} />
              <PreviewBlock label="URL" value={context.page.url} />
              <PreviewBlock label="Headings" value={context.page.headings.join("\n")} />
            </dl>
          </section>

          <section className="context-section">
            <h2 className="section-title">Nearby Context</h2>
            <dl className="preview-grid">
              <PreviewBlock label="Nearest container" value={context.nearby.nearestContainerText} />
              <PreviewBlock label="Text before" value={context.nearby.textBefore} />
              <PreviewBlock label="Text after" value={context.nearby.textAfter} />
              <PreviewBlock label="Help text" value={context.nearby.helpText} />
              <PreviewBlock label="Error text" value={context.nearby.errorText} />
            </dl>
          </section>

          {context.gmail ? (
            <section className="context-section">
              <h2 className="section-title">Gmail Context</h2>
              <dl className="preview-grid">
                <PreviewBlock label="Compose mode" value={context.gmail.composeModeGuess} />
                <PreviewBlock label="Subject" value={context.gmail.subject} />
                <PreviewBlock label="Recipients" value={context.gmail.recipients.join("\n")} />
                <PreviewBlock label="Thread text" value={context.gmail.threadText} />
              </dl>
            </section>
          ) : null}

          {context.support ? (
            <section className="context-section">
              <h2 className="section-title">Support Context</h2>
              <dl className="preview-grid">
                <PreviewBlock label="Issue summary" value={context.support.issueSummary} />
                <PreviewBlock label="Request details" value={context.support.requestDetails} />
                <PreviewBlock label="Conversation text" value={context.support.conversationText} />
                <PreviewBlock label="Status" value={context.support.statusText} />
              </dl>
            </section>
          ) : null}
        </>
      ) : (
        <p className="meta">No context extracted because the focused field is not a supported target.</p>
      )}

      <button className="link-button" onClick={onToggleRaw}>
        {showRaw ? "Hide raw JSON" : "Show raw JSON"}
      </button>
      {showRaw ? (
        <pre className="debug">
          {JSON.stringify(
            {
              hostname,
              effectiveSettings,
              taskClassification,
              generation,
              previousGeneration,
              draftInput,
              debug,
              context,
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </section>
  );
}

function DebugPanel({
  context,
  taskClassification,
  effectiveSettings,
  recentErrors,
}: {
  context?: FocusedFieldContext;
  taskClassification?: TaskClassification;
  effectiveSettings?: EffectiveSiteSettings;
  recentErrors: RecentError[];
}): JSX.Element {
  return (
    <section className="panel result-panel">
      <h2 className="section-title">Debug Summary</h2>
      <dl className="preview-grid">
        <PreviewBlock label="Extracted context" value={summarizeContext(context)} />
        <PreviewBlock
          label="Detected task"
          value={
            taskClassification
              ? `${taskClassification.intent} | ${taskClassification.tone} | ${taskClassification.length}`
              : "No task detected."
          }
        />
        <PreviewBlock
          label="Effective settings"
          value={
            effectiveSettings
              ? [
                  `enabled=${effectiveSettings.enabled}`,
                  `tone=${effectiveSettings.defaultTone}`,
                  `length=${effectiveSettings.defaultLength}`,
                  `routing=${effectiveSettings.routingMode}`,
                  `api=${effectiveSettings.localApiBaseUrl}`,
                ].join("\n")
              : "No effective settings available."
          }
        />
        <PreviewBlock
          label="Recent errors"
          value={
            recentErrors.length > 0
              ? recentErrors
                  .map((entry) =>
                    [entry.at, entry.code || "no_code", entry.message, entry.details]
                      .filter(Boolean)
                      .join(" | "),
                  )
                  .join("\n\n")
              : "No recent errors."
          }
        />
      </dl>
    </section>
  );
}

function PopupApp(): JSX.Element {
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<PopupInspectionResult | null>(null);
  const [previousGeneration, setPreviousGeneration] = useState<GenerationResponse | null>(null);
  const [transformSourceMode, setTransformSourceMode] =
    useState<TransformSourceMode>("current_draft");
  const [globalDebugMode, setGlobalDebugMode] = useState(false);
  const [recentErrors, setRecentErrors] = useState<RecentError[]>([]);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [transformBusy, setTransformBusy] = useState(false);
  const [insertBusy, setInsertBusy] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [draftInput, setDraftInput] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const rawResponse = (await chrome.runtime.sendMessage({
          type: "get-settings",
        })) as BackgroundResponse;
        const response = backgroundResponseSchema.parse(rawResponse);
        if (response.ok && response.settings) {
          setGlobalDebugMode(response.settings.debugMode);
        }
      } catch {
        setGlobalDebugMode(false);
      }
    })();
  }, []);

  function recordError(response: {
    message?: string;
    errorCode?: ErrorCode;
    errorDetails?: string;
  }) {
    setRecentErrors((current) =>
      [
        {
          at: new Date().toLocaleTimeString(),
          code: response.errorCode,
          message: response.message ?? "Unexpected error.",
          details: response.errorDetails,
        },
        ...current,
      ].slice(0, 5),
    );
  }

  function updateGeneration(nextGeneration?: GenerationResponse): void {
    setResult((current) => {
      if (!current) {
        return current;
      }

      if (current.generation && nextGeneration) {
        setPreviousGeneration(current.generation);
      }

      return {
        ...current,
        generation: nextGeneration,
      };
    });
  }

  function getFocusedFieldText(): string | undefined {
    return result?.inspection.context?.field.currentText?.trim() || undefined;
  }

  function getTransformSourceText(): string | undefined {
    if (transformSourceMode === "current_draft") {
      return result?.generation?.primary?.trim() || undefined;
    }

    return getFocusedFieldText();
  }

  async function inspectFocusedField(): Promise<void> {
    setInspectBusy(true);
    setError("");
    setResult(null);
    setPreviousGeneration(null);
    setShowRaw(false);
    setStatus("Inspecting the focused field, site settings, and task classification...");

    try {
      const rawResponse = (await chrome.runtime.sendMessage({
        type: "inspect-active-tab",
      })) as BackgroundResponse;
      const response = backgroundResponseSchema.parse(rawResponse);

      if (!response.ok || !response.inspection) {
        recordError(response);
        setError(response.message ?? "Unable to inspect the focused field.");
        setStatus("");
        return;
      }

      setStatus(response.message ?? "Inspection complete.");
      setResult({
        hostname: response.hostname,
        effectiveSettings: response.effectiveSettings,
        taskClassification: response.taskClassification,
        inspection: response.inspection,
        generation: response.generation,
      });
      setTransformSourceMode(response.generation ? "current_draft" : "focused_field");
    } catch (requestError) {
      recordError({
        message: requestError instanceof Error ? requestError.message : "Unexpected popup error.",
        errorCode: "unexpected_error",
      });
      setError(requestError instanceof Error ? requestError.message : "Unexpected popup error.");
      setStatus("");
    } finally {
      setInspectBusy(false);
    }
  }

  async function generateDraft(quickAction?: GmailQuickAction): Promise<void> {
    setGenerateBusy(true);
    setError("");
    setShowRaw(false);
    setStatus(
      quickAction
        ? `Generating ${quickAction.replace(/_/g, " ")} through the local API...`
        : "Generating a draft through the local API...",
    );

    try {
      const rawResponse = (await chrome.runtime.sendMessage({
        type: "generate-draft",
        quickAction,
        draftInput: draftInput.trim() || undefined,
      })) as BackgroundResponse;
      const response = backgroundResponseSchema.parse(rawResponse);

      if (!response.ok || !response.inspection || !response.generation) {
        recordError(response);
        setError(response.message ?? "Unable to generate a draft.");
        setStatus("");
        return;
      }

      setStatus(response.message ?? "Draft generated.");
      setResult({
        hostname: response.hostname,
        effectiveSettings: response.effectiveSettings,
        taskClassification: response.taskClassification,
        inspection: response.inspection,
        generation: response.generation,
      });
      setPreviousGeneration(null);
      setTransformSourceMode("current_draft");
    } catch (requestError) {
      recordError({
        message: requestError instanceof Error ? requestError.message : "Unexpected generation error.",
        errorCode: "unexpected_error",
      });
      setError(requestError instanceof Error ? requestError.message : "Unexpected generation error.");
      setStatus("");
    } finally {
      setGenerateBusy(false);
    }
  }

  async function transformDraft(operation: Exclude<GenerationOperation, "draft">): Promise<void> {
    const sourceText = getTransformSourceText();
    if (!sourceText) {
      recordError({
        message:
          "No source text is available for this rewrite. Generate a draft first or use focused field text.",
        errorCode: "unsupported_field",
      });
      setError("No source text is available for this rewrite. Generate a draft first or use focused field text.");
      return;
    }

    setTransformBusy(true);
    setError("");
    setShowRaw(false);
    setStatus(`Running ${operation.replace(/_/g, " ")} through the local API...`);

    try {
      const rawResponse = (await chrome.runtime.sendMessage({
        type: "transform-text",
        operation,
        sourceText,
      })) as BackgroundResponse;
      const response = backgroundResponseSchema.parse(rawResponse);

      if (!response.ok || !response.inspection || !response.generation) {
        recordError(response);
        setError(response.message ?? "Unable to transform the text.");
        setStatus("");
        return;
      }

      setStatus(response.message ?? "Text transformed.");
      setResult({
        hostname: response.hostname,
        effectiveSettings: response.effectiveSettings,
        taskClassification: response.taskClassification,
        inspection: response.inspection,
        generation: response.generation,
      });
      setPreviousGeneration((current) => current ?? result?.generation ?? null);
      setTransformSourceMode("current_draft");
    } catch (requestError) {
      recordError({
        message: requestError instanceof Error ? requestError.message : "Unexpected transform error.",
        errorCode: "unexpected_error",
      });
      setError(requestError instanceof Error ? requestError.message : "Unexpected transform error.");
      setStatus("");
    } finally {
      setTransformBusy(false);
    }
  }

  async function openOptions(): Promise<void> {
    await chrome.runtime.openOptionsPage();
  }

  async function applyDraft(mode: InsertionMode): Promise<void> {
    const text = result?.generation?.primary;
    if (!text) {
      recordError({
        message: "Generate a draft before trying to insert it.",
        errorCode: "unsupported_field",
      });
      setError("Generate a draft before trying to insert it.");
      return;
    }

    setInsertBusy(true);
    setError("");

    try {
      if (mode === "copy") {
        await navigator.clipboard.writeText(text);
        setStatus("Copied the generated draft to your clipboard.");
        return;
      }

      setStatus(`Applying ${mode} to the focused field...`);
      const rawResponse = (await chrome.runtime.sendMessage({
        type: "insert-generated-text",
        mode,
        text,
      })) as BackgroundResponse;
      const response = backgroundResponseSchema.parse(rawResponse);

      if (!response.ok) {
        recordError(response);
        setError(response.message ?? "Unable to apply the generated draft.");
        setStatus("");
        return;
      }

      setStatus(response.message ?? "Applied the generated draft.");
    } catch (requestError) {
      recordError({
        message: requestError instanceof Error ? requestError.message : "Unexpected insertion error.",
        errorCode:
          mode === "copy"
            ? "clipboard_error"
            : "unexpected_error",
      });
      setError(requestError instanceof Error ? requestError.message : "Unexpected insertion error.");
      setStatus("");
    } finally {
      setInsertBusy(false);
    }
  }

  function restorePreviousDraft(): void {
    if (!previousGeneration || !result) {
      return;
    }

    const currentGeneration = result.generation ?? null;
    setResult({
      ...result,
      generation: previousGeneration,
    });
    setPreviousGeneration(currentGeneration);
    setTransformSourceMode("current_draft");
    setStatus("Restored the previous draft version.");
    setError("");
  }

  const canUseCurrentDraft = Boolean(result?.generation?.primary);
  const canUseFieldText = Boolean(getFocusedFieldText());
  const actionBusy = inspectBusy || generateBusy || transformBusy || insertBusy;
  const isGmail = result?.hostname === "mail.google.com";
  const debugMode = Boolean(result?.effectiveSettings?.debugMode ?? globalDebugMode);

  return (
    <div className="shell">
      <section className="hero">
        <p className="eyebrow">Manual Trigger Only</p>
        <h1 className="title">Pluto Text</h1>
        <p className="subtitle">
          Phase 9 still only runs on click, but now the popup adds stronger debug visibility and
          error handling on top of the Gmail, drafting, rewriting, and insertion flows that are
          already fully user-controlled.
        </p>
      </section>

      <section className="panel action-panel">
        <ReplyInputPanel value={draftInput} onChange={setDraftInput} disabled={actionBusy} />
        <button
          className="button button-primary"
          onClick={() => void inspectFocusedField()}
          disabled={actionBusy}
        >
          {inspectBusy ? "Checking..." : "Check focused field"}
        </button>
        <button
          className="button button-secondary"
          onClick={() => void generateDraft()}
          disabled={actionBusy}
        >
          {generateBusy ? "Generating..." : "Generate draft"}
        </button>
      </section>

      <section className="panel">
        <p className="meta">
          Draft generation, rewrites, insertion, and copying all require explicit popup actions.
          Pluto Text never auto-submits forms, clicks send buttons, or modifies content unless you
          choose an action.
        </p>
        <p className={`status ${error ? "error" : ""}`}>{error || status}</p>
        <button className="link-button" onClick={() => void openOptions()}>
          Settings
        </button>
      </section>

      {result ? (
        <>
          <SiteSettingsPanel
            hostname={result.hostname}
            effectiveSettings={result.effectiveSettings}
          />
          {isGmail ? (
            <GmailQuickActions
              disabled={actionBusy}
              onAction={(quickAction) => void generateDraft(quickAction)}
            />
          ) : null}
          {result.generation ? (
            <DraftPanel
              generation={result.generation}
              previousGeneration={previousGeneration}
            />
          ) : null}
          {(canUseCurrentDraft || canUseFieldText) ? (
            <TransformActions
              disabled={actionBusy}
              sourceMode={transformSourceMode}
              onSourceModeChange={setTransformSourceMode}
              onAction={(operation) => void transformDraft(operation)}
              canUseCurrentDraft={canUseCurrentDraft}
              canUseFieldText={canUseFieldText}
              canGoBack={Boolean(previousGeneration)}
              onBack={restorePreviousDraft}
            />
          ) : null}
          {result.generation ? (
            <DraftActions
              disabled={actionBusy}
              onAction={(mode) => void applyDraft(mode)}
            />
          ) : null}
          <ClassificationPanel
            hostname={result.hostname}
            effectiveSettings={result.effectiveSettings}
            taskClassification={result.taskClassification}
            generation={result.generation}
            previousGeneration={previousGeneration}
            debug={result.inspection.debug}
            context={result.inspection.context}
            showRaw={showRaw}
            draftInput={draftInput.trim() || undefined}
            onToggleRaw={() => setShowRaw((current) => !current)}
          />
          {debugMode ? (
            <DebugPanel
              context={result.inspection.context}
              taskClassification={result.taskClassification}
              effectiveSettings={result.effectiveSettings}
              recentErrors={recentErrors}
            />
          ) : null}
        </>
      ) : debugMode && recentErrors.length > 0 ? (
        <DebugPanel recentErrors={recentErrors} />
      ) : null}
    </div>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Popup root element not found.");
}

createRoot(container).render(<PopupApp />);
