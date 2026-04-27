const DEFAULT_MAX_CHARS = 280;
const DEFAULT_MAX_LINES = 6;

export function normalizeExtractedText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

export function truncateText(text: string, maxChars = DEFAULT_MAX_CHARS): string {
  const normalized = normalizeExtractedText(text);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export function dedupeRepeatedTextLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const line of lines) {
    const normalized = normalizeExtractedText(line);
    if (!normalized) {
      continue;
    }

    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    deduped.push(normalized);
  }

  return deduped;
}

export function joinTextLines(lines: string[], maxChars = DEFAULT_MAX_CHARS): string | undefined {
  const joined = dedupeRepeatedTextLines(lines).join("\n").trim();
  if (!joined) {
    return undefined;
  }

  if (joined.length <= maxChars) {
    return joined;
  }

  return `${joined.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export function chunkVisibleTextLines(
  lines: string[],
  options: {
    maxChars?: number;
    maxLines?: number;
  } = {},
): {
  text?: string;
  lines: string[];
  wasTruncated: boolean;
} {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const deduped = dedupeRepeatedTextLines(lines);
  const limitedLines = deduped.slice(0, maxLines);
  const joined = limitedLines.join("\n").trim();

  if (!joined) {
    return {
      text: undefined,
      lines: [],
      wasTruncated: false,
    };
  }

  const byLineTruncated = deduped.length > limitedLines.length;
  if (joined.length <= maxChars) {
    return {
      text: joined,
      lines: limitedLines,
      wasTruncated: byLineTruncated,
    };
  }

  return {
    text: `${joined.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`,
    lines: limitedLines,
    wasTruncated: true,
  };
}
