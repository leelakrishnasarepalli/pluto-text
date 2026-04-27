import type {
  FocusedFieldContext,
  FocusedFieldDebug,
  FocusedFieldInspection,
} from "../shared/types";
import { focusedFieldContextSchema, focusedFieldInspectionSchema } from "../shared/types";
import { resolveFocusedEditableElement } from "./dom";
import { normalizeExtractedText, truncateText, joinTextLines, dedupeRepeatedTextLines } from "./contextUtils";
import { extractGmailContext } from "./gmail";
import { extractSupportContext } from "./support";
import { normalizeTextInputType } from "./utils";
import { inspectFocusedField } from "./classify";

const MAX_HEADINGS = 5;
const MAX_HEADING_CHARS = 100;
const MAX_FIELD_TEXT_CHARS = 400;
const MAX_LABEL_CHARS = 140;
const MAX_CONTAINER_TEXT_CHARS = 420;
const MAX_NEARBY_TEXT_CHARS = 220;
const MAX_HELP_TEXT_CHARS = 220;
function isExtractableElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const opacity = Number.parseFloat(style.opacity || "1");

  return !(
    element.hidden ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    (!Number.isNaN(opacity) && opacity <= 0) ||
    rect.width <= 0 ||
    rect.height <= 0
  );
}

function safeVisibleText(element: Element | null | undefined, maxChars: number): string | undefined {
  if (!(element instanceof HTMLElement)) {
    return undefined;
  }

  if (!isExtractableElementVisible(element)) {
    return undefined;
  }

  return truncateText(element.innerText || element.textContent || "", maxChars) || undefined;
}

function getElementTextValue(element: HTMLElement): string | undefined {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return truncateText(element.value || "", MAX_FIELD_TEXT_CHARS) || undefined;
  }

  return truncateText(element.innerText || element.textContent || "", MAX_FIELD_TEXT_CHARS) || undefined;
}

function isMeaningfulContainer(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  if (["article", "aside", "fieldset", "form", "main", "section"].includes(tagName)) {
    return true;
  }

  const role = (element.getAttribute("role") || "").toLowerCase();
  if (["dialog", "form", "group", "region"].includes(role)) {
    return true;
  }

  const classAndId = `${element.className || ""} ${element.id || ""}`.toLowerCase();
  return /(compose|container|content|editor|form|panel|reply|section|thread)/.test(classAndId);
}

export function findNearestMeaningfulContainer(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;

  while (current) {
    if (isMeaningfulContainer(current) && isExtractableElementVisible(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return element.parentElement;
}

function getTopVisibleHeadings(doc: Document): string[] {
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3"))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => isExtractableElementVisible(element))
    .map((element) => truncateText(element.innerText || element.textContent || "", MAX_HEADING_CHARS))
    .filter(Boolean);

  return dedupeRepeatedTextLines(headings).slice(0, MAX_HEADINGS);
}

function getLabelText(element: HTMLElement): string | undefined {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.labels?.length) {
      return joinTextLines(
        Array.from(element.labels).map((label) => label.innerText || label.textContent || ""),
        MAX_LABEL_CHARS,
      );
    }
  }

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelTexts = labelledBy
      .split(/\s+/)
      .map((id) => safeVisibleText(document.getElementById(id), MAX_LABEL_CHARS))
      .filter((text): text is string => Boolean(text));
    const combined = joinTextLines(labelTexts, MAX_LABEL_CHARS);
    if (combined) {
      return combined;
    }
  }

  const wrappingLabel = element.closest("label");
  return safeVisibleText(wrappingLabel, MAX_LABEL_CHARS);
}

function getContextSiblingsText(element: HTMLElement): {
  before?: string;
  after?: string;
} {
  const parent = element.parentElement;
  if (!parent) {
    return {};
  }

  const siblings = Array.from(parent.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child !== element && isExtractableElementVisible(child),
  );
  const elementIndex = Array.from(parent.children).indexOf(element);
  const beforeElements = siblings.filter((child) => Array.from(parent.children).indexOf(child) < elementIndex);
  const afterElements = siblings.filter((child) => Array.from(parent.children).indexOf(child) > elementIndex);

  return {
    before: joinTextLines(
      beforeElements.slice(-3).map((child) => child.innerText || child.textContent || ""),
      MAX_NEARBY_TEXT_CHARS,
    ),
    after: joinTextLines(
      afterElements.slice(0, 3).map((child) => child.innerText || child.textContent || ""),
      MAX_NEARBY_TEXT_CHARS,
    ),
  };
}

function getNearbyHelpText(element: HTMLElement): { helpText?: string; errorText?: string } {
  const ids = [
    element.getAttribute("aria-describedby"),
    element.getAttribute("aria-errormessage"),
  ]
    .filter(Boolean)
    .flatMap((value) => value!.split(/\s+/));

  const describedTexts = ids
    .map((id) => document.getElementById(id))
    .map((node) => safeVisibleText(node, MAX_HELP_TEXT_CHARS))
    .filter((text): text is string => Boolean(text));

  const nearbyNodes = Array.from(
    (findNearestMeaningfulContainer(element) || element.parentElement || document.body).querySelectorAll(
      "[aria-live], .error, .errors, .help, .hint, .helper-text, [role='alert']",
    ),
  )
    .filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node !== element && isExtractableElementVisible(node),
    )
    .slice(0, 4);

  const errorNodes = nearbyNodes
    .filter((node) => /error|invalid|warning|alert/.test(`${node.className} ${node.id} ${node.getAttribute("role") || ""}`.toLowerCase()))
    .map((node) => node.innerText || node.textContent || "");
  const helpNodes = nearbyNodes
    .filter((node) => !errorNodes.includes(node.innerText || node.textContent || ""))
    .map((node) => node.innerText || node.textContent || "");

  return {
    helpText: joinTextLines([...describedTexts, ...helpNodes], MAX_HELP_TEXT_CHARS),
    errorText: joinTextLines(errorNodes, MAX_HELP_TEXT_CHARS),
  };
}

function extractPageContext(doc: Document): FocusedFieldContext["page"] {
  return {
    url: window.location.href,
    hostname: window.location.hostname,
    title: truncateText(doc.title || "", 140),
    headings: getTopVisibleHeadings(doc),
  };
}

function extractFieldContext(element: HTMLElement, debug: FocusedFieldDebug): FocusedFieldContext["field"] {
  return {
    tagName: element.tagName.toLowerCase(),
    inputType: element instanceof HTMLInputElement ? normalizeTextInputType(element.type) || undefined : undefined,
    placeholder:
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? truncateText(element.placeholder || "", 120) || undefined
        : truncateText(element.getAttribute("placeholder") || "", 120) || undefined,
    ariaLabel: truncateText(element.getAttribute("aria-label") || "", 120) || undefined,
    name:
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.name || undefined
        : element.getAttribute("name") || undefined,
    id: element.id || undefined,
    currentText: getElementTextValue(element),
    labelText: getLabelText(element),
    fieldTypeGuess: debug.fieldTypeGuess,
  };
}

function extractNearbyContext(element: HTMLElement): FocusedFieldContext["nearby"] {
  const container = findNearestMeaningfulContainer(element) || element.parentElement;
  const siblingContext = getContextSiblingsText(element);
  const helpContext = getNearbyHelpText(element);

  return {
    nearestContainerText: joinTextLines(
      container
        ? Array.from(container.children)
            .filter(
              (child): child is HTMLElement =>
                child instanceof HTMLElement &&
                child !== element &&
                isExtractableElementVisible(child),
            )
            .slice(0, 6)
            .map((child) => child.innerText || child.textContent || "")
        : [],
      MAX_CONTAINER_TEXT_CHARS,
    ),
    textBefore: siblingContext.before,
    textAfter: siblingContext.after,
    helpText: helpContext.helpText,
    errorText: helpContext.errorText,
  };
}

export function extractFocusedFieldContext(
  element: HTMLElement | null,
  debug: FocusedFieldDebug,
  doc: Document = document,
): FocusedFieldContext | undefined {
  if (!element || !debug.isCandidate) {
    return undefined;
  }

  return focusedFieldContextSchema.parse({
    page: extractPageContext(doc),
    field: extractFieldContext(element, debug),
    nearby: extractNearbyContext(element),
    gmail: extractGmailContext(element, isExtractableElementVisible),
    support: extractSupportContext(element, isExtractableElementVisible),
  });
}

export function inspectFocusedFieldWithContext(doc: Document = document): FocusedFieldInspection {
  const element = resolveFocusedEditableElement(doc);
  const debug = inspectFocusedField(doc);
  const context = extractFocusedFieldContext(element, debug, doc);

  return focusedFieldInspectionSchema.parse({
    debug,
    context,
  });
}
