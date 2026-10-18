import type { RawHit } from "./types.js";

export const RRF_K = 60;

export function rrf(rank: number | undefined): number {
  if (rank === undefined) return 0;
  return 1 / (RRF_K + rank);
}

export interface RankInput {
  id: string;
  path: string;
  startLine: number;
  symbol: string;
  keywordRank?: number;
  vectorRank?: number;
}

function byPath(a: RankInput, b: RankInput): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.startLine !== b.startLine) return a.startLine - b.startLine;
  if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
  return 0;
}

/** Pure fusion. Higher score first, then path, start line, and symbol. */
export function fuseByRank(entries: readonly RankInput[]): { id: string; score: number }[] {
  const sorted = [...entries].sort((a, b) => {
    const delta = rrf(b.keywordRank) + rrf(b.vectorRank) - (rrf(a.keywordRank) + rrf(a.vectorRank));
    if (delta !== 0) return delta;
    return byPath(a, b);
  });
  return sorted.map((entry) => ({
    id: entry.id,
    score: rrf(entry.keywordRank) + rrf(entry.vectorRank),
  }));
}

function hitKey(hit: RawHit): string {
  return `${hit.path}\0${hit.startLine}\0${hit.symbol}`;
}

function comparePath(a: RawHit, b: RawHit): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.startLine !== b.startLine) return a.startLine - b.startLine;
  if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
  return 0;
}

/** Union of the two source lists. Does not cut the result to k. */
export function fuseHits(keyword: readonly RawHit[], vector: readonly RawHit[]): RawHit[] {
  const map = new Map<string, { hit: RawHit; keywordRank?: number; vectorRank?: number }>();
  for (let i = 0; i < keyword.length; i++) {
    const hit = keyword[i];
    if (!hit) continue;
    map.set(hitKey(hit), { hit, keywordRank: i + 1 });
  }
  for (let i = 0; i < vector.length; i++) {
    const hit = vector[i];
    if (!hit) continue;
    const key = hitKey(hit);
    const existing = map.get(key);
    if (existing) existing.vectorRank = i + 1;
    else map.set(key, { hit, vectorRank: i + 1 });
  }
  const fused: RawHit[] = [];
  for (const entry of map.values()) {
    fused.push({
      ...entry.hit,
      score: rrf(entry.keywordRank) + rrf(entry.vectorRank),
      rankedBy: "rrf",
    });
  }
  fused.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return comparePath(a, b);
  });
  return fused;
}

const SCOPE_ORDER: Record<RawHit["scope"], number> = { specs: 0, memory: 1, code: 2 };

function compareBm25(a: RawHit, b: RawHit, scopeOrder: boolean): number {
  if (a.score !== b.score) return a.score - b.score;
  if (scopeOrder) {
    const scopeDelta = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    if (scopeDelta !== 0) return scopeDelta;
  }
  return comparePath(a, b);
}

/**
 * All-bm25 keeps the S1 sort. Any rrf hit is emitted first by RRF descending,
 * then bm25 hits by BM25 ascending. The two scores are never compared.
 */
export function mergeRankedHits(hits: readonly RawHit[]): RawHit[] {
  if (hits.every((hit) => hit.rankedBy !== "rrf")) {
    return [...hits].sort((a, b) => compareBm25(a, b, true));
  }
  const rrfHits = hits.filter((hit) => hit.rankedBy === "rrf");
  const bm25Hits = hits.filter((hit) => hit.rankedBy !== "rrf");
  rrfHits.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return comparePath(a, b);
  });
  bm25Hits.sort((a, b) => compareBm25(a, b, false));
  return [...rrfHits, ...bm25Hits];
}
