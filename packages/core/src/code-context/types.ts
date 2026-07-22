/**
 * Public + internal types for the on-demand structure-aware code context pipeline.
 * Contracts: LLD §2.1 / research §6.5.
 */

export interface CodeContextCaps {
  /** Max source files to fully parse (after focus expansion). Default: 40 */
  maxFiles: number;
  /** Max ranked symbols to consider for slicing. Default: 30 */
  maxSymbols: number;
  /** Max code slices in output. Default: 20 */
  maxSlices: number;
  /** Max lines per slice body. Default: 80 */
  maxLinesPerSlice: number;
  /** Soft budget for entire markdown body (approx). Default: 8000 */
  maxOutputLines: number;
  /** Approx token budget (chars/4 heuristic OK for v1). Default: 12000 */
  maxTokensApprox: number;
  /** Max hop distance on import graph from seed files. Default: 1 */
  maxImportHops: number;
}

export const DEFAULT_CODE_CONTEXT_CAPS: CodeContextCaps = {
  maxFiles: 40,
  maxSymbols: 30,
  maxSlices: 20,
  maxLinesPerSlice: 80,
  maxOutputLines: 8000,
  maxTokensApprox: 12000,
  maxImportHops: 1,
};

export interface CodeContextRequest {
  projectRoot: string;
  /** Active change id when known; null = flags-only / no change pack signals */
  changeId?: string | null;
  /** Explicit paths (files or dirs), repo-relative or absolute */
  paths?: string[];
  /** Symbol names to prioritize (e.g. function/class/export) */
  symbols?: string[];
  /** Free-text focus (task phrase); used for keyword ranking only */
  query?: string;
  caps?: Partial<CodeContextCaps>;
  /** When true, include more structural neighbors within caps. Default false */
  includeNeighbors?: boolean;
  /**
   * If set, also write regenerable markdown to this absolute path.
   * Core may write the file; CLI decides default path under changes/<id>/.
   */
  writeArtifactTo?: string | null;
}

export type CodeContextGapCode =
  | "no_focus"
  | "path_missing"
  | "path_denied_secret"
  | "path_ignored"
  | "unsupported_language"
  | "parse_error"
  | "empty_extract"
  | "cap_truncated"
  | "no_active_change"
  | "change_not_found"
  | "adapter_unavailable";

export interface CodeContextGap {
  code: CodeContextGapCode;
  message: string;
  path?: string;
  detail?: string;
}

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "export"
  | "unknown";

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  filePath: string; // repo-relative posix-ish
  startLine: number; // 1-based inclusive
  endLine: number;
  exported: boolean;
}

export interface CodeSlice {
  id: string; // stable within one run, e.g. file:start-end:name
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  reason: string; // why included (seed, import-of, keyword, neighbor)
  body: string; // source lines, already line-capped
}

export interface CodeContextSummary {
  focusPaths: string[];
  focusSymbols: string[];
  keywords: string[];
  filesAnalyzed: number;
  symbolsExtracted: number;
  slicesEmitted: number;
  truncated: boolean;
}

export interface CodeContextResult {
  ok: boolean; // false only for hard failures
  markdown: string;
  summary: CodeContextSummary;
  slices: CodeSlice[];
  gaps: CodeContextGap[];
  artifactPath?: string;
}

/** Internal focus plan after FocusResolver. */
export interface FocusPlan {
  seedPaths: string[]; // resolved existing files (not dirs)
  seedSymbols: string[];
  keywords: string[];
  candidatePaths: string[]; // after expansion + ignore filter, pre-cap
  changeId: string | null;
  notes: string[];
}

export interface ImportEdge {
  from: string; // file that imports
  to: string; // module specifier (unresolved or relative path)
  names?: string[];
}

export interface RankedItem {
  symbol: SymbolInfo;
  score: number;
  reasons: string[];
}

export function mergeCaps(partial?: Partial<CodeContextCaps>): CodeContextCaps {
  return { ...DEFAULT_CODE_CONTEXT_CAPS, ...partial };
}
