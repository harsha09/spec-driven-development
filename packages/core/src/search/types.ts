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
  /**
   * Keyword hits store raw SQLite bm25() (more negative is better).
   * Hybrid hits store the RRF score (higher is better).
   */
  score: number;
  form: "full" | "signature" | "summary";
  text: string;
  signature: string;
  body: string;
  language: string;
}

export interface SearchResult {
  provider: string;
  warning?: string;
  query: string;
  scope: SearchScope;
  budget: number;
  usedTokens: number;
  hits: SearchHit[];
  text: string;
}

export interface IndexStats {
  provider: string;
  files: number;
  chunks: number;
  lastIndexFilesConsidered: number;
  lastIndexFilesReindexed: number;
  lastIndexChunksReindexed: number;
  lastIndexChunksEmbedded: number;
  indexedCommit: string | null;
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
  /** Not printed. Keyword rows are bm25. Fused rows are rrf. */
  rankedBy?: "bm25" | "rrf";
  /** Pack-time extract. Absent for code and for the active change. */
  summary?: string;
}
