import test from "node:test";
import assert from "node:assert/strict";
import { inferGmailComposeMode, isGmailHostname } from "./gmail.ts";

test("isGmailHostname matches Gmail exactly", () => {
  assert.equal(isGmailHostname("mail.google.com"), true);
  assert.equal(isGmailHostname("example.com"), false);
});

test("inferGmailComposeMode detects replies from reply hints", () => {
  assert.equal(
    inferGmailComposeMode("Message Body Reply to Alex", {
      insideDialog: false,
      hasThreadText: true,
    }),
    "reply",
  );
});

test("inferGmailComposeMode detects new message compose dialogs", () => {
  assert.equal(
    inferGmailComposeMode("New Message Compose", {
      insideDialog: true,
      hasRecipients: true,
      hasSubject: true,
    }),
    "new_message",
  );
});
