import { DEFAULT_API_BASE_URL } from "./constants.ts";
import {
  extensionSettingsSchema,
  type EffectiveSiteSettings,
  effectiveSiteSettingsSchema,
  type ExtensionSettings,
  type SiteOverrideSettings,
} from "./types.ts";

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = extensionSettingsSchema.parse({
  enabled: true,
  defaultTone: "professional",
  defaultLength: "medium",
  includeGreeting: true,
  includeSignoff: false,
  signoffText: "",
  routingMode: "local_only",
  localApiBaseUrl: DEFAULT_API_BASE_URL,
  cloudFallbackEnabled: false,
  debugMode: false,
  siteOverrides: {},
});

type LegacySettingsShape = {
  apiBaseUrl?: unknown;
  localApiBaseUrl?: unknown;
  [key: string]: unknown;
};

function normalizeHostname(hostname?: string | null): string {
  return (hostname ?? "").trim().toLowerCase();
}

function normalizeSiteOverrides(rawOverrides: unknown): Record<string, SiteOverrideSettings> {
  if (!rawOverrides || typeof rawOverrides !== "object") {
    return {};
  }

  const normalizedEntries = Object.entries(rawOverrides).flatMap(([hostname, override]) => {
    const normalizedHostname = normalizeHostname(hostname);
    if (!normalizedHostname) {
      return [];
    }

    const parsedOverride = effectiveSiteSettingsSchema.partial().safeParse(override);
    if (!parsedOverride.success) {
      return [];
    }

    return [[normalizedHostname, parsedOverride.data] as const];
  });

  return Object.fromEntries(normalizedEntries);
}

export function migrateSettings(rawValue: unknown): ExtensionSettings {
  const rawSettings =
    rawValue && typeof rawValue === "object" ? ({ ...rawValue } as LegacySettingsShape) : {};

  if (
    typeof rawSettings.apiBaseUrl === "string" &&
    typeof rawSettings.localApiBaseUrl !== "string"
  ) {
    rawSettings.localApiBaseUrl = rawSettings.apiBaseUrl;
  }

  const mergedSettings = {
    ...DEFAULT_EXTENSION_SETTINGS,
    ...rawSettings,
    siteOverrides: normalizeSiteOverrides(rawSettings.siteOverrides),
  };

  return extensionSettingsSchema.parse(mergedSettings);
}

export function resolveEffectiveSiteSettings(
  settings: ExtensionSettings,
  hostname?: string | null,
): EffectiveSiteSettings {
  const normalizedHostname = normalizeHostname(hostname);
  const siteOverride = normalizedHostname ? settings.siteOverrides[normalizedHostname] : undefined;

  return effectiveSiteSettingsSchema.parse({
    enabled: settings.enabled,
    defaultTone: settings.defaultTone,
    defaultLength: settings.defaultLength,
    includeGreeting: settings.includeGreeting,
    includeSignoff: settings.includeSignoff,
    signoffText: settings.signoffText,
    routingMode: settings.routingMode,
    localApiBaseUrl: settings.localApiBaseUrl,
    cloudFallbackEnabled: settings.cloudFallbackEnabled,
    debugMode: settings.debugMode,
    ...siteOverride,
  });
}
