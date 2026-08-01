/**
 * Shared handlers for MCP tools — pure logic, easy to unit test without stdio.
 */

import {
  formatJsonSummary,
  generateCodeContext,
  type CodeContextResult,
} from "@structured-vibe-coding/core";

export interface CodeContextToolInput {
  /** Project root (absolute). Defaults to process.cwd() / SDD_PROJECT_ROOT */
  projectRoot?: string;
  /** Seed file or directory paths (repo-relative or absolute) */
  paths?: string[];
  /** Symbol names to prioritize */
  symbols?: string[];
  /** Free-text focus for ranking */
  query?: string;
  /** Include import neighbors within caps */
  includeNeighbors?: boolean;
  /** Approx token budget (default 4000 for MCP — tighter than CLI default) */
  maxTokens?: number;
  maxFiles?: number;
  maxSlices?: number;
  maxLinesPerSlice?: number;
  /** markdown (default) | summary (JSON stats + slice headers only) */
  format?: "markdown" | "summary";
}

export function resolveProjectRoot(input?: string): string {
  const fromEnv = process.env.SDD_PROJECT_ROOT?.trim();
  const root = (input || fromEnv || process.cwd()).trim();
  return root;
}

/**
 * Run AST code-context pipeline for MCP / programmatic callers.
 * Default caps are tighter than CLI so agents pull less into the context window.
 */
export async function runCodeContextTool(
  input: CodeContextToolInput,
): Promise<{ text: string; result: CodeContextResult }> {
  const projectRoot = resolveProjectRoot(input.projectRoot);
  const format = input.format ?? "markdown";

  const result = await generateCodeContext({
    projectRoot,
    paths: input.paths?.length ? input.paths : undefined,
    symbols: input.symbols?.length ? input.symbols : undefined,
    query: input.query || undefined,
    includeNeighbors: Boolean(input.includeNeighbors),
    caps: {
      maxTokensApprox: input.maxTokens ?? 4000,
      maxFiles: input.maxFiles ?? 24,
      maxSlices: input.maxSlices ?? 12,
      maxLinesPerSlice: input.maxLinesPerSlice ?? 60,
      maxOutputLines: 3000,
    },
  });

  if (format === "summary") {
    const text = formatJsonSummary(
      result.summary,
      result.gaps,
      result.slices,
      result.ok,
    );
    return { text, result };
  }

  return {
    text: result.markdown.endsWith("\n")
      ? result.markdown
      : `${result.markdown}\n`,
    result,
  };
}
