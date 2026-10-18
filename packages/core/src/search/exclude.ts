import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import ignore from "ignore";
import { join } from "pathe";
import { isIgnoredPath } from "../code-context/ignore.js";
import { isSecretPath } from "../code-context/secrets.js";
import { pathExists } from "../fs.js";

export function isHardDenied(rel: string): boolean {
  if (isSecretPath(rel) || isIgnoredPath(rel)) return true;
  const slash = rel.indexOf("/");
  const first = slash === -1 ? rel : rel.slice(0, slash);
  return first === ".sdd" || first === ".git";
}

/**
 * Directories the walker does not open. A directory whose basename merely
 * contains "secret" (the fixture `secret-nest`) is not pruned: `isSecretPath`
 * applies to the file itself, and `packages/secret-nest/shown.ts` is allowed.
 */
export function isPrunedDir(rel: string): boolean {
  if (isIgnoredPath(rel)) return true;
  const parts = rel.split("/");
  for (const part of parts) {
    if (part === ".git" || part === ".sdd") return true;
  }
  return false;
}

/** Rewrite one nested gitignore line into repo-relative patterns. No regex. */
function rewriteNestedLine(dir: string, line: string): string[] {
  if (line.length === 0) return [line];
  let i = 0;
  while (i < line.length && (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9)) i += 1;
  if (i >= line.length) return [line];
  if (line.charCodeAt(i) === 35) return [line];
  let negated = false;
  if (line.charCodeAt(i) === 33) {
    negated = true;
    i += 1;
  }
  let pattern = line.slice(i);
  let end = pattern.length;
  while (end > 0 && (pattern.charCodeAt(end - 1) === 32 || pattern.charCodeAt(end - 1) === 9)) {
    end -= 1;
  }
  pattern = pattern.slice(0, end);
  if (!pattern) return [line];
  const bang = negated ? "!" : "";
  if (!pattern.includes("/")) {
    return [`${bang}${dir}/${pattern}`, `${bang}${dir}/**/${pattern}`];
  }
  const body = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  return [`${bang}${dir}/${body}`];
}

function rewriteNested(dir: string, content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const logical = line.endsWith("\r") ? line.slice(0, -1) : line;
    out.push(...rewriteNestedLine(dir, logical));
  }
  return out.join("\n");
}

async function readIfPresent(file: string): Promise<string> {
  if (!(await pathExists(file))) return "";
  return readFile(file, "utf8");
}

async function nestedGitignoreFiles(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (isPrunedDir(child)) continue;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), child);
      } else if (entry.isFile() && entry.name === ".gitignore" && rel) {
        found.push(child);
      }
    }
  }
  await walk(projectRoot, "");
  found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return found;
}

export async function loadExcluder(
  projectRoot: string,
  exclude: readonly string[],
): Promise<(rel: string) => boolean> {
  const git = ignore();
  const rootIgnore = await readIfPresent(join(projectRoot, ".gitignore"));
  if (rootIgnore) git.add(rootIgnore);
  for (const rel of await nestedGitignoreFiles(projectRoot)) {
    if (git.ignores(rel)) continue;
    const dir = rel.slice(0, rel.lastIndexOf("/"));
    const body = await readIfPresent(join(projectRoot, rel));
    if (body) git.add(rewriteNested(dir, body));
  }

  const sdd = ignore();
  const sddIgnore = await readIfPresent(join(projectRoot, ".sddignore"));
  if (sddIgnore) sdd.add(sddIgnore);

  const extra = ignore();
  if (exclude.length) extra.add(exclude.join("\n"));

  return (rel: string) => {
    const path = rel.replaceAll("\\", "/");
    if (isHardDenied(path)) return true;
    if (git.ignores(path)) return true;
    if (sdd.ignores(path)) return true;
    return extra.ignores(path);
  };
}
