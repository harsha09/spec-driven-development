/**
 * Formatter: stable agent-facing markdown (LLD §2.6).
 */

import type {
  CodeContextGap,
  CodeContextSummary,
  CodeSlice,
  FocusPlan,
} from "./types.js";

export interface FormatInput {
  plan: FocusPlan;
  summary: CodeContextSummary;
  slices: CodeSlice[];
  gaps: CodeContextGap[];
  changeTitle?: string | null;
  maxOutputLines?: number;
  maxTokensApprox?: number;
}

function fenceLang(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tsx") || lower.endsWith(".jsx")) return "tsx";
  if (
    lower.endsWith(".ts") ||
    lower.endsWith(".mts") ||
    lower.endsWith(".cts")
  ) {
    return "ts";
  }
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {
    return "js";
  }
  return "";
}

export function formatMarkdown(input: FormatInput): {
  markdown: string;
  truncated: boolean;
} {
  const lines: string[] = [];
  lines.push("# Code context");
  lines.push("");
  lines.push(
    "> Generated on-demand for agents. Not a substitute for process context",
  );
  lines.push(
    "> (.sdd/protocol.md, active-context, change packs).",
  );
  lines.push(
    "> Regenerable — run `sdd context --out change` (or pass `--path` / `--symbol`).",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push(
    `- Change: ${input.changeTitle ?? input.plan.changeId ?? "(none)"}`,
  );
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

  let truncated = input.summary.truncated;
  const maxLines = input.maxOutputLines ?? 8000;
  const maxTokens = input.maxTokensApprox ?? 12000;
  let approxTokens = 0;

  for (const slice of input.slices) {
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
    const header = `### \`${slice.filePath}\`${
      slice.symbolName ? ` · \`${slice.symbolName}\`` : ""
    } (lines ${slice.startLine}–${slice.endLine}) · ${slice.reason}`;
    lines.push(header);
    lines.push("```" + fenceLang(slice.filePath));
    lines.push(slice.body);
    lines.push("```");
    lines.push("");
    approxTokens += Math.ceil((header.length + slice.body.length) / 4);
    if (approxTokens > maxTokens) {
      truncated = true;
      break;
    }
  }

  if (!input.slices.length) {
    lines.push("_No slices emitted._");
    lines.push("");
  }

  lines.push("## Structural notes");
  const topFiles = [
    ...new Set(input.slices.map((s) => s.filePath)),
  ].slice(0, 15);
  if (topFiles.length) {
    lines.push(`- Ranked files (sample): ${topFiles.join(", ")}`);
  } else {
    lines.push("- No structural neighborhood (empty analysis set).");
  }
  lines.push("");

  let markdown = lines.join("\n");
  // Hard token budget on whole doc
  if (Math.ceil(markdown.length / 4) > maxTokens) {
    truncated = true;
    markdown = markdown.slice(0, maxTokens * 4) + "\n\n…(truncated)\n";
  }

  return { markdown, truncated };
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
