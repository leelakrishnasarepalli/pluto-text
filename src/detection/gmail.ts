import type { FocusedFieldContext, GmailComposeModeGuess } from "../shared/types";
import {
  chunkVisibleTextLines,
  dedupeRepeatedTextLines,
  joinTextLines,
  normalizeExtractedText,
  truncateText,
} from "./contextUtils.ts";

const MAX_LABEL_CHARS = 140;
const MAX_THREAD_TEXT_CHARS = 720;
const MAX_REQUEST_DETAILS_CHARS = 420;
const MAX_THREAD_TURNS = 6;
const MAX_RECIPIENTS = 6;

export function isGmailHostname(hostname: string): boolean {
  return hostname === "mail.google.com";
}

export function inferGmailComposeMode(
  hintText: string,
  options: {
    insideDialog?: boolean;
    hasSubject?: boolean;
    hasRecipients?: boolean;
    hasThreadText?: boolean;
  } = {},
): GmailComposeModeGuess {
  const normalizedHints = normalizeExtractedText(hintText).toLowerCase();

  if (
    /\breply\b|\breplying\b|\bcompose a reply\b|\breply to\b/.test(normalizedHints) ||
    (!options.insideDialog && options.hasThreadText)
  ) {
    return "reply";
  }

  if (
    /\bnew message\b|\bcompose\b|\bnew mail\b/.test(normalizedHints) ||
    (Boolean(options.insideDialog) && Boolean(options.hasSubject || options.hasRecipients))
  ) {
    return "new_message";
  }

  return "unknown";
}

function getVisibleValue(
  element: Element | null | undefined,
  isVisible: (element: HTMLElement) => boolean,
  maxChars: number,
): string | undefined {
  if (!(element instanceof HTMLElement) || !isVisible(element)) {
    return undefined;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return truncateText(element.value || "", maxChars) || undefined;
  }

  return truncateText(element.innerText || element.textContent || "", maxChars) || undefined;
}

function getGmailComposeContainer(element: HTMLElement): HTMLElement | null {
  return (
    element.closest<HTMLElement>(
      "div[role='dialog'], div[gh='cm'], div[aria-label*='Message Body'], div[aria-label*='Reply'], form",
    ) || element.closest<HTMLElement>("[role='main']")
  );
}

export function isGmailEditor(element: HTMLElement): boolean {
  if (!isGmailHostname(window.location.hostname)) {
    return false;
  }

  const ariaLabel = (element.getAttribute("aria-label") || "").toLowerCase();
  const role = (element.getAttribute("role") || "").toLowerCase();

  return (
    role === "textbox" ||
    /message body|compose|reply/.test(ariaLabel) ||
    Boolean(getGmailComposeContainer(element))
  );
}

export function extractGmailContext(
  element: HTMLElement,
  isVisible: (element: HTMLElement) => boolean,
): FocusedFieldContext["gmail"] {
  if (!isGmailHostname(window.location.hostname)) {
    return undefined;
  }

  const container = getGmailComposeContainer(element);
  if (!container) {
    return undefined;
  }

  const subjectSelectors = [
    "input[name='subjectbox']",
    "input[placeholder*='Subject']",
    "input[aria-label*='Subject']",
  ];
  const subject =
    subjectSelectors
      .map((selector) => getVisibleValue(container.querySelector(selector), isVisible, MAX_LABEL_CHARS))
      .find(Boolean) || undefined;

  const recipients = dedupeRepeatedTextLines(
    Array.from(
      container.querySelectorAll(
        "[email], span[email], div[email], input[aria-label*='To'], input[aria-label*='Recipients'], textarea[aria-label*='Recipients']",
      ),
    )
      .map((node) => {
        if (!(node instanceof HTMLElement) || !isVisible(node)) {
          return "";
        }

        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
          return node.value;
        }

        return node.getAttribute("email") || node.innerText || node.textContent || "";
      })
      .filter(Boolean),
  ).slice(0, MAX_RECIPIENTS);

  const threadNodes = Array.from(
    container.querySelectorAll(
      "div[role='listitem'], .adn, .h7, .gmail_quote, .gs, .ii, blockquote",
    ),
  ).filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && node !== element && isVisible(node),
  );

  const rankedThreadNodes = threadNodes
    .map((node) => ({
      node,
      distance: Math.abs(node.getBoundingClientRect().top - element.getBoundingClientRect().top),
    }))
    .sort((left, right) => left.distance - right.distance)
    .map(({ node }) => node);

  const recentThreadTurnsResult = chunkVisibleTextLines(
    rankedThreadNodes
      .slice(0, MAX_THREAD_TURNS)
      .map((node) => node.innerText || node.textContent || ""),
    {
      maxChars: MAX_THREAD_TEXT_CHARS,
      maxLines: MAX_THREAD_TURNS,
    },
  );

  const requestDetailsResult = chunkVisibleTextLines(
    rankedThreadNodes
      .slice(0, 3)
      .flatMap((node) =>
        Array.from(node.querySelectorAll(".ii, .a3s, .gmail_quote, blockquote"))
          .filter((child): child is HTMLElement => child instanceof HTMLElement && isVisible(child))
          .map((child) => child.innerText || child.textContent || ""),
      ),
    {
      maxChars: MAX_REQUEST_DETAILS_CHARS,
      maxLines: 4,
    },
  );

  const threadText = recentThreadTurnsResult.text;
  const recentThreadTurns = recentThreadTurnsResult.lines;
  const requestDetails = requestDetailsResult.text;
  const truncatedSections = dedupeRepeatedTextLines(
    [
      recentThreadTurnsResult.wasTruncated ? "gmail_thread" : "",
      requestDetailsResult.wasTruncated ? "gmail_request_details" : "",
    ].filter(Boolean),
  );

  const hintText = [
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    container.getAttribute("aria-label"),
    subject,
    recipients.join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  const composeModeGuess = inferGmailComposeMode(hintText, {
    insideDialog: container.getAttribute("role") === "dialog",
    hasSubject: Boolean(subject),
    hasRecipients: recipients.length > 0,
    hasThreadText: Boolean(threadText),
  });

  return {
    subject,
    recipients,
    threadText,
    recentThreadTurns,
    requestDetails,
    truncatedSections: truncatedSections.length > 0 ? truncatedSections : undefined,
    composeModeGuess,
  };
}
