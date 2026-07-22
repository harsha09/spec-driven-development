/**
 * Slicer: definition-ish spans under hard caps.
 */

import { isSecretPath } from "./secrets.js";
import type { GraphLite } from "./graph.js";
import type {
  CodeContextCaps,
  CodeContextGap,
  CodeSlice,
  RankedItem,
} from "./types.js";

function sliceBody(
  source: string,
  startLine: number,
  endLine: number,
  maxLines: number,
): { body: string; end: number; truncated: boolean } {
  const lines = source.split(/\r?\n/);
  const start = Math.max(1, startLine);
  let end = Math.min(lines.length, endLine);
  let truncated = false;
  if (end - start + 1 > maxLines) {
    end = start + maxLines - 1;
    truncated = true;
  }
  const body = lines.slice(start - 1, end).join("\n");
  return { body, end, truncated };
}

export interface SliceResult {
  slices: CodeSlice[];
  gaps: CodeContextGap[];
  truncated: boolean;
}

export function emitSlices(
  ranked: RankedItem[],
  graph: GraphLite,
  caps: CodeContextCaps,
  options?: { includeNeighbors?: boolean },
): SliceResult {
  const slices: CodeSlice[] = [];
  const gaps: CodeContextGap[] = [];
  let truncated = false;
  const seen = new Set<string>();

  for (const item of ranked) {
    if (slices.length >= caps.maxSlices) {
      truncated = true;
      break;
    }
    const sym = item.symbol;
    if (isSecretPath(sym.filePath)) continue;
    const source = graph.getSource(sym.filePath);
    if (!source) continue;

    const { body, end, truncated: lineTrunc } = sliceBody(
      source,
      sym.startLine,
      sym.endLine,
      caps.maxLinesPerSlice,
    );
    if (lineTrunc) truncated = true;

    const id = `${sym.filePath}:${sym.startLine}-${end}:${sym.name}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const reasonParts = item.reasons.length
      ? item.reasons.slice(0, 4).join(", ")
      : "ranked";
    slices.push({
      id,
      filePath: sym.filePath,
      startLine: sym.startLine,
      endLine: end,
      symbolName: sym.name,
      reason: reasonParts,
      body,
    });

    // Optional one import neighbor definition
    if (options?.includeNeighbors && slices.length < caps.maxSlices) {
      const neighbors = graph.importNeighbors(sym.filePath);
      for (const n of neighbors.slice(0, 1)) {
        if (isSecretPath(n)) continue;
        const nSource = graph.getSource(n);
        const nNode = graph.files.get(n);
        if (!nSource || !nNode) continue;
        const nSym =
          nNode.extract.symbols.find((s) => s.exported) ??
          nNode.extract.symbols[0];
        if (!nSym) continue;
        const nb = sliceBody(
          nSource,
          nSym.startLine,
          nSym.endLine,
          caps.maxLinesPerSlice,
        );
        const nid = `${nSym.filePath}:${nSym.startLine}-${nb.end}:${nSym.name}:neighbor`;
        if (seen.has(nid)) continue;
        seen.add(nid);
        slices.push({
          id: nid,
          filePath: nSym.filePath,
          startLine: nSym.startLine,
          endLine: nb.end,
          symbolName: nSym.name,
          reason: `neighbor-of ${sym.name}`,
          body: nb.body,
        });
        if (nb.truncated) truncated = true;
        break;
      }
    }
  }

  if (truncated) {
    gaps.push({
      code: "cap_truncated",
      message:
        "Output truncated at configured caps (maxSlices/maxLinesPerSlice).",
    });
  }

  return { slices, gaps, truncated };
}
