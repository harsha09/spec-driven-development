/**
 * On-demand structure-aware code context pipeline (Option A).
 * Public entry: generateCodeContext
 */

import { stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "pathe";
import { loadConfig } from "../config.js";
import { pathExists, readYaml, writeText } from "../fs.js";
import { changePath } from "../paths.js";
import {
  EMBEDDINGS_UNAVAILABLE,
  type SearchConfig,
  type SearchRuntime,
  budgetForStage,
  createBuiltinProvider,
  embedSearchQuery,
  listScopeHits,
  loadSearchConfig,
  packHits,
  rankScope,
  resolveEmbedder,
} from "../search/index.js";
import type { RawHit } from "../search/types.js";
import type { LanguageAdapter } from "./adapters/types.js";
import { resolveFocus } from "./focus.js";
import { formatMarkdown } from "./formatter.js";
import { isIgnoredPath } from "./ignore.js";
import { isSecretPath } from "./secrets.js";
import type {
  CodeContextGap,
  CodeContextRequest,
  CodeContextResult,
  CodeContextSummary,
  CodeSlice,
} from "./types.js";

export type {
  CodeContextCaps,
  CodeContextRequest,
  CodeContextResult,
  CodeContextGap,
  CodeContextGapCode,
  CodeContextSummary,
  CodeSlice,
  SymbolInfo,
  SymbolKind,
  FocusPlan,
} from "./types.js";
export { DEFAULT_CODE_CONTEXT_CAPS, mergeCaps } from "./types.js";
export type { LanguageAdapter, AdapterExtractResult } from "./adapters/types.js";
export { formatJsonSummary } from "./formatter.js";

/** Optional deps for tests (inject adapters or an embedder). */
export type GenerateCodeContextDeps = {
  adapters?: LanguageAdapter[];
  now?: () => Date;
  embedder?: SearchRuntime["embedder"];
  embedderFactory?: SearchRuntime["embedderFactory"];
};

function emptySummary(partial?: Partial<CodeContextSummary>): CodeContextSummary {
  return {
    focusPaths: [],
    focusSymbols: [],
    keywords: [],
    filesAnalyzed: 0,
    symbolsExtracted: 0,
    slicesEmitted: 0,
    truncated: false,
    ...partial,
  };
}

function hardFailure(
  gaps: CodeContextGap[],
  message: string,
  summary?: Partial<CodeContextSummary>,
): CodeContextResult {
  const markdown = [
    "# Code context",
    "",
    "> Generated on-demand for agents. Not a substitute for process context.",
    "",
    "## Summary",
    `- Error: ${message}`,
    "",
    "## Gaps",
    ...gaps.map((g) => `- (\`${g.code}\`) ${g.message}${g.path ? ` — \`${g.path}\`` : ""}`),
    "",
    "## Slices",
    "",
    "_None (hard failure)._",
    "",
    "## Structural notes",
    "- Pipeline did not complete analysis.",
    "",
  ].join("\n");

  return {
    ok: false,
    markdown,
    summary: emptySummary(summary),
    slices: [],
    gaps,
  };
}

function toRepoPath(projectRoot: string, input: string): string {
  const abs = isAbsolute(input) ? input : join(projectRoot, input);
  let rel = relative(projectRoot, abs).replaceAll("\\", "/");
  while (rel.startsWith("./")) rel = rel.slice(2);
  return rel;
}

function pathKept(rel: string, fileArgs: string[], dirArgs: string[]): boolean {
  if (fileArgs.includes(rel)) return true;
  return dirArgs.some((dir) => rel.startsWith(`${dir}/`));
}

function symbolKept(symbol: string, names: string[]): boolean {
  return names.some((name) => symbol === name || symbol.endsWith(`.${name}`));
}

/**
 * Main entry: on-demand pipeline. Partial success returns ok:true with gaps.
 * Hard failures return ok:false with gaps and minimal markdown explaining failure.
 */
export async function generateCodeContext(
  request: CodeContextRequest,
  deps?: GenerateCodeContextDeps,
): Promise<CodeContextResult> {
  const projectRoot = request.projectRoot;
  const gaps: CodeContextGap[] = [];
  const { plan, gaps: focusGaps } = await resolveFocus(request);
  gaps.push(...focusGaps);

  const hasExplicit =
    Boolean(request.paths?.length) ||
    Boolean(request.query?.trim()) ||
    Boolean(request.symbols?.length) ||
    Boolean(request.changeId) ||
    plan.seedPaths.length > 0 ||
    plan.candidatePaths.length > 0 ||
    plan.keywords.length > 0;

  if (!hasExplicit) {
    gaps.push({
      code: "no_focus",
      message:
        "No focus resolved. Pass --path, --symbol, and/or --query, or run with an active change.",
    });
    return hardFailure(gaps, "No focus resolved", {
      focusSymbols: plan.seedSymbols,
      keywords: plan.keywords,
    });
  }

  let searchConfig: SearchConfig;
  try {
    searchConfig = await loadSearchConfig(projectRoot);
  } catch {
    return hardFailure(
      [{ code: "parse_error", message: "search.yaml is invalid" }],
      "search.yaml is invalid",
    );
  }

  const config = await loadConfig(projectRoot);
  let changeTitle: string | null = plan.changeId;
  let stage: string | undefined;
  if (request.changeId) {
    const mp = join(changePath(projectRoot, config, request.changeId), "meta.yaml");
    if (await pathExists(mp)) {
      const meta = (await readYaml(mp)) as { title?: string; stage?: string };
      changeTitle = meta.title ?? request.changeId;
      stage = meta.stage;
    }
  }

  const runtime: SearchRuntime = {
    embedder: deps?.embedder,
    embedderFactory: deps?.embedderFactory,
  };
  await createBuiltinProvider(projectRoot, config, runtime).index();

  const budget = request.caps?.maxTokensApprox ?? budgetForStage(searchConfig, stage);
  const k = request.caps?.maxSlices ?? searchConfig.k;
  let query = request.query?.trim() ? request.query : "";
  if (!query && request.symbols?.length) query = request.symbols.join(" ");
  if (!query && changeTitle && request.changeId) query = changeTitle;

  let hits: RawHit[];
  if (query.trim()) {
    const embedder = await resolveEmbedder(projectRoot, searchConfig.embeddings, runtime);
    const embedded = await embedSearchQuery(embedder, searchConfig.embeddings, query);
    const ranked = await rankScope(projectRoot, query, "code", k, {
      embeddings: searchConfig.embeddings,
      queryVec: embedded.queryVec,
      failure: embedded.failure,
    });
    hits = ranked.hits;
    if (ranked.warning) {
      gaps.push({ code: "embeddings_unavailable", message: EMBEDDINGS_UNAVAILABLE });
    }
  } else {
    hits = await listScopeHits(projectRoot, "code");
  }

  const fileArgs: string[] = [];
  const dirArgs: string[] = [];
  for (const input of request.paths ?? []) {
    const rel = toRepoPath(projectRoot, input);
    let info: Awaited<ReturnType<typeof stat>> | null = null;
    try {
      info = await stat(join(projectRoot, rel));
    } catch {
      info = null;
    }
    if (!info) {
      gaps.push({ code: "path_missing", message: `Path not found: ${rel}`, path: rel });
      continue;
    }
    if (info.isDirectory()) {
      dirArgs.push(rel);
      continue;
    }
    fileArgs.push(rel);
    const ext = extname(rel).toLowerCase();
    if (isSecretPath(rel)) {
      gaps.push({
        code: "path_denied_secret",
        message: `Skipped potential secret path: ${rel}`,
        path: rel,
      });
      continue;
    }
    if (isIgnoredPath(rel)) {
      gaps.push({ code: "path_ignored", message: `Skipped ignored path: ${rel}`, path: rel });
      continue;
    }
    if (ext === ".go") {
      gaps.push({
        code: "unsupported_language",
        message: `No structure adapter for ${ext}; skipped.`,
        path: rel,
      });
    }
  }

  if (request.paths?.length) {
    hits = hits.filter((hit) => pathKept(hit.path, fileArgs, dirArgs));
  }
  const names = request.symbols ?? [];
  if (names.length) {
    hits = hits.filter((hit) => symbolKept(hit.symbol, names));
    hits.sort((a, b) => {
      const aExact = names.some((name) => a.symbol === name) ? 0 : 1;
      const bExact = names.some((name) => b.symbol === name) ? 0 : 1;
      return aExact - bExact;
    });
  }
  if (!query.trim()) hits = hits.slice(0, k);

  const indexed = new Set((await listScopeHits(projectRoot, "code")).map((hit) => hit.path));
  for (const rel of fileArgs) {
    const ext = extname(rel).toLowerCase();
    if (ext === ".go") continue;
    if (isSecretPath(rel) || isIgnoredPath(rel)) continue;
    if (!indexed.has(rel) && ext) {
      gaps.push({
        code: "parse_error",
        message: `Parse failed for ${rel} (continuing with other files).`,
        path: rel,
      });
    }
  }

  const packed = packHits({ preamble: "", hits, budget });
  const truncated =
    hits.length > packed.hits.length || packed.hits.some((hit) => hit.form === "signature");
  if (truncated) {
    gaps.push({
      code: "cap_truncated",
      message: "Packed under the token budget. Lower hits are signatures.",
    });
  }

  const slices: CodeSlice[] = packed.hits.map((hit) => ({
    id: `${hit.path}:${hit.startLine}-${hit.endLine}:${hit.symbol}`,
    filePath: hit.path,
    startLine: hit.startLine,
    endLine: hit.endLine,
    symbolName: hit.symbol,
    reason: hit.form === "full" ? "keyword full" : "keyword signature",
    body: hit.form === "full" ? hit.body : hit.signature,
  }));
  const summary: CodeContextSummary = {
    focusPaths: plan.seedPaths,
    focusSymbols: plan.seedSymbols,
    keywords: plan.keywords,
    filesAnalyzed: new Set(hits.map((hit) => hit.path)).size,
    symbolsExtracted: hits.length,
    slicesEmitted: slices.length,
    truncated,
  };
  const formatted = formatMarkdown({
    plan,
    summary,
    slices,
    gaps,
    changeTitle,
    packedText: packed.text,
  });

  let artifactPath: string | undefined;
  if (request.writeArtifactTo) {
    await writeText(request.writeArtifactTo, formatted.markdown);
    artifactPath = request.writeArtifactTo;
  }

  return {
    ok: true,
    markdown: formatted.markdown,
    summary,
    slices,
    gaps,
    artifactPath,
  };
}

export { resolveFocus, tokenizeKeywords, extractPathLikeTokens } from "./focus.js";
export { isSecretPath } from "./secrets.js";
export { isIgnoredPath, classifyPath } from "./ignore.js";
export { AdapterRegistry } from "./adapters/registry.js";
export { typescriptAdapter } from "./adapters/typescript.js";
export { fallbackAdapter } from "./adapters/fallback.js";
