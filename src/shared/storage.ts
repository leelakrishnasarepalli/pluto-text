import { SETTINGS_STORAGE_KEY } from "./constants";
import { migrateSettings } from "./settings";
import { extensionSettingsSchema, type ExtensionSettings } from "./types";

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return migrateSettings(stored[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const parsedSettings = extensionSettingsSchema.parse(settings);
  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: parsedSettings,
  });
}

export async function ensureSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const rawValue = stored[SETTINGS_STORAGE_KEY];
  const settings = migrateSettings(rawValue);

  if (JSON.stringify(rawValue ?? null) !== JSON.stringify(settings)) {
    await saveSettings(settings);
  }

  return settings;
}
