import { resolveFocusedEditableElement } from "../detection/dom";
import { classifyFocusedField } from "../detection/classify";
import {
  insertionResultSchema,
  type InsertionMode,
  type InsertionResult,
} from "../shared/types";
import { applyToGmailContentEditable, isGmailContentEditableTarget } from "./gmailInsertion";
import { buildAppendText } from "./insertionUtils";

function dispatchEditableEvents(target: HTMLElement): void {
  target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function createFailure(mode: InsertionMode, message: string): InsertionResult {
  return insertionResultSchema.parse({
    ok: false,
    mode,
    message,
  });
}

function createSuccess(mode: InsertionMode, message: string): InsertionResult {
  return insertionResultSchema.parse({
    ok: true,
    mode,
    message,
  });
}

function applyToTextControl(
  element: HTMLInputElement | HTMLTextAreaElement,
  mode: Exclude<InsertionMode, "copy">,
  text: string,
): InsertionResult {
  const existingValue = element.value;

  if (mode === "replace") {
    element.value = text;
    const end = element.value.length;
    element.setSelectionRange(end, end);
    dispatchEditableEvents(element);
    return createSuccess(mode, "Replaced the focused field.");
  }

  if (mode === "append") {
    element.value = buildAppendText(existingValue, text);
    const end = element.value.length;
    element.setSelectionRange(end, end);
    dispatchEditableEvents(element);
    return createSuccess(mode, "Appended the generated draft.");
  }

  const start = element.selectionStart ?? existingValue.length;
  const end = element.selectionEnd ?? existingValue.length;

  if (typeof element.setRangeText === "function") {
    element.setRangeText(text, start, end, "end");
  } else {
    element.value = `${existingValue.slice(0, start)}${text}${existingValue.slice(end)}`;
    const caret = start + text.length;
    element.setSelectionRange(caret, caret);
  }

  dispatchEditableEvents(element);
  return createSuccess(mode, "Inserted the generated draft.");
}

function selectionBelongsToTarget(selection: Selection | null, target: HTMLElement): boolean {
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const anchorNode = selection.anchorNode;
  return Boolean(anchorNode && target.contains(anchorNode));
}

function applyToContentEditable(
  element: HTMLElement,
  mode: Exclude<InsertionMode, "copy">,
  text: string,
): InsertionResult {
  const selection = window.getSelection();
  const existingValue = element.innerText || element.textContent || "";

  if (mode === "replace") {
    element.textContent = text;
    dispatchEditableEvents(element);
    return createSuccess(mode, "Replaced the focused editor content.");
  }

  if (mode === "append") {
    element.textContent = buildAppendText(existingValue, text);
    dispatchEditableEvents(element);
    return createSuccess(mode, "Appended the generated draft.");
  }

  if (!selectionBelongsToTarget(selection, element)) {
    element.textContent = buildAppendText(existingValue, text);
    dispatchEditableEvents(element);
    return createSuccess(mode, "Inserted the generated draft at the end because the caret was unavailable.");
  }

  const range = selection!.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  selection!.removeAllRanges();
  selection!.addRange(range);
  dispatchEditableEvents(element);
  return createSuccess(mode, "Inserted the generated draft.");
}

export function applyGeneratedTextToFocusedField(
  mode: InsertionMode,
  text: string,
  doc: Document = document,
): InsertionResult {
  if (mode === "copy") {
    return createFailure(mode, "Copy is handled from the popup.");
  }

  const target = resolveFocusedEditableElement(doc);
  if (!target) {
    return createFailure(mode, "No supported focused field is available. Refocus the target field and try again.");
  }

  const debug = classifyFocusedField(target);
  if (!debug.isCandidate) {
    return createFailure(
      mode,
      "The focused field changed or is not supported for insertion. Refocus a supported drafting field and try again.",
    );
  }

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    return applyToTextControl(target, mode, text);
  }

  if (isGmailContentEditableTarget(target)) {
    return applyToGmailContentEditable(target, mode, text);
  }

  if (target.isContentEditable || target.getAttribute("contenteditable")) {
    return applyToContentEditable(target, mode, text);
  }

  return createFailure(mode, "The focused field is not supported for insertion.");
}
