/**
 * GraphLite: in-memory nodes/edges for analyzed files only.
 */

import { dirname, join, normalize } from "pathe";
import type { AdapterExtractResult } from "./adapters/types.js";
import type { ImportEdge, SymbolInfo } from "./types.js";

export interface FileNode {
  path: string; // repo-relative
  extract: AdapterExtractResult;
  source: string;
}

export class GraphLite {
  readonly files = new Map<string, FileNode>();
  readonly edges: ImportEdge[] = [];

  add(path: string, source: string, extract: AdapterExtractResult): void {
    const norm = normalize(path).replace(/\\/g, "/");
    this.files.set(norm, { path: norm, extract, source });
    for (const imp of extract.imports) {
      this.edges.push({
        from: norm,
        to: imp.from,
        names: imp.names,
      });
    }
  }

  allSymbols(): SymbolInfo[] {
    const out: SymbolInfo[] = [];
    for (const node of this.files.values()) {
      out.push(...node.extract.symbols);
    }
    return out;
  }

  getSource(path: string): string | undefined {
    return this.files.get(normalize(path).replace(/\\/g, "/"))?.source;
  }

  /**
   * Resolve relative import specifier to a known graph file path, if present.
   */
  resolveImportTarget(fromFile: string, specifier: string): string | undefined {
    if (!specifier.startsWith(".")) return undefined;
    const base = dirname(fromFile);
    const joined = normalize(join(base, specifier)).replace(/\\/g, "/");
    const candidates = [
      joined,
      `${joined}.ts`,
      `${joined}.tsx`,
      `${joined}.js`,
      `${joined}.jsx`,
      `${joined}.mts`,
      `${joined}.cts`,
      `${joined}/index.ts`,
      `${joined}/index.js`,
    ];
    for (const c of candidates) {
      if (this.files.has(c)) return c;
    }
    // try without extension already in specifier
    for (const [p] of this.files) {
      if (p === joined || p.startsWith(joined + ".")) return p;
    }
    return undefined;
  }

  /** Import hop distance from any seed file (0 = seed, 1 = direct import, …). */
  hopDistance(filePath: string, seedPaths: string[], maxHops: number): number | null {
    const norm = normalize(filePath).replace(/\\/g, "/");
    const seeds = new Set(seedPaths.map((s) => normalize(s).replace(/\\/g, "/")));
    if (seeds.has(norm)) return 0;

    // BFS outward from seeds via resolved import edges
    let frontier = new Set(seeds);
    const visited = new Set(seeds);
    for (let hop = 1; hop <= maxHops; hop++) {
      const next = new Set<string>();
      for (const f of frontier) {
        for (const e of this.edges) {
          if (e.from !== f) continue;
          const target = this.resolveImportTarget(e.from, e.to);
          if (!target || visited.has(target)) continue;
          visited.add(target);
          next.add(target);
          if (target === norm) return hop;
        }
      }
      frontier = next;
      if (!frontier.size) break;
    }
    return null;
  }

  importNeighbors(filePath: string): string[] {
    const norm = normalize(filePath).replace(/\\/g, "/");
    const out: string[] = [];
    for (const e of this.edges) {
      if (e.from !== norm) continue;
      const t = this.resolveImportTarget(e.from, e.to);
      if (t) out.push(t);
    }
    return out;
  }
}
