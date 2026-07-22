/**
 * FocusResolver: resolve seed paths, symbols, keywords from request + change pack.
 * LLD §2.3 / research §5.2–5.3.
 */

import { promises as fs } from "node:fs";
import { isAbsolute, join, normalize, relative } from "pathe";
import { pathExists, readText, readYaml } from "../fs.js";
import { changePath } from "../paths.js";
import type { Config } from "../schemas.js";
import { loadConfig } from "../config.js";
import { getActiveChangeId } from "../change-context.js";
import { classifyPath } from "./ignore.js";
import type { CodeContextGap, CodeContextRequest, FocusPlan } from "./types.js";

/** Stopwords for keyword extraction (research §5.2). */
export const KEYWORD_STOPWORDS = new Set(
  [
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "for",
    "of",
    "in",
    "on",
    "at",
    "by",
    "with",
    "from",
    "as",
    "is",
    "are",
    "be",
    "this",
    "that",
    "it",
    "we",
    "i",
    "you",
    "our",
    "add",
    "want",
    "feature",
    "using",
    "like",
    "lets",
    "let",
    "explore",
    "proper",
    "get",
    "code",
    "context",
    "agent",
    "agents",
    "ai",
    "sota",
    "state",
    "art",
    "techniques",
    "change",
    "stage",
    "implement",
    "please",
    "should",
    "must",
    "will",
    "can",
    "via",
    "into",
    "over",
    "under",
  ].map((s) => s.toLowerCase()),
);

const SOURCE_ROOTS = ["packages", "src", "lib"];
const PATH_LIKE_RE =
  /(?:packages|src|lib)\/[\w./@+-]+\.\w{1,10}|`([^`]+\.\w{1,10})`|([\w./@+-]+\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs))/g;

export function tokenizeKeywords(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (t.length < 3) continue;
    if (/^\d+$/.test(t)) continue;
    if (KEYWORD_STOPWORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function extractPathLikeTokens(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(PATH_LIKE_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    const p = (m[1] || m[2] || m[0]).replace(/`/g, "");
    if (!p || seen.has(p)) continue;
    seen.add(p);
    found.push(p);
  }
  return found;
}

function toRepoRelative(projectRoot: string, p: string): string {
  const abs = isAbsolute(p) ? p : join(projectRoot, p);
  const rel = relative(projectRoot, abs);
  return normalize(rel).replace(/\\/g, "/");
}

function toAbsolute(projectRoot: string, p: string): string {
  return isAbsolute(p) ? p : join(projectRoot, p);
}

async function walkFiles(
  absDir: string,
  projectRoot: string,
  maxFiles: number,
  out: string[],
  gaps: CodeContextGap[],
): Promise<void> {
  if (out.length >= maxFiles) return;
  if (!(await pathExists(absDir))) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= maxFiles) return;
    const abs = join(absDir, entry.name);
    const rel = toRepoRelative(projectRoot, abs);
    const kind = classifyPath(rel);
    if (kind === "secret" || kind === "ignored") continue;
    if (entry.isDirectory()) {
      // skip hidden dirs except we already filtered .git via classify
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      await walkFiles(abs, projectRoot, maxFiles, out, gaps);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
}

async function collectUnderPaths(
  projectRoot: string,
  paths: string[],
  maxWalk: number,
  gaps: CodeContextGap[],
): Promise<string[]> {
  const files: string[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    const abs = toAbsolute(projectRoot, p);
    const rel = toRepoRelative(projectRoot, abs);
    const kind = classifyPath(rel);
    if (kind === "secret") {
      gaps.push({
        code: "path_denied_secret",
        message: `Skipped potential secret path: ${rel}`,
        path: rel,
      });
      continue;
    }
    if (kind === "ignored") {
      gaps.push({
        code: "path_ignored",
        message: `Skipped ignored path: ${rel}`,
        path: rel,
      });
      continue;
    }
    if (!(await pathExists(abs))) {
      gaps.push({
        code: "path_missing",
        message: `Path not found: ${rel}`,
        path: rel,
      });
      continue;
    }
    const st = await fs.stat(abs);
    if (st.isDirectory()) {
      await walkFiles(abs, projectRoot, maxWalk, files, gaps);
    } else if (st.isFile()) {
      if (!seen.has(rel)) {
        seen.add(rel);
        files.push(rel);
      }
    }
  }
  // de-dupe while preserving order
  const uniq: string[] = [];
  const s = new Set<string>();
  for (const f of files) {
    if (s.has(f)) continue;
    s.add(f);
    uniq.push(f);
  }
  return uniq;
}

async function readBounded(
  absPath: string,
  maxChars: number,
): Promise<string | null> {
  if (!(await pathExists(absPath))) return null;
  try {
    const text = await readText(absPath);
    return text.slice(0, maxChars);
  } catch {
    return null;
  }
}

async function resolveChangeMeta(
  projectRoot: string,
  changeId: string | null | undefined,
  gaps: CodeContextGap[],
): Promise<{ id: string; title: string; path: string; stage?: string } | null> {
  let config: Config;
  try {
    config = await loadConfig(projectRoot);
  } catch {
    return null;
  }

  let id = changeId ?? null;
  if (!id) {
    try {
      id = await getActiveChangeId(projectRoot, config);
    } catch {
      id = null;
    }
  }
  if (!id) {
    gaps.push({
      code: "no_active_change",
      message: "No active change; focusing without change-pack signals.",
    });
    return null;
  }

  const cpath = changePath(projectRoot, config, id);
  const metaPath = join(cpath, "meta.yaml");
  if (!(await pathExists(metaPath))) {
    // also check if change dir missing
    if (!(await pathExists(cpath))) {
      gaps.push({
        code: "change_not_found",
        message: `Change not found: ${id}`,
        path: id,
      });
      return null;
    }
  }

  try {
    const meta = (await readYaml(metaPath)) as {
      title?: string;
      stage?: string;
      id?: string;
    };
    return {
      id,
      title: meta.title ?? id,
      path: cpath,
      stage: meta.stage,
    };
  } catch {
    gaps.push({
      code: "change_not_found",
      message: `Could not load change meta: ${id}`,
      path: id,
    });
    return null;
  }
}

async function searchByKeywords(
  projectRoot: string,
  keywords: string[],
  symbols: string[],
  maxFiles: number,
): Promise<string[]> {
  const out: string[] = [];
  const terms = [...keywords, ...symbols.map((s) => s.toLowerCase())];
  if (!terms.length) return out;

  for (const root of SOURCE_ROOTS) {
    const abs = join(projectRoot, root);
    if (!(await pathExists(abs))) continue;
    const files: string[] = [];
    await walkFiles(abs, projectRoot, maxFiles * 4, files, []);
    for (const rel of files) {
      if (out.length >= maxFiles) return out;
      const lower = rel.toLowerCase();
      const base = lower.split("/").pop() ?? lower;
      if (terms.some((t) => lower.includes(t) || base.includes(t))) {
        out.push(rel);
        continue;
      }
      // light content peek for symbol names
      if (symbols.length) {
        try {
          const text = await readText(join(projectRoot, rel));
          if (symbols.some((s) => text.includes(s))) {
            out.push(rel);
          }
        } catch {
          /* skip */
        }
      }
    }
  }
  return out;
}

export interface ResolveFocusResult {
  plan: FocusPlan;
  gaps: CodeContextGap[];
}

/**
 * Resolve FocusPlan from request. Does not hard-fail; caller treats empty seeds as no_focus.
 */
export async function resolveFocus(
  request: CodeContextRequest,
  options?: { maxCandidateWalk?: number },
): Promise<ResolveFocusResult> {
  const gaps: CodeContextGap[] = [];
  const notes: string[] = [];
  const projectRoot = request.projectRoot;
  const maxWalk = options?.maxCandidateWalk ?? 200;

  const seedSymbols = [...(request.symbols ?? [])].filter(Boolean);
  let keywords = tokenizeKeywords(request.query ?? "");
  let seedPaths: string[] = [];
  let candidatePaths: string[] = [];
  let changeId: string | null = request.changeId ?? null;

  // 1) Explicit paths
  if (request.paths?.length) {
    notes.push(`Focus from explicit paths (${request.paths.length})`);
    const files = await collectUnderPaths(projectRoot, request.paths, maxWalk, gaps);
    seedPaths = [...files];
    candidatePaths = [...files];
  }

  // 2) Change title + light artifact signals (path expansion only without explicit paths)
  const change = await resolveChangeMeta(projectRoot, request.changeId, gaps);
  if (change) {
    changeId = change.id;
    const titleKw = tokenizeKeywords(change.title);
    for (const k of titleKw) {
      if (!keywords.includes(k)) keywords.push(k);
    }
    notes.push(`Change signals from: ${change.id}`);

    // Bounded artifact reads for keywords always; path seeds only when no --path
    for (const artifact of ["tasks.md", "feature.md", "stories.md", "lld.md"]) {
      const body = await readBounded(join(change.path, artifact), 8000);
      if (!body) continue;
      if (!request.paths?.length) {
        for (const p of extractPathLikeTokens(body)) {
          const abs = toAbsolute(projectRoot, p);
          if (await pathExists(abs)) {
            const rel = toRepoRelative(projectRoot, abs);
            const kind = classifyPath(rel);
            if (kind === "allowed" && !candidatePaths.includes(rel)) {
              candidatePaths.push(rel);
              if (!seedPaths.includes(rel)) seedPaths.push(rel);
            }
          }
        }
      }
      if (artifact === "tasks.md" && body) {
        const more = tokenizeKeywords(body.slice(0, 2000));
        for (const k of more.slice(0, 12)) {
          if (!keywords.includes(k)) keywords.push(k);
        }
      }
    }

    // If no explicit paths, expand candidates via keyword search under source roots
    if (!request.paths?.length && (keywords.length || seedSymbols.length)) {
      const found = await searchByKeywords(
        projectRoot,
        keywords,
        seedSymbols,
        maxWalk,
      );
      for (const f of found) {
        if (!candidatePaths.includes(f)) candidatePaths.push(f);
        if (!seedPaths.includes(f) && seedPaths.length < 20) seedPaths.push(f);
      }
      if (found.length) notes.push(`Keyword/path search found ${found.length} candidates`);
    }
  }

  // 3) Query/symbols only (no change, no paths)
  if (
    !request.paths?.length &&
    !change &&
    (request.query || seedSymbols.length)
  ) {
    notes.push("Focus from query/symbols only");
    const found = await searchByKeywords(
      projectRoot,
      keywords,
      seedSymbols,
      maxWalk,
    );
    for (const f of found) {
      if (!candidatePaths.includes(f)) candidatePaths.push(f);
      if (!seedPaths.includes(f)) seedPaths.push(f);
    }
  }

  // Ensure seed files exist & filter
  const filteredSeeds: string[] = [];
  for (const p of seedPaths) {
    const kind = classifyPath(p);
    if (kind !== "allowed") continue;
    if (await pathExists(toAbsolute(projectRoot, p))) filteredSeeds.push(p);
  }
  const filteredCandidates: string[] = [];
  const seen = new Set<string>();
  for (const p of [...filteredSeeds, ...candidatePaths]) {
    if (seen.has(p)) continue;
    const kind = classifyPath(p);
    if (kind !== "allowed") continue;
    if (!(await pathExists(toAbsolute(projectRoot, p)))) continue;
    seen.add(p);
    filteredCandidates.push(p);
  }

  // Cap keywords
  keywords = keywords.slice(0, 40);

  // If we only have symbols and zero files, still allow plan with empty seeds —
  // search may have missed; orchestrator can no_focus.
  if (seedSymbols.length && !filteredCandidates.length) {
    notes.push("Symbols provided but no matching files found yet");
  }

  return {
    plan: {
      seedPaths: filteredSeeds,
      seedSymbols,
      keywords,
      candidatePaths: filteredCandidates,
      changeId,
      notes,
    },
    gaps,
  };
}
