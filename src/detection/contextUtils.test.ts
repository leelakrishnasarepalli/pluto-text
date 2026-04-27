import test from "node:test";
import assert from "node:assert/strict";
import {
  chunkVisibleTextLines,
  dedupeRepeatedTextLines,
  joinTextLines,
  normalizeExtractedText,
  truncateText,
} from "./contextUtils.ts";

test("normalizeExtractedText collapses noisy whitespace", () => {
  assert.equal(normalizeExtractedText("  Hello \n\n world \t again "), "Hello world again");
});

test("truncateText trims long text aggressively", () => {
  assert.equal(truncateText("abcdefghij", 8), "abcde...");
  assert.equal(truncateText("short", 20), "short");
});

test("dedupeRepeatedTextLines removes blank and repeated lines", () => {
  assert.deepEqual(
    dedupeRepeatedTextLines(["First line", " ", "first line", "Second line"]),
    ["First line", "Second line"],
  );
});

test("joinTextLines returns a truncated deduped block", () => {
  assert.equal(joinTextLines(["One", "One", "Two"], 20), "One\nTwo");
});

test("chunkVisibleTextLines preserves recent lines and reports truncation", () => {
  const result = chunkVisibleTextLines(
    ["Line 1", "Line 2", "Line 3", "Line 4"],
    { maxChars: 14, maxLines: 3 },
  );

  assert.equal(result.text, "Line 1\nLine...");
  assert.deepEqual(result.lines, ["Line 1", "Line 2", "Line 3"]);
  assert.equal(result.wasTruncated, true);
});
