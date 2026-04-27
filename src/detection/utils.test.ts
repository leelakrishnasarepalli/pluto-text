import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFieldHintText,
  guessFieldIntent,
  isExplicitlyUnsupportedTextInputType,
  isLargeEnoughForDrafting,
  isLikelyOtpField,
  isLikelySensitiveField,
  isSupportedTextInputType,
  isVisibleBySnapshot,
} from "./utils.ts";

test("supports plain text inputs and rejects known unsupported input types", () => {
  assert.equal(isSupportedTextInputType("text"), true);
  assert.equal(isSupportedTextInputType(""), true);
  assert.equal(isExplicitlyUnsupportedTextInputType("email"), true);
  assert.equal(isExplicitlyUnsupportedTextInputType("search"), true);
  assert.equal(isExplicitlyUnsupportedTextInputType("password"), true);
});

test("visibility helper rejects hidden and tiny fields", () => {
  assert.equal(
    isVisibleBySnapshot({
      display: "block",
      hidden: false,
      opacity: "1",
      visibility: "visible",
      width: 320,
      height: 80,
    }),
    true,
  );

  assert.equal(
    isVisibleBySnapshot({
      display: "block",
      hidden: false,
      opacity: "1",
      visibility: "visible",
      width: 90,
      height: 20,
    }),
    false,
  );
});

test("size helper distinguishes multiline editors from tiny fields", () => {
  assert.equal(
    isLargeEnoughForDrafting({
      tagName: "textarea",
      width: 400,
      height: 140,
      isContentEditable: false,
      rows: 5,
    }),
    true,
  );

  assert.equal(
    isLargeEnoughForDrafting({
      tagName: "input",
      width: 180,
      height: 36,
      isContentEditable: false,
    }),
    false,
  );
});

test("sensitive helpers detect OTP and password-like fields", () => {
  assert.equal(
    isLikelyOtpField({
      autocomplete: "one-time-code",
      inputMode: "numeric",
      maxLength: 6,
      name: "verification_code",
    }),
    true,
  );

  assert.equal(
    isLikelySensitiveField({
      type: "password",
      autocomplete: "current-password",
    }),
    true,
  );
});

test("field intent uses lightweight metadata hints", () => {
  const replyHint = buildFieldHintText({
    id: "reply-box",
    placeholder: "Write your reply",
  });
  const formHint = buildFieldHintText({
    name: "long_answer",
    ariaLabel: "Detailed description",
  });

  assert.equal(guessFieldIntent(replyHint), "email_reply");
  assert.equal(guessFieldIntent(formHint), "form_long_answer");
});
