import test from "node:test";
import assert from "node:assert/strict";
import { buildAppendText } from "./insertionUtils.ts";

test("buildAppendText appends to empty fields directly", () => {
  assert.equal(buildAppendText("", "Hello"), "Hello");
});

test("buildAppendText separates multiline appends with spacing", () => {
  assert.equal(buildAppendText("Existing text", "New line\nMore"), "Existing text\n\nNew line\nMore");
});

test("buildAppendText preserves existing trailing newline when appending", () => {
  assert.equal(buildAppendText("Existing text\n", "Next"), "Existing text\nNext");
});
