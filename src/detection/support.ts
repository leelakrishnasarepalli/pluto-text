import type { FocusedFieldContext } from "../shared/types.ts";
import { chunkVisibleTextLines, dedupeRepeatedTextLines, joinTextLines, truncateText } from "./contextUtils.ts";

const MAX_SUMMARY_CHARS = 180;
const MAX_DETAILS_CHARS = 560;
const MAX_CONVERSATION_CHARS = 760;
const MAX_STATUS_CHARS = 140;
const MAX_RECENT_TURNS = 6;

const SUPPORT_HOSTNAME_PATTERN =
  /(support|help|desk|ticket|case|service|freshdesk|zendesk|intercom|helpscout|frontapp|gorgias)/i;
const SUPPORT_TEXT_PATTERN =
  /\b(ticket|case|customer|request|issue|incident|conversation|help desk|support|reply to customer|resolve|resolution)\b/i;

function isLikelySupportElement(node: HTMLElement): boolean {
  const tagName = node.tagName.toLowerCase();
  const role = (node.getAttribute("role") || "").toLowerCase();
  const hints = `${node.className || ""} ${node.id || ""} ${node.getAttribute("data-testid") || ""} ${node.getAttribute("aria-label") || ""}`.toLowerCase();

  return (
    ["article", "aside", "section", "main", "form"].includes(tagName) ||
    ["article", "complementary", "feed", "form", "main", "region"].includes(role) ||
    /(ticket|case|conversation|thread|reply|composer|support|customer|message|comment|incident|request)/.test(
      hints,
    )
  );
}

function getSupportContainer(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;

  while (current) {
    if (isLikelySupportElement(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return element.parentElement;
}

function getVisibleValue(
  node: Element | null | undefined,
  isVisible: (element: HTMLElement) => boolean,
  maxChars: number,
): string | undefined {
  if (!(node instanceof HTMLElement) || !isVisible(node)) {
    return undefined;
  }

  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    return truncateText(node.value || "", maxChars) || undefined;
  }

  return truncateText(node.innerText || node.textContent || "", maxChars) || undefined;
}

function queryVisibleTexts(
  root: HTMLElement,
  selectors: string[],
  isVisible: (element: HTMLElement) => boolean,
  maxChars: number,
  maxNodes = 5,
): string | undefined {
  const values = selectors.flatMap((selector) =>
    Array.from(root.querySelectorAll(selector))
      .filter((node): node is HTMLElement => node instanceof HTMLElement && isVisible(node))
      .slice(0, maxNodes)
      .map((node) => node.innerText || node.textContent || ""),
  );

  return joinTextLines(values, maxChars);
}

function collectConversationText(
  container: HTMLElement,
  element: HTMLElement,
  isVisible: (element: HTMLElement) => boolean,
): {
  text?: string;
  recentTurns: string[];
  wasTruncated: boolean;
} {
  const conversationNodes = Array.from(
    container.querySelectorAll(
      "[data-message-id], [data-comment-id], [data-conversation-id], article, .message, .comment, .conversation, .thread, .reply, .note, .request, .ticket-comment",
    ),
  )
    .filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement &&
        node !== element &&
        !node.contains(element) &&
        isVisible(node),
    )
    .map((node) => ({
      node,
      distance: Math.abs(node.getBoundingClientRect().top - element.getBoundingClientRect().top),
    }))
    .sort((left, right) => left.distance - right.distance)
    .map(({ node }) => node);

  const result = chunkVisibleTextLines(
    conversationNodes
      .slice(0, MAX_RECENT_TURNS)
      .map((node) => node.innerText || node.textContent || ""),
    {
      maxChars: MAX_CONVERSATION_CHARS,
      maxLines: MAX_RECENT_TURNS,
    },
  );

  return {
    text: result.text,
    recentTurns: result.lines,
    wasTruncated: result.wasTruncated,
  };
}

export function isSupportHostname(hostname: string): boolean {
  return SUPPORT_HOSTNAME_PATTERN.test(hostname);
}

export function isSupportLikeText(text: string): boolean {
  return SUPPORT_TEXT_PATTERN.test(text);
}

export function extractSupportContext(
  element: HTMLElement,
  isVisible: (element: HTMLElement) => boolean,
): FocusedFieldContext["support"] {
  const hostname = window.location.hostname;
  const container = getSupportContainer(element);

  if (!container) {
    return undefined;
  }

  const containerHints = `${hostname} ${container.className || ""} ${container.id || ""} ${container.getAttribute("aria-label") || ""}`;
  const nearbySupportText = container.innerText || container.textContent || "";
  if (!isSupportHostname(hostname) && !isSupportLikeText(`${containerHints} ${nearbySupportText}`)) {
    return undefined;
  }

  const issueSummary =
    queryVisibleTexts(
      container,
      [
        "[data-testid*='subject']",
        "[data-testid*='title']",
        ".subject",
        ".title",
        ".ticket-title",
        ".request-title",
        ".case-title",
        "h1",
        "h2",
      ],
      isVisible,
      MAX_SUMMARY_CHARS,
      4,
    ) || undefined;

  const requestDetailBlocks = [
    ".description",
    ".request-details",
    ".ticket-description",
    ".issue-summary",
    ".customer-request",
    "[data-testid*='description']",
    "[data-testid*='request']",
  ];

  const requestDetailsResult = chunkVisibleTextLines(
    requestDetailBlocks.flatMap((selector) =>
      Array.from(container.querySelectorAll(selector))
        .filter((node): node is HTMLElement => node instanceof HTMLElement && isVisible(node))
        .map((node) => node.innerText || node.textContent || ""),
    ),
    {
      maxChars: MAX_DETAILS_CHARS,
      maxLines: 5,
    },
  );

  const requestDetails =
    requestDetailsResult.text ||
    queryVisibleTexts(
      container,
      requestDetailBlocks,
      isVisible,
      MAX_DETAILS_CHARS,
      4,
    ) || undefined;

  const statusText =
    queryVisibleTexts(
      container,
      [
        ".status",
        ".priority",
        ".badge",
        ".pill",
        "[data-testid*='status']",
        "[data-testid*='priority']",
        "[aria-label*='status']",
      ],
      isVisible,
      MAX_STATUS_CHARS,
      6,
    ) || undefined;

  const conversationResult = collectConversationText(container, element, isVisible);
  const conversationText = conversationResult.text;

  const normalizedValues = dedupeRepeatedTextLines(
    [issueSummary, requestDetails, conversationText, statusText].filter(
      (value): value is string => Boolean(value),
    ),
  );

  if (normalizedValues.length === 0) {
    return undefined;
  }

  return {
    issueSummary,
    requestDetails,
    conversationText,
    recentConversationTurns:
      conversationResult.recentTurns.length > 0 ? conversationResult.recentTurns : undefined,
    statusText,
    truncatedSections:
      dedupeRepeatedTextLines(
        [
          requestDetailsResult.wasTruncated ? "support_request_details" : "",
          conversationResult.wasTruncated ? "support_conversation" : "",
        ].filter(Boolean),
      ).length > 0
        ? dedupeRepeatedTextLines(
            [
              requestDetailsResult.wasTruncated ? "support_request_details" : "",
              conversationResult.wasTruncated ? "support_conversation" : "",
            ].filter(Boolean),
          )
        : undefined,
  };
}
