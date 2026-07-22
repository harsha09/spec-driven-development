/**
 * Practical ignore filters for noise paths (soft-skip, gap path_ignored).
 */

import { basename, extname, normalize } from "pathe";
import { isSecretPath } from "./secrets.js";

const IGNORED_DIR_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".turbo",
  ".next",
  "build",
  ".cache",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".wasm",
  ".mp3",
  ".mp4",
  ".mov",
  ".lock",
]);

/**
 * Soft-skip noise: node_modules, dist, coverage, binaries.
 * Does not include secret paths (those are hard-deny via secrets.ts).
 */
export function isIgnoredPath(filePath: string): boolean {
  const norm = normalize(filePath).replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  for (const p of parts) {
    if (IGNORED_DIR_SEGMENTS.has(p)) return true;
  }
  const ext = extname(basename(norm)).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  // package-lock / pnpm-lock noise as whole files
  const base = basename(norm);
  if (
    base === "package-lock.json" ||
    base === "pnpm-lock.yaml" ||
    base === "yarn.lock" ||
    base === "bun.lockb"
  ) {
    return true;
  }
  return false;
}

export type PathFilterKind = "allowed" | "secret" | "ignored";

export function classifyPath(filePath: string): PathFilterKind {
  if (isSecretPath(filePath)) return "secret";
  if (isIgnoredPath(filePath)) return "ignored";
  return "allowed";
}
