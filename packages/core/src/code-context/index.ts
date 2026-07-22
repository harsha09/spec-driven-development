/**
 * On-demand structure-aware code context pipeline (Option A).
 * Public entry: generateCodeContext
 */

import { extname, join, normalize } from "pathe";
import { pathExists, readText, writeText } from "../fs.js";
import { AdapterRegistry } from "./adapters/registry.js";
import type { LanguageAdapter } from "./adapters/types.js";
import { isTypescriptAdapterAvailable } from "./adapters/typescript.js";
import { formatMarkdown } from "./formatter.js";
import { resolveFocus } from "./focus.js";
import { GraphLite } from "./graph.js";
import { classifyPath } from "./ignore.js";
import { rankSymbols } from "./ranker.js";
import { emitSlices } from "./slicer.js";
import {
  type CodeContextGap,
  type CodeContextRequest,
  type CodeContextResult,
  type CodeContextSummary,
  mergeCaps,
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

/** Optional deps for tests (inject adapters). */
export type GenerateCodeContextDeps = {
  adapters?: LanguageAdapter[];
  now?: () => Date;
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
    ...gaps.map(
      (g) =>
        `- (\`${g.code}\`) ${g.message}${g.path ? ` — \`${g.path}\`` : ""}`,
    ),
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

/**
 * Main entry: on-demand pipeline. Partial success returns ok:true with gaps.
 * Hard failures return ok:false with gaps and minimal markdown explaining failure.
 */
export async function generateCodeContext(
  request: CodeContextRequest,
  deps?: GenerateCodeContextDeps,
): Promise<CodeContextResult> {
  const caps = mergeCaps(request.caps);
  const projectRoot = request.projectRoot;
  const gaps: CodeContextGap[] = [];

  // Adapter availability (hard if TS cannot load and no custom adapters)
  if (!deps?.adapters?.length && !isTypescriptAdapterAvailable()) {
    return hardFailure(
      [
        {
          code: "adapter_unavailable",
          message:
            "TypeScript language adapter could not be loaded; ensure `typescript` is installed with @structured-vibe-coding/core.",
        },
      ],
      "Language adapter unavailable",
    );
  }

  const registry = new AdapterRegistry(deps?.adapters);

  // Focus
  const { plan, gaps: focusGaps } = await resolveFocus(request);
  gaps.push(...focusGaps);

  const hasFocus =
    plan.seedPaths.length > 0 ||
    plan.candidatePaths.length > 0 ||
    plan.seedSymbols.length > 0 ||
    plan.keywords.length > 0 ||
    Boolean(request.paths?.length) ||
    Boolean(request.query) ||
    Boolean(request.symbols?.length);

  // Hard no_focus when nothing to analyze
  if (
    !plan.seedPaths.length &&
    !plan.candidatePaths.length &&
    !plan.seedSymbols.length &&
    !request.paths?.length &&
    !request.query &&
    !request.symbols?.length
  ) {
    // Still might have keywords from change title — if candidates empty and no seeds
    if (!plan.keywords.length) {
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
  }

  // If symbols-only but zero candidates after search, still hard fail
  if (!plan.candidatePaths.length && !plan.seedPaths.length) {
    if (!hasFocus) {
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
    // Had focus signals but nothing found — soft empty ok? Prefer hard no_focus
    gaps.push({
      code: "no_focus",
      message:
        "Focus signals present but no candidate source files resolved. Pass --path to a file or directory.",
    });
    return hardFailure(gaps, "No candidate files", {
      focusSymbols: plan.seedSymbols,
      keywords: plan.keywords,
      focusPaths: plan.seedPaths,
    });
  }

  // Cap candidates
  let candidates = [...plan.candidatePaths];
  if (!candidates.length) candidates = [...plan.seedPaths];
  let truncated = false;
  if (candidates.length > caps.maxFiles) {
    candidates = candidates.slice(0, caps.maxFiles);
    truncated = true;
    gaps.push({
      code: "cap_truncated",
      message: `Candidate files capped at maxFiles=${caps.maxFiles}.`,
    });
  }

  // Parse / extract
  const graph = new GraphLite();
  let filesAnalyzed = 0;
  let symbolsExtracted = 0;

  for (const rel of candidates) {
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

    const abs = join(projectRoot, rel);
    if (!(await pathExists(abs))) {
      gaps.push({
        code: "path_missing",
        message: `Path not found: ${rel}`,
        path: rel,
      });
      continue;
    }

    const adapter = registry.getByPath(rel);
    if (!adapter) {
      gaps.push({
        code: "unsupported_language",
        message: `No structure adapter for ${extname(rel) || rel}; skipped.`,
        path: rel,
      });
      continue;
    }

    let source: string;
    try {
      source = await readText(abs);
    } catch (err) {
      gaps.push({
        code: "parse_error",
        message: `Could not read ${rel}`,
        path: rel,
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    let extract;
    try {
      extract = await adapter.extract({
        filePath: normalize(rel).replace(/\\/g, "/"),
        source,
        projectRoot,
      });
    } catch (err) {
      gaps.push({
        code: "parse_error",
        message: `Parse failed for ${rel} (continuing with other files).`,
        path: rel,
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!extract.ok) {
      gaps.push({
        code: "parse_error",
        message: `Parse failed for ${rel} (continuing with other files).`,
        path: rel,
        detail: extract.errors?.join("; "),
      });
      // still add if any symbols
      if (!extract.symbols.length) continue;
    }

    // Normalize symbol paths to repo-relative
    extract.symbols = extract.symbols.map((s) => ({
      ...s,
      filePath: normalize(rel).replace(/\\/g, "/"),
    }));

    if (!extract.symbols.length && extract.ok) {
      gaps.push({
        code: "empty_extract",
        message: `No symbols extracted from ${rel}.`,
        path: rel,
      });
    }

    graph.add(normalize(rel).replace(/\\/g, "/"), source, extract);
    filesAnalyzed++;
    symbolsExtracted += extract.symbols.length;
  }

  // Rank + slice
  const ranked = rankSymbols(graph, plan, caps);
  const sliceResult = emitSlices(ranked, graph, caps, {
    includeNeighbors: request.includeNeighbors,
  });
  gaps.push(...sliceResult.gaps);
  truncated = truncated || sliceResult.truncated;

  const summary: CodeContextSummary = {
    focusPaths: plan.seedPaths,
    focusSymbols: plan.seedSymbols,
    keywords: plan.keywords,
    filesAnalyzed,
    symbolsExtracted,
    slicesEmitted: sliceResult.slices.length,
    truncated,
  };

  let changeTitle: string | null = plan.changeId;
  if (plan.changeId) {
    try {
      const { readYaml } = await import("../fs.js");
      const metaPath = join(
        projectRoot,
        // best-effort: changes/<id>/meta.yaml via relative walk
        // Prefer using change path from resolve — re-read lightly
        "changes",
        plan.changeId,
        "meta.yaml",
      );
      // try config-aware path
      const { loadConfig } = await import("../config.js");
      const { changePath } = await import("../paths.js");
      const config = await loadConfig(projectRoot);
      const mp = join(changePath(projectRoot, config, plan.changeId), "meta.yaml");
      if (await pathExists(mp)) {
        const meta = (await readYaml(mp)) as { title?: string };
        changeTitle = meta.title ?? plan.changeId;
      } else if (await pathExists(metaPath)) {
        const meta = (await readYaml(metaPath)) as { title?: string };
        changeTitle = meta.title ?? plan.changeId;
      }
    } catch {
      /* ignore */
    }
  }

  const formatted = formatMarkdown({
    plan,
    summary,
    slices: sliceResult.slices,
    gaps,
    changeTitle,
    maxOutputLines: caps.maxOutputLines,
    maxTokensApprox: caps.maxTokensApprox,
  });
  if (formatted.truncated && !summary.truncated) {
    summary.truncated = true;
    if (!gaps.some((g) => g.code === "cap_truncated")) {
      gaps.push({
        code: "cap_truncated",
        message:
          "Output truncated at configured caps (maxOutputLines/maxTokensApprox).",
      });
    }
  }

  // Re-format if we added truncation gap so Gaps section stays accurate
  const finalFormat = formatMarkdown({
    plan,
    summary,
    slices: sliceResult.slices,
    gaps,
    changeTitle,
    maxOutputLines: caps.maxOutputLines,
    maxTokensApprox: caps.maxTokensApprox,
  });

  let artifactPath: string | undefined;
  if (request.writeArtifactTo) {
    await writeText(request.writeArtifactTo, finalFormat.markdown);
    artifactPath = request.writeArtifactTo;
  }

  return {
    ok: true,
    markdown: finalFormat.markdown,
    summary,
    slices: sliceResult.slices,
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
