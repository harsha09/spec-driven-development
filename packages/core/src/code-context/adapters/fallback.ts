import type { AdapterExtractResult, LanguageAdapter } from "./types.js";

/**
 * Shallow text fallback for unknown languages.
 * Exists for tests / future opt-in only — NOT used by default for unknown langs
 * (research §4.4: skip + unsupported_language gap).
 */
export const fallbackAdapter: LanguageAdapter = {
  id: "fallback",
  extensions: [],

  extract(input): AdapterExtractResult {
    const lines = input.source.split(/\r?\n/);
    const headEnd = Math.min(lines.length, 20);
    return {
      ok: true,
      language: "text",
      symbols: [
        {
          name: "(file-header)",
          kind: "unknown",
          filePath: input.filePath,
          startLine: 1,
          endLine: headEnd,
          exported: false,
        },
      ],
      imports: [],
      exports: [],
      errors: ["fallback: no AST; shallow header only"],
    };
  },
};
