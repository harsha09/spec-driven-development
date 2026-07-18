import * as esbuild from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const watch = process.argv.includes("--watch");
const __dirname = dirname(fileURLToPath(import.meta.url));

await mkdir("dist", { recursive: true });

// Copy core defaults next to the bundle so init works when packaged as VSIX
const defaultsSrc = join(__dirname, "../core/defaults");
const defaultsDest = join(__dirname, "dist/defaults");
await cp(defaultsSrc, defaultsDest, { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node24",
  sourcemap: true,
  // Bundle @structured-vibe/core + deps so the VSIX is self-contained
  packages: "bundle",
  logLevel: "info",
  // Core uses import.meta.url for defaults path; restore it under CJS output
  banner: {
    js: 'var __import_meta_url = require("url").pathToFileURL(__filename).href;',
  },
  define: {
    "import.meta.url": "__import_meta_url",
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching…");
} else {
  await esbuild.build(options);
}
