export { countTokens, ftsTokens } from "./tokenize.js";
export { loadSearchConfig, budgetForStage, SearchConfigError } from "./config.js";
export type { SearchConfig } from "./config.js";
export { packHits, renderBlock, searchPreamble } from "./pack.js";
export { loadExcluder, isHardDenied, isPrunedDir } from "./exclude.js";
export { chunkMarkdown } from "./chunk-markdown.js";
export { chunkCode } from "./chunk-code.js";
export {
  createBuiltinProvider,
  keywordHits,
  listScopeHits,
  rankScope,
  scopeForPath,
} from "./builtin.js";
export {
  EMBEDDING_MODEL,
  EMBEDDINGS_UNAVAILABLE,
  createFastembedEmbedder,
  embedSearchQuery,
  fastembedImportCount,
  resolveEmbedder,
} from "./embed.js";
export type { Embedder, FastembedHooks, SearchRuntime } from "./embed.js";
export { RRF_K, fuseByRank, fuseHits, mergeRankedHits, rrf } from "./rrf.js";
export {
  registerSearchProvider,
  clearRegisteredSearchProviders,
  resolveSearchProvider,
  buildRetrievedInner,
  executeSearch,
  fallbackWarning,
} from "./registry.js";
export type {
  SearchScope,
  SearchQuery,
  SearchHit,
  SearchResult,
  IndexStats,
  SearchProvider,
  RawHit,
} from "./types.js";
