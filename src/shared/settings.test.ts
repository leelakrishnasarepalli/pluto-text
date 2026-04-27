import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXTENSION_SETTINGS, migrateSettings, resolveEffectiveSiteSettings } from "./settings.ts";

test("migrateSettings maps legacy apiBaseUrl and fills defaults", () => {
  const settings = migrateSettings({
    apiBaseUrl: "http://127.0.0.1:9999",
    defaultTone: "friendly",
  });

  assert.equal(settings.localApiBaseUrl, "http://127.0.0.1:9999");
  assert.equal(settings.defaultTone, "friendly");
  assert.equal(settings.enabled, true);
  assert.deepEqual(settings.siteOverrides, {});
});

test("resolveEffectiveSiteSettings applies hostname override over defaults", () => {
  const settings = migrateSettings({
    ...DEFAULT_EXTENSION_SETTINGS,
    defaultTone: "professional",
    defaultLength: "medium",
    routingMode: "local_only",
    cloudFallbackEnabled: false,
    siteOverrides: {
      "mail.google.com": {
        defaultTone: "friendly",
        defaultLength: "short",
        routingMode: "local_preferred_cloud_fallback",
        cloudFallbackEnabled: true,
      },
    },
  });

  const effective = resolveEffectiveSiteSettings(settings, "mail.google.com");

  assert.equal(effective.defaultTone, "friendly");
  assert.equal(effective.defaultLength, "short");
  assert.equal(effective.routingMode, "local_preferred_cloud_fallback");
  assert.equal(effective.cloudFallbackEnabled, true);
  assert.equal(effective.localApiBaseUrl, DEFAULT_EXTENSION_SETTINGS.localApiBaseUrl);
});
