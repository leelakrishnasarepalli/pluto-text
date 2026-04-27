import type { InsertionMode, InsertionResult } from "../shared/types";
import { insertionResultSchema } from "../shared/types";
import { buildAppendText } from "./insertionUtils";

function createSuccess(mode: InsertionMode, message: string): InsertionResult {
  return insertionResultSchema.parse({
    ok: true,
    mode,
    message,
  });
}

function selectionBelongsToTarget(selection: Selection | null, target: HTMLElement): boolean {
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const anchorNode = selection.anchorNode;
  return Boolean(anchorNode && target.contains(anchorNode));
}

function dispatchEditableEvents(target: HTMLElement): void {
  target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function moveCaretToEnd(target: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function createGmailFragment(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const lines = text.split("\n");

  for (const line of lines) {
    const block = document.createElement("div");
    if (line.length === 0) {
      block.appendChild(document.createElement("br"));
    } else {
      block.textContent = line;
    }
    fragment.appendChild(block);
  }

  return fragment;
}

export function isGmailContentEditableTarget(element: HTMLElement): boolean {
  if (window.location.hostname !== "mail.google.com") {
    return false;
  }

  if (!element.isContentEditable && !element.getAttribute("contenteditable")) {
    return false;
  }

  const ariaLabel = (element.getAttribute("aria-label") || "").toLowerCase();
  const role = (element.getAttribute("role") || "").toLowerCase();

  return role === "textbox" || /message body|compose|reply/.test(ariaLabel);
}

export function applyToGmailContentEditable(
  element: HTMLElement,
  mode: Exclude<InsertionMode, "copy">,
  text: string,
): InsertionResult {
  const selection = window.getSelection();
  const existingValue = element.innerText || element.textContent || "";

  if (mode === "replace") {
    element.replaceChildren(createGmailFragment(text));
    moveCaretToEnd(element);
    dispatchEditableEvents(element);
    return createSuccess(mode, "Replaced the Gmail editor content.");
  }

  if (mode === "append") {
    const nextValue = buildAppendText(existingValue, text);
    element.replaceChildren(createGmailFragment(nextValue));
    moveCaretToEnd(element);
    dispatchEditableEvents(element);
    return createSuccess(mode, "Appended the generated draft in Gmail.");
  }

  if (selectionBelongsToTarget(selection, element) && document.queryCommandSupported?.("insertText")) {
    document.execCommand("insertText", false, text);
    dispatchEditableEvents(element);
    return createSuccess(mode, "Inserted the generated draft in Gmail.");
  }

  const nextValue = buildAppendText(existingValue, text);
  element.replaceChildren(createGmailFragment(nextValue));
  moveCaretToEnd(element);
  dispatchEditableEvents(element);
  return createSuccess(mode, "Inserted the generated draft at the end of the Gmail editor.");
}
