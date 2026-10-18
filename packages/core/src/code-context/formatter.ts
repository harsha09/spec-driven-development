/**
 * Formatter: stable agent-facing markdown (LLD §2.6).
 */

import type { CodeContextGap, CodeContextSummary, CodeSlice, FocusPlan } from "./types.js";

export interface FormatInput {
  plan: FocusPlan;
  summary: CodeContextSummary;
  slices: CodeSlice[];
  gaps: CodeContextGap[];
  changeTitle?: string | null;
  maxOutputLines?: number;
  maxTokensApprox?: number;
  /** Packed hit blocks. The frame above `## Slices` is outside the token budget. */
  packedText?: string;
}

export function formatMarkdown(input: FormatInput): {
  markdown: string;
  truncated: boolean;
} {
  const lines: string[] = [];
  lines.push("# Code context");
  lines.push("");
  lines.push("> Generated on-demand for agents. Not a substitute for process context");
  lines.push("> (.sdd/protocol.md, active-context, change packs).");
  lines.push("> Regenerable — run `sdd context --out change` (or pass `--path` / `--symbol`).");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Change: ${input.changeTitle ?? input.plan.changeId ?? "(none)"}`);
  lines.push(
    `- Focus paths: ${input.summary.focusPaths.length ? input.summary.focusPaths.join(", ") : "(none)"}`,
  );
  lines.push(
    `- Focus symbols: ${input.summary.focusSymbols.length ? input.summary.focusSymbols.join(", ") : "(none)"}`,
  );
  lines.push(
    `- Keywords: ${input.summary.keywords.length ? input.summary.keywords.join(", ") : "(none)"}`,
  );
  lines.push(
    `- Files analyzed: ${input.summary.filesAnalyzed} · Symbols: ${input.summary.symbolsExtracted} · Slices: ${input.summary.slicesEmitted}`,
  );
  lines.push(`- Truncated: ${input.summary.truncated ? "yes" : "no"}`);
  if (input.plan.notes.length) {
    lines.push(`- Notes: ${input.plan.notes.join("; ")}`);
  }
  lines.push("");
  lines.push("## Gaps");
  if (!input.gaps.length) {
    lines.push("_None._");
  } else {
    for (const g of input.gaps) {
      const pathPart = g.path ? ` — \`${g.path}\`` : "";
      lines.push(`- (\`${g.code}\`) ${g.message}${pathPart}`);
    }
  }
  lines.push("");
  lines.push("## Slices");
  lines.push("");

  const packed = input.packedText ?? "";
  const frame = `${lines.join("\n")}\n`;
  return { markdown: packed ? frame + packed : frame, truncated: input.summary.truncated };
}

export function formatJsonSummary(
  summary: CodeContextSummary,
  gaps: CodeContextGap[],
  slices: CodeSlice[],
  ok: boolean,
): string {
  return JSON.stringify(
    {
      ok,
      summary,
      gaps,
      slices: slices.map((s) => ({
        id: s.id,
        filePath: s.filePath,
        startLine: s.startLine,
        endLine: s.endLine,
        symbolName: s.symbolName,
        reason: s.reason,
      })),
    },
    null,
    2,
  );
}
