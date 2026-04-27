import test from "node:test";
import assert from "node:assert/strict";
import { isSupportHostname, isSupportLikeText } from "./support.ts";

test("isSupportHostname detects common support hostnames", () => {
  assert.equal(isSupportHostname("support.example.com"), true);
  assert.equal(isSupportHostname("acme.zendesk.com"), true);
  assert.equal(isSupportHostname("mail.google.com"), false);
});

test("isSupportLikeText detects ticket and customer support phrasing", () => {
  assert.equal(
    isSupportLikeText("Reply to the customer issue with next steps on the ticket."),
    true,
  );
  assert.equal(
    isSupportLikeText("Describe your background and answer the application question."),
    false,
  );
});
