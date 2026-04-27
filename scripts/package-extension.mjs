import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const artifactsDir = path.join(rootDir, "artifacts");
const outputZip = path.join(artifactsDir, "pluto-text-extension.zip");

async function ensureDistExists() {
  const distStat = await stat(distDir).catch(() => null);
  if (!distStat?.isDirectory()) {
    throw new Error("dist/ was not found. Run `npm run build` before packaging the extension.");
  }
}

async function listDistFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.join(prefix, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listDistFiles(absolutePath, relativePath)));
    } else {
      files.push(relativePath);
    }
  }

  return files.sort();
}

await ensureDistExists();
await mkdir(artifactsDir, { recursive: true });
await rm(outputZip, { force: true });

const distFiles = await listDistFiles(distDir);
if (distFiles.length === 0) {
  throw new Error("dist/ is empty. Run `npm run build` before packaging the extension.");
}

try {
  await execFileAsync("python3", ["-m", "zipfile", "-c", outputZip, ...distFiles], {
    cwd: distDir,
  });
} catch (pythonError) {
  try {
    await execFileAsync("zip", ["-r", outputZip, ...distFiles], {
      cwd: distDir,
    });
  } catch {
    throw new Error(
      "Unable to create the extension package automatically. Install python3 or zip, or archive the dist/ folder manually.",
    );
  }
}

console.log(`Packaged extension at ${outputZip}`);
