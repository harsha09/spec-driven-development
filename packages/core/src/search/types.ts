export type SearchScope = "code" | "specs" | "memory";

export interface SearchQuery {
  scope: SearchScope;
  k: number;
  budget: number;
  /** Header text counted against the budget. Empty for context and handoff. */
  preamble?: string;
}

export interface SearchHit {
  scope: SearchScope;
  path: string;
  startLine: number;
  endLine: number;
  symbol: string;
  /** Raw SQLite bm25(). More negative is a better match. */
  score: number;
  form: "full" | "signature";
  text: string;
  signature: string;
  body: string;
  language: string;
}

export interface SearchResult {
  provider: "builtin";
  warning?: string;
  query: string;
  scope: SearchScope;
  budget: number;
  usedTokens: number;
  hits: SearchHit[];
  text: string;
}

export interface IndexStats {
  provider: "builtin";
  files: number;
  chunks: number;
  lastIndexFilesConsidered: number;
  lastIndexFilesReindexed: number;
}

export interface SearchProvider {
  readonly id: string;
  index(changed?: readonly string[]): Promise<IndexStats>;
  search(query: string, options: SearchQuery): Promise<SearchResult>;
  stats(): Promise<IndexStats>;
}

export interface RawHit {
  scope: SearchScope;
  path: string;
  startLine: number;
  endLine: number;
  symbol: string;
  score: number;
  signature: string;
  body: string;
  language: string;
}
