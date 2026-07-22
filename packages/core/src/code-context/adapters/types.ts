import type { SymbolInfo } from "../types.js";

export interface LanguageAdapter {
  readonly id: string;
  readonly extensions: string[];

  /**
   * Extract symbols + imports/exports + local references.
   * Must not throw for recoverable parse issues — return ok:false + errors.
   */
  extract(input: {
    filePath: string;
    source: string;
    projectRoot: string;
  }): Promise<AdapterExtractResult> | AdapterExtractResult;
}

export interface AdapterExtractResult {
  ok: boolean;
  language: string;
  symbols: SymbolInfo[];
  imports: { from: string; names?: string[] }[];
  exports: { name: string; kind?: string }[];
  /** Optional: name references found in this file (for GraphLite) */
  references?: { name: string; line: number }[];
  errors?: string[];
}
