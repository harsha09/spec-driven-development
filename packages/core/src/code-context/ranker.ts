/**
 * Ranker: weighted heuristic scores (research §5.1).
 */

import { basename } from "pathe";
import type { GraphLite } from "./graph.js";
import type { CodeContextCaps, FocusPlan, RankedItem, SymbolInfo } from "./types.js";

export function isTestPath(filePath: string): boolean {
  const p = filePath.replace(/\\/g, "/");
  return (
    p.includes("__tests__/") ||
    p.includes("/__tests__/") ||
    /\.test\.[cm]?[jt]sx?$/.test(p) ||
    /\.spec\.[cm]?[jt]sx?$/.test(p)
  );
}

function pathSegments(filePath: string): string[] {
  return filePath
    .replace(/\\/g, "/")
    .toLowerCase()
    .split("/")
    .filter(Boolean)
    .flatMap((s) => s.replace(/\.[^.]+$/, "").split(/[-_.]/));
}

function scoreSymbol(
  symbol: SymbolInfo,
  plan: FocusPlan,
  graph: GraphLite,
  caps: CodeContextCaps,
): RankedItem {
  let score = 0;
  const reasons: string[] = [];
  const seeds = new Set(plan.seedPaths);
  const seedSymbols = plan.seedSymbols;

  // Exact symbol match
  if (seedSymbols.length) {
    const exact = seedSymbols.find((s) => s === symbol.name);
    if (exact) {
      score += 100;
      reasons.push("exact-symbol");
    } else {
      const ci = seedSymbols.find(
        (s) => s.toLowerCase() === symbol.name.toLowerCase(),
      );
      if (ci) {
        score += 90;
        reasons.push("symbol-ci");
      }
    }
  }

  // Seed path
  if (seeds.has(symbol.filePath)) {
    score += 40;
    reasons.push("seed-path");
  }

  // Import hop
  const hop = graph.hopDistance(symbol.filePath, plan.seedPaths, caps.maxImportHops);
  if (hop === 0) {
    score += 30;
    reasons.push("hop-0");
  } else if (hop === 1) {
    score += 18;
    reasons.push("hop-1");
  }

  // Keyword hits on symbol name
  const nameLower = symbol.name.toLowerCase();
  let kwHits = 0;
  for (const k of plan.keywords) {
    if (nameLower.includes(k)) {
      kwHits++;
      if (kwHits >= 3) break;
    }
  }
  if (kwHits) {
    score += 15 * kwHits;
    reasons.push(`keyword-name×${kwHits}`);
  }

  // Keyword hits on path segments
  const segs = pathSegments(symbol.filePath);
  let pathHits = 0;
  for (const k of plan.keywords) {
    if (segs.some((s) => s.includes(k) || k.includes(s))) {
      pathHits++;
      if (pathHits >= 3) break;
    }
  }
  if (pathHits) {
    score += 8 * pathHits;
    reasons.push(`keyword-path×${pathHits}`);
  }

  // Exported boost
  if (symbol.exported) {
    score += 5;
    reasons.push("exported");
  }

  // Change-title token overlap already in keywords — small extra on basename
  const base = basename(symbol.filePath).toLowerCase();
  let titleHits = 0;
  for (const k of plan.keywords.slice(0, 10)) {
    if (base.includes(k)) {
      titleHits++;
      if (titleHits >= 2) break;
    }
  }
  if (titleHits) {
    score += 6 * titleHits;
    reasons.push(`title-path×${titleHits}`);
  }

  // Test penalty unless focus is tests
  const focusIsTest =
    plan.seedPaths.some(isTestPath) ||
    plan.keywords.some((k) => k === "test" || k === "tests" || k === "vitest");
  if (isTestPath(symbol.filePath) && !focusIsTest) {
    score -= 12;
    reasons.push("test-penalty");
  }

  // Huge file penalty (lines over 400)
  const source = graph.getSource(symbol.filePath);
  if (source) {
    const lines = source.split(/\r?\n/).length;
    if (lines > 400) {
      const over = Math.floor((lines - 400) / 200);
      const pen = Math.min(10, over);
      if (pen > 0) {
        score -= pen;
        reasons.push("huge-file");
      }
    }
  }

  // Prefer real declarations slightly
  if (
    symbol.kind === "function" ||
    symbol.kind === "class" ||
    symbol.kind === "interface"
  ) {
    score += 2;
  }

  return { symbol, score, reasons };
}

export function rankSymbols(
  graph: GraphLite,
  plan: FocusPlan,
  caps: CodeContextCaps,
): RankedItem[] {
  const items = graph.allSymbols().map((s) => scoreSymbol(s, plan, graph, caps));
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // stable tie-break
    const fa = a.symbol.filePath.localeCompare(b.symbol.filePath);
    if (fa !== 0) return fa;
    return a.symbol.startLine - b.symbol.startLine;
  });
  return items.slice(0, caps.maxSymbols);
}
