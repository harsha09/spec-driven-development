export const SEARCH_SCHEMA_SQL = `
PRAGMA journal_mode = DELETE;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('code', 'specs', 'memory')),
  language TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  symbol TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  signature TEXT NOT NULL,
  body TEXT NOT NULL,
  chunk_hash TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  symbol,
  body,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS chunks_fts_map (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  fts_rowid INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vec_meta (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  chunk_hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('code', 'specs', 'memory'))
);

CREATE TABLE IF NOT EXISTS spec_summaries (
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  symbol TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  summary TEXT NOT NULL,
  PRIMARY KEY (path, content_hash, symbol, start_line)
);

CREATE TABLE IF NOT EXISTS result_cache (
  cache_key TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  channel TEXT NOT NULL,
  scope TEXT NOT NULL,
  k INTEGER NOT NULL,
  budget INTEGER NOT NULL,
  embeddings INTEGER NOT NULL,
  active_change TEXT NOT NULL,
  filter TEXT NOT NULL,
  index_version TEXT NOT NULL,
  mode TEXT NOT NULL,
  hybrid_scopes TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS result_cache_files (
  cache_key TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (cache_key, path)
);
`;

export const ADD_CHUNK_HASH_SQL =
  "ALTER TABLE chunks ADD COLUMN chunk_hash TEXT NOT NULL DEFAULT ''";
