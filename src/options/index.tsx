import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { BackgroundResponse } from "../messaging/contracts";
import { DEFAULT_EXTENSION_SETTINGS } from "../shared/settings";
import {
  extensionSettingsSchema,
  type ExtensionSettings,
  lengthSchema,
  routingModeSchema,
  toneSchema,
} from "../shared/types";
import "./styles.css";

const toneOptions = toneSchema.options;
const lengthOptions = lengthSchema.options;
const routingModeOptions = routingModeSchema.options;

function stringifyOverrides(settings: ExtensionSettings): string {
  return JSON.stringify(settings.siteOverrides, null, 2);
}

function parseSiteOverrides(rawOverrides: string): ExtensionSettings["siteOverrides"] {
  if (!rawOverrides.trim()) {
    return {};
  }

  return extensionSettingsSchema.shape.siteOverrides.parse(JSON.parse(rawOverrides));
}

function OptionsApp(): JSX.Element {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_EXTENSION_SETTINGS);
  const [siteOverridesText, setSiteOverridesText] = useState(stringifyOverrides(DEFAULT_EXTENSION_SETTINGS));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = (await chrome.runtime.sendMessage({
        type: "get-settings",
      })) as BackgroundResponse;

      if (response.ok && response.settings) {
        setSettings(response.settings);
        setSiteOverridesText(stringifyOverrides(response.settings));
        return;
      }

      setError(response.message ?? "Unable to load settings.");
    })();
  }, []);

  function updateSettings<K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]): void {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setStatus("");
    setError("");

    try {
      const nextSettings = extensionSettingsSchema.parse({
        ...settings,
        siteOverrides: parseSiteOverrides(siteOverridesText),
      });

      const response = (await chrome.runtime.sendMessage({
        type: "save-settings",
        settings: nextSettings,
      })) as BackgroundResponse;

      if (!response.ok || !response.settings) {
        setError(response.message ?? "Unable to save settings.");
        return;
      }

      setSettings(response.settings);
      setSiteOverridesText(stringifyOverrides(response.settings));
      setStatus("Settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unexpected settings error.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset(): void {
    setSettings(DEFAULT_EXTENSION_SETTINGS);
    setSiteOverridesText(stringifyOverrides(DEFAULT_EXTENSION_SETTINGS));
    setStatus("Reset to defaults. Save to apply.");
    setError("");
  }

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Pluto Text Settings</p>
        <h1 className="title">Set the defaults before generation exists.</h1>
        <p className="subtitle">
          Pluto Text stays manual-trigger only. These settings control default drafting behavior,
          per-site overrides, and whether generation stays local-only or can fall back to cloud
          generation when explicitly enabled.
        </p>

        <section className="group">
          <h2 className="group-title">General</h2>
          <div className="grid two-column">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => updateSettings("enabled", event.currentTarget.checked)}
              />
              <span>Extension enabled</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.debugMode}
                onChange={(event) => updateSettings("debugMode", event.currentTarget.checked)}
              />
              <span>Debug mode</span>
            </label>
          </div>
        </section>

        <section className="group">
          <h2 className="group-title">Draft Defaults</h2>
          <div className="grid two-column">
            <label className="field">
              <span className="label">Default tone</span>
              <select
                className="input"
                value={settings.defaultTone}
                onChange={(event) => updateSettings("defaultTone", event.currentTarget.value as ExtensionSettings["defaultTone"])}
              >
                {toneOptions.map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="label">Default length</span>
              <select
                className="input"
                value={settings.defaultLength}
                onChange={(event) => updateSettings("defaultLength", event.currentTarget.value as ExtensionSettings["defaultLength"])}
              >
                {lengthOptions.map((length) => (
                  <option key={length} value={length}>
                    {length}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid two-column">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.includeGreeting}
                onChange={(event) => updateSettings("includeGreeting", event.currentTarget.checked)}
              />
              <span>Include greeting</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.includeSignoff}
                onChange={(event) => updateSettings("includeSignoff", event.currentTarget.checked)}
              />
              <span>Include signoff</span>
            </label>
          </div>

          <label className="field">
            <span className="label">Signoff text</span>
            <input
              className="input"
              type="text"
              value={settings.signoffText}
              onChange={(event) => updateSettings("signoffText", event.currentTarget.value)}
              placeholder="Best regards,"
            />
          </label>
        </section>

        <section className="group">
          <h2 className="group-title">Routing</h2>
          <div className="grid two-column">
            <label className="field">
              <span className="label">Routing mode</span>
              <select
                className="input"
                value={settings.routingMode}
                onChange={(event) => updateSettings("routingMode", event.currentTarget.value as ExtensionSettings["routingMode"])}
              >
                {routingModeOptions.map((routingMode) => (
                  <option key={routingMode} value={routingMode}>
                    {routingMode}
                  </option>
                ))}
              </select>
              <p className="hint">
                Choose whether this site should stay local-only or allow local-first routing with
                cloud fallback.
              </p>
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.cloudFallbackEnabled}
                onChange={(event) => updateSettings("cloudFallbackEnabled", event.currentTarget.checked)}
              />
              <span>Enable cloud fallback</span>
            </label>
          </div>

          <p className="hint">
            Cloud fallback only runs when both routing mode is set to
            `local_preferred_cloud_fallback` and this toggle is enabled.
          </p>

          <label className="field">
            <span className="label">Local API base URL</span>
            <input
              className="input"
              type="url"
              value={settings.localApiBaseUrl}
              onChange={(event) => updateSettings("localApiBaseUrl", event.currentTarget.value)}
              placeholder={DEFAULT_EXTENSION_SETTINGS.localApiBaseUrl}
            />
            <p className="hint">Default: {DEFAULT_EXTENSION_SETTINGS.localApiBaseUrl}</p>
          </label>
        </section>

        <section className="group">
          <h2 className="group-title">Site Overrides</h2>
          <label className="field">
            <span className="label">Overrides JSON keyed by hostname</span>
            <textarea
              className="input textarea"
              value={siteOverridesText}
              onChange={(event) => setSiteOverridesText(event.currentTarget.value)}
              spellCheck={false}
            />
            <p className="hint">
              Example: {`{"mail.google.com":{"defaultTone":"friendly","defaultLength":"short"}}`}
            </p>
          </label>
        </section>

        <p className={`status ${error ? "error" : ""}`}>{error || status}</p>

        <div className="actions">
          <button className="button primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <button className="button secondary" onClick={handleReset} disabled={saving}>
            Reset Defaults
          </button>
        </div>
      </section>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Options root element not found.");
}

createRoot(container).render(<OptionsApp />);
