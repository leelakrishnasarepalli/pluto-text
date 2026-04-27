import fs from "node:fs";
import path from "node:path";

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry) {
      continue;
    }

    const [key, value] = entry;
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadLocalApiEnv(cwd = process.cwd()): void {
  loadEnvFile(path.join(cwd, ".env"));
  loadEnvFile(path.join(cwd, ".env.local"));
}
