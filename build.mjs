import { build, context } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const publicDir = path.join(rootDir, "public");
const watchMode = process.argv.includes("--watch");

const entryPoints = [
  "src/background/index.ts",
  "src/content/index.ts",
  "src/popup/index.tsx",
  "src/options/index.tsx",
];

async function prepareDist() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(publicDir, distDir, { recursive: true });

  await writeFile(
    path.join(distDir, "popup.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pluto Text</title>
    <link rel="stylesheet" href="./popup/index.css" />
    <script type="module" src="./popup/index.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
  );

  await writeFile(
    path.join(distDir, "options.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pluto Text Settings</title>
    <link rel="stylesheet" href="./options/index.css" />
    <script type="module" src="./options/index.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
  );
}

const sharedConfig = {
  entryPoints,
  outdir: distDir,
  entryNames: "[dir]/index",
  bundle: true,
  format: "esm",
  target: "chrome114",
  sourcemap: true,
  logLevel: "info",
  loader: {
    ".css": "css",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(watchMode ? "development" : "production"),
  },
};

await prepareDist();

if (watchMode) {
  const ctx = await context(sharedConfig);
  await ctx.watch();
  console.log(`Watching Pluto Text in ${distDir}`);
} else {
  await build(sharedConfig);
}
