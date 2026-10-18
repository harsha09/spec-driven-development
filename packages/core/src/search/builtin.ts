import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import Database from "better-sqlite3";
import { isAbsolute, join } from "pathe";
import { ensureDir, pathExists } from "../fs.js";
import { getHeadSha } from "../git-head.js";
import { changesPathRel, indexDbPath, memoryPathRel, sddRoot } from "../paths.js";
import type { Config } from "../schemas.js";
import { chunkCode, languageForExt } from "./chunk-code.js";
import { chunkMarkdown } from "./chunk-markdown.js";
import { loadSearchConfig } from "./config.js";
import {
  EMBEDDINGS_UNAVAILABLE,
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  type EmbedFailure,
  type Embedder,
  type SearchRuntime,
  embedSearchQuery,
  resolveEmbedder,
} from "./embed.js";
import { isPrunedDir, loadExcluder } from "./exclude.js";
import { packHits, searchPreamble } from "./pack.js";
import { fuseHits } from "./rrf.js";
import { ADD_CHUNK_HASH_SQL, SEARCH_SCHEMA_SQL } from "./schema.js";
import { ftsTokens } from "./tokenize.js";
import type {
  IndexStats,
  RawHit,
  SearchProvider,
  SearchQuery,
  SearchResult,
  SearchScope,
} from "./types.js";
import {
  type VectorBlob,
  createVecTables,
  dropVecTables,
  ensureVecLoaded,
  insertVector,
  queryVectors,
  readVectorBlob,
  vecReady,
  vecTable,
  vecTablesPresent,
} from "./vec.js";

const CODE_EXT = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
]);

type SyncAction = "unchanged" | "rewritten" | "deleted";

interface StoredChunk {
  symbol: string;
  startLine: number;
  endLine: number;
  signature: string;
  body: string;
  language: string;
}

interface InsertedChunk {
  id: number;
  hash: string;
  body: string;
  scope: SearchScope;
}

interface Tally {
  chunks: number;
  embedded: number;
  storedVector: boolean;
}

interface RankSession {
  embeddings: boolean;
  queryVec: Float32Array | null;
  failure: EmbedFailure;
}

const EMPTY_STATS: IndexStats = {
  provider: "builtin",
  files: 0,
  chunks: 0,
  lastIndexFilesConsidered: 0,
  lastIndexFilesReindexed: 0,
  lastIndexChunksReindexed: 0,
  lastIndexChunksEmbedded: 0,
  indexedCommit: null,
};

function extensionOf(rel: string): string {
  const slash = rel.lastIndexOf("/");
  const base = slash === -1 ? rel : rel.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

function under(rel: string, root: string): boolean {
  const prefix = stripTrailingSlashes(root);
  if (!prefix) return false;
  return rel === prefix || rel.startsWith(`${prefix}/`);
}

export function scopeForPath(rel: string, config: Config): SearchScope | null {
  const ext = extensionOf(rel);
  if (CODE_EXT.has(ext)) return "code";
  if (ext !== ".md") return null;
  if (under(rel, memoryPathRel(config))) return "memory";
  const archive = stripTrailingSlashes(config.archive_path) || "archive";
  if (under(rel, changesPathRel(config)) || under(rel, archive) || under(rel, "docs")) {
    return "specs";
  }
  return null;
}

export function assertRepoRelative(input: string): string {
  if (isAbsolute(input)) throw new Error("Index path must be project-relative.");
  let rel = input.replaceAll("\\", "/");
  while (rel.startsWith("./")) rel = rel.slice(2);
  if (!rel || rel.split("/").includes("..")) {
    throw new Error("Index path must be project-relative.");
  }
  return rel;
}

function chunkHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function migrateChunkHash(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(chunks)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "chunk_hash")) {
    db.exec(ADD_CHUNK_HASH_SQL);
  }
  const rows = db.prepare("SELECT id, body FROM chunks WHERE chunk_hash = ''").all() as {
    id: number;
    body: string;
  }[];
  const update = db.prepare("UPDATE chunks SET chunk_hash = ? WHERE id = ?");
  for (const row of rows) update.run(chunkHash(row.body), row.id);
}

function openDb(projectRoot: string): Database.Database {
  const db = new Database(indexDbPath(projectRoot));
  db.exec(SEARCH_SCHEMA_SQL);
  migrateChunkHash(db);
  return db;
}

async function ensureDb(projectRoot: string): Promise<Database.Database> {
  await ensureDir(sddRoot(projectRoot));
  return openDb(projectRoot);
}

function deletePath(db: Database.Database, rel: string): boolean {
  const had = db.prepare("SELECT 1 AS n FROM files WHERE path = ?").get(rel) as
    | { n: number }
    | undefined;
  if (vecReady(db)) {
    const ids = db.prepare("SELECT id, scope FROM chunks WHERE path = ?").all(rel) as {
      id: number;
      scope: SearchScope;
    }[];
    for (const row of ids) {
      try {
        db.prepare(`DELETE FROM ${vecTable(row.scope)} WHERE rowid = ?`).run(BigInt(row.id));
      } catch {
        // A missing extension row must not keep the keyword row.
      }
    }
  }
  db.prepare("DELETE FROM vec_meta WHERE chunk_id IN (SELECT id FROM chunks WHERE path = ?)").run(
    rel,
  );
  db.prepare(
    `DELETE FROM chunks_fts WHERE rowid IN (
      SELECT m.fts_rowid FROM chunks_fts_map AS m
      JOIN chunks AS c ON c.id = m.chunk_id
      WHERE c.path = ?
    )`,
  ).run(rel);
  db.prepare("DELETE FROM chunks WHERE path = ?").run(rel);
  db.prepare("DELETE FROM files WHERE path = ?").run(rel);
  return Boolean(had);
}

function writeChunks(
  db: Database.Database,
  rel: string,
  hash: string,
  scope: SearchScope,
  language: string,
  chunks: StoredChunk[],
): InsertedChunk[] {
  deletePath(db, rel);
  if (!chunks.length) return [];
  db.prepare("INSERT INTO files (path, content_hash, scope, language) VALUES (?, ?, ?, ?)").run(
    rel,
    hash,
    scope,
    language,
  );
  const insertChunk = db.prepare(
    `INSERT INTO chunks (path, scope, symbol, start_line, end_line, signature, body, chunk_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare("INSERT INTO chunks_fts (symbol, body) VALUES (?, ?)");
  const insertMap = db.prepare("INSERT INTO chunks_fts_map (chunk_id, fts_rowid) VALUES (?, ?)");
  const inserted: InsertedChunk[] = [];
  for (const chunk of chunks) {
    const hashOfBody = chunkHash(chunk.body);
    const info = insertChunk.run(
      rel,
      scope,
      chunk.symbol,
      chunk.startLine,
      chunk.endLine,
      chunk.signature,
      chunk.body,
      hashOfBody,
    );
    const fts = insertFts.run(chunk.symbol, chunk.body);
    const id = Number(info.lastInsertRowid);
    insertMap.run(id, fts.lastInsertRowid);
    inserted.push({ id, hash: hashOfBody, body: chunk.body, scope });
  }
  return inserted;
}

function mapHit(row: {
  path: string;
  scope: SearchScope;
  symbol: string;
  start_line: number;
  end_line: number;
  signature: string;
  body: string;
  language: string;
  score: number;
}): RawHit {
  return {
    scope: row.scope,
    path: row.path,
    startLine: row.start_line,
    endLine: row.end_line,
    symbol: row.symbol,
    score: row.score,
    signature: row.signature,
    body: row.body,
    language: row.language,
    rankedBy: "bm25",
  };
}

const HIT_SQL = `c.path, c.scope, c.symbol, c.start_line, c.end_line, c.signature, c.body,
       f.language AS language`;

function queryRanked(
  db: Database.Database,
  query: string,
  scope: SearchScope,
  k: number,
): RawHit[] {
  const tokens = ftsTokens(query);
  if (!tokens.length || k < 1) return [];
  const rows = db
    .prepare(
      `SELECT ${HIT_SQL}, bm25(chunks_fts) AS score
       FROM chunks_fts
       JOIN chunks_fts_map AS m ON m.fts_rowid = chunks_fts.rowid
       JOIN chunks AS c ON c.id = m.chunk_id
       JOIN files AS f ON f.path = c.path
       WHERE chunks_fts MATCH ? AND c.scope = ?
       ORDER BY score ASC, c.path ASC, c.start_line ASC, c.symbol ASC
       LIMIT ?`,
    )
    .all(tokens.join(" OR "), scope, k) as Parameters<typeof mapHit>[0][];
  return rows.map(mapHit);
}

function queryScope(db: Database.Database, scope: SearchScope): RawHit[] {
  const rows = db
    .prepare(
      `SELECT ${HIT_SQL}, 0 AS score
       FROM chunks AS c
       JOIN files AS f ON f.path = c.path
       WHERE c.scope = ?
       ORDER BY c.path ASC, c.start_line ASC, c.symbol ASC`,
    )
    .all(scope) as Parameters<typeof mapHit>[0][];
  return rows.map(mapHit);
}

async function walkFiles(projectRoot: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (isPrunedDir(child)) continue;
        await walk(join(dir, entry.name), child);
      } else if (entry.isFile()) {
        out.push(child);
      }
    }
  }
  await walk(projectRoot, "");
  return out;
}

async function chunksFor(
  bytes: Buffer,
  rel: string,
  scope: SearchScope,
): Promise<StoredChunk[] | null> {
  const text = bytes.toString("utf8");
  if (scope !== "code") {
    return chunkMarkdown(text).map((chunk) => ({ ...chunk, language: "md" }));
  }
  const ext = extensionOf(rel);
  const language = languageForExt(ext) ?? "js";
  const parsed = await chunkCode(text, ext);
  if (!parsed) return null;
  return parsed.map((chunk) => ({ ...chunk, language: chunk.language || language }));
}

function metaNumber(db: Database.Database, key: string): number {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  const n = Number(row?.value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function metaString(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function writeMetaValue(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function readStats(db: Database.Database): IndexStats {
  const files = db.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number };
  const chunks = db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number };
  return {
    provider: "builtin",
    files: files.n,
    chunks: chunks.n,
    lastIndexFilesConsidered: metaNumber(db, "last_files_considered"),
    lastIndexFilesReindexed: metaNumber(db, "last_files_reindexed"),
    lastIndexChunksReindexed: metaNumber(db, "last_chunks_reindexed"),
    lastIndexChunksEmbedded: metaNumber(db, "last_chunks_embedded"),
    indexedCommit: metaString(db, "indexed_commit"),
  };
}

function writeCounts(
  db: Database.Database,
  considered: number,
  reindexed: number,
  chunks: number,
  embedded: number,
): void {
  writeMetaValue(db, "last_files_considered", String(considered));
  writeMetaValue(db, "last_files_reindexed", String(reindexed));
  writeMetaValue(db, "last_chunks_reindexed", String(chunks));
  writeMetaValue(db, "last_chunks_embedded", String(embedded));
}

function isCommitSha(value: string | null): value is string {
  if (!value || (value.length !== 40 && value.length !== 64)) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const hex =
      (code >= 48 && code <= 57) || (code >= 97 && code <= 102) || (code >= 65 && code <= 70);
    if (!hex) return false;
  }
  return true;
}

async function safeHead(projectRoot: string): Promise<string | null> {
  try {
    return await getHeadSha(projectRoot);
  } catch {
    return null;
  }
}

function gitOutput(cwd: string, args: string[]): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Buffer | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      finish(null);
      return;
    }
    const parts: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => {
      parts.push(chunk);
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 ? Buffer.concat(parts) : null));
  });
}

function splitNul(buf: Buffer): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0) {
      if (i > start) parts.push(buf.subarray(start, i).toString("utf8"));
      start = i + 1;
    }
  }
  return parts;
}

function normalizeGitPath(input: string): string | null {
  let rel = input.replaceAll("\\", "/");
  while (rel.startsWith("./")) rel = rel.slice(2);
  if (!rel || isAbsolute(rel)) return null;
  return rel;
}

function parseNameStatus(buf: Buffer): { candidates: string[]; deletions: string[] } {
  const parts = splitNul(buf);
  const candidates: string[] = [];
  const deletions: string[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = parts[i] ?? "";
    const path = normalizeGitPath(parts[i + 1] ?? "");
    if (!status || !path) continue;
    if (status.charCodeAt(0) === 68) deletions.push(path);
    else candidates.push(path);
  }
  return { candidates, deletions };
}

async function readGitDelta(
  projectRoot: string,
  cursor: string,
): Promise<{ candidates: string[]; deletions: string[] } | null> {
  const diff = await gitOutput(projectRoot, [
    "diff",
    "--name-status",
    "-z",
    "--no-renames",
    cursor,
  ]);
  const untracked = await gitOutput(projectRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  if (!diff || !untracked) return null;
  const parsed = parseNameStatus(diff);
  for (const path of splitNul(untracked)) {
    const rel = normalizeGitPath(path);
    if (rel) parsed.candidates.push(rel);
  }
  return parsed;
}

async function prepareVectors(db: Database.Database, create: boolean): Promise<boolean> {
  const present = vecTablesPresent(db);
  if (!present && !create) return false;
  const loaded = await ensureVecLoaded(db);
  if (!loaded) return false;
  if (create) createVecTables(db);
  const model = metaString(db, "embedding_model");
  if (create && model && model !== EMBEDDING_MODEL) {
    dropVecTables(db);
    db.prepare("DELETE FROM vec_meta").run();
    db.prepare("DELETE FROM meta WHERE key = ?").run("embedding_model");
    createVecTables(db);
  }
  return true;
}

interface PendingBody {
  hash: string;
  body: string;
  ids: number[];
  scope: SearchScope;
}

async function embedBodies(
  db: Database.Database,
  embedder: Embedder,
  pending: PendingBody[],
  tally: Tally,
): Promise<boolean> {
  for (let i = 0; i < pending.length; i += 16) {
    const batch = pending.slice(i, i + 16);
    tally.embedded += batch.length;
    let vectors: Float32Array[];
    try {
      vectors = await embedder.embedPassages(batch.map((item) => item.body));
    } catch {
      return false;
    }
    if (
      vectors.length !== batch.length ||
      vectors.some((vector) => vector.length !== EMBEDDING_DIM)
    ) {
      return false;
    }
    const tx = db.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const vector = vectors[j];
        if (!item || !vector) continue;
        for (const id of item.ids) insertVector(db, item.scope, id, vector, item.hash);
      }
    });
    tx();
    tally.storedVector = true;
  }
  return true;
}

function queueBody(pending: PendingBody[], row: InsertedChunk): void {
  const found = pending.find((item) => item.hash === row.hash);
  if (found) found.ids.push(row.id);
  else pending.push({ hash: row.hash, body: row.body, ids: [row.id], scope: row.scope });
}

async function embedInserted(
  db: Database.Database,
  embedder: Embedder,
  inserted: InsertedChunk[],
  copies: Map<string, VectorBlob>,
  tally: Tally,
): Promise<void> {
  const pending: PendingBody[] = [];
  const tx = db.transaction(() => {
    for (const row of inserted) {
      const blob = copies.get(row.hash);
      if (blob) {
        insertVector(db, row.scope, row.id, blob, row.hash);
        tally.storedVector = true;
        continue;
      }
      queueBody(pending, row);
    }
  });
  tx();
  await embedBodies(db, embedder, pending, tally);
}

async function backfill(db: Database.Database, embedder: Embedder, tally: Tally): Promise<void> {
  const rows = db
    .prepare(
      `SELECT c.id AS id, c.path AS path, c.body AS body, c.chunk_hash AS hash, c.scope AS scope
       FROM chunks AS c
       WHERE NOT EXISTS (
         SELECT 1 FROM vec_meta AS m
         WHERE m.chunk_id = c.id AND m.chunk_hash = c.chunk_hash
       )
       ORDER BY c.path ASC, c.start_line ASC, c.symbol ASC`,
    )
    .all() as { id: number; path: string; body: string; hash: string; scope: SearchScope }[];
  let current = "";
  let group: PendingBody[] = [];
  const flush = async () => {
    if (!group.length) return;
    const pending = group;
    group = [];
    await embedBodies(db, embedder, pending, tally);
  };
  for (const row of rows) {
    if (row.path !== current) {
      await flush();
      current = row.path;
    }
    const blob = readVectorBlob(db, row.hash);
    if (blob) {
      insertVector(db, row.scope, row.id, blob, row.hash);
      tally.storedVector = true;
      continue;
    }
    queueBody(group, row);
  }
  await flush();
}

type ScopeVectorState = "empty" | "ready" | "partial";

function scopeVectorState(db: Database.Database, scope: SearchScope): ScopeVectorState {
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM chunks WHERE scope = ?) AS chunks,
         (SELECT COUNT(*) FROM chunks AS c
            JOIN vec_meta AS m ON m.chunk_id = c.id AND m.chunk_hash = c.chunk_hash
            WHERE c.scope = ?) AS ready`,
    )
    .get(scope, scope) as { chunks: number; ready: number };
  if (counts.chunks === 0) return "empty";
  const model = metaString(db, "embedding_model");
  const modelOk = model === null || model === EMBEDDING_MODEL;
  if (counts.ready === counts.chunks && modelOk) return "ready";
  return "partial";
}

export function createBuiltinProvider(
  projectRoot: string,
  config: Config,
  runtime?: SearchRuntime,
): SearchProvider {
  const syncOne = async (
    db: Database.Database,
    rel: string,
    excluded: (path: string) => boolean,
    embedder: Embedder | null,
    canVec: boolean,
    tally: Tally,
  ): Promise<SyncAction> => {
    const abs = join(projectRoot, rel);
    const previous = db.prepare("SELECT content_hash FROM files WHERE path = ?").get(rel) as
      | { content_hash: string }
      | undefined;
    let bytes: Buffer | null = null;
    if (await pathExists(abs)) {
      try {
        bytes = await readFile(abs);
      } catch {
        bytes = null;
      }
    }
    const drop = () => {
      if (!previous) return "unchanged" as const;
      deletePath(db, rel);
      return "deleted" as const;
    };
    if (!bytes || excluded(rel)) return drop();
    const scope = scopeForPath(rel, config);
    if (!scope) return drop();
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (previous?.content_hash === hash) return "unchanged";
    const chunks = await chunksFor(bytes, rel, scope);
    if (!chunks) return drop();
    if (!chunks.length && !previous) return "unchanged";
    const language = chunks[0]?.language ?? (scope === "code" ? "js" : "md");
    const copies = new Map<string, VectorBlob>();
    if (canVec && embedder) {
      const hashes = new Set(chunks.map((chunk) => chunkHash(chunk.body)));
      for (const bodyHash of hashes) {
        const blob = readVectorBlob(db, bodyHash);
        if (blob) copies.set(bodyHash, blob);
      }
    }
    const inserted = db.transaction(() => writeChunks(db, rel, hash, scope, language, chunks))();
    tally.chunks += inserted.length;
    if (canVec && embedder && inserted.length) {
      await embedInserted(db, embedder, inserted, copies, tally);
    }
    return "rewritten";
  };

  return {
    id: "builtin",
    async index(changed) {
      const rels = changed?.map((entry) => assertRepoRelative(entry));
      const search = await loadSearchConfig(projectRoot);
      const embedder = await resolveEmbedder(projectRoot, search.embeddings, runtime);
      const db = await ensureDb(projectRoot);
      try {
        const filter = await loadExcluder(projectRoot, search.exclude);
        const canVec = await prepareVectors(db, search.embeddings && embedder !== null);
        const tally: Tally = { chunks: 0, embedded: 0, storedVector: false };
        let considered = 0;
        let reindexed = 0;
        const note = (action: SyncAction) => {
          considered += 1;
          if (action !== "unchanged") reindexed += 1;
        };
        const runSync = (rel: string) => syncOne(db, rel, filter, embedder, canVec, tally);
        if (rels) {
          for (const rel of rels) note(await runSync(rel));
        } else {
          const head = await safeHead(projectRoot);
          const cursor = metaString(db, "indexed_commit");
          const delta =
            head && isCommitSha(cursor)
              ? await readGitDelta(projectRoot, cursor.toLowerCase())
              : null;
          if (delta) {
            const deletions = new Set(delta.deletions);
            const seen = new Set<string>();
            for (const rel of delta.candidates) {
              if (deletions.has(rel) || seen.has(rel)) continue;
              seen.add(rel);
              note(await runSync(rel));
            }
            for (const rel of deletions) {
              if (deletePath(db, rel)) reindexed += 1;
            }
            const stored = db.prepare("SELECT path FROM files").all() as { path: string }[];
            for (const row of stored) {
              const exists = await pathExists(join(projectRoot, row.path));
              if (exists && !filter(row.path) && scopeForPath(row.path, config)) continue;
              deletePath(db, row.path);
              considered += 1;
              reindexed += 1;
            }
          } else {
            const desired = new Set<string>();
            for (const rel of await walkFiles(projectRoot)) {
              if (filter(rel) || !scopeForPath(rel, config)) continue;
              desired.add(rel);
              note(await runSync(rel));
            }
            const stored = db.prepare("SELECT path FROM files").all() as { path: string }[];
            const tx = db.transaction(() => {
              for (const row of stored) {
                if (desired.has(row.path)) continue;
                deletePath(db, row.path);
                reindexed += 1;
              }
            });
            tx();
          }
          if (search.embeddings && embedder && canVec) await backfill(db, embedder, tally);
          if (head) writeMetaValue(db, "indexed_commit", head);
        }
        writeCounts(db, considered, reindexed, tally.chunks, tally.embedded);
        if (tally.storedVector) writeMetaValue(db, "embedding_model", EMBEDDING_MODEL);
        return readStats(db);
      } finally {
        db.close();
      }
    },
    async search(query, options) {
      return searchProject(projectRoot, query, options, runtime);
    },
    async stats() {
      if (!(await pathExists(indexDbPath(projectRoot)))) return { ...EMPTY_STATS };
      const db = openDb(projectRoot);
      try {
        return readStats(db);
      } finally {
        db.close();
      }
    },
  };
}

export async function keywordHits(
  projectRoot: string,
  query: string,
  scope: SearchScope,
  k: number,
): Promise<RawHit[]> {
  if (!(await pathExists(indexDbPath(projectRoot)))) return [];
  const db = openDb(projectRoot);
  try {
    return queryRanked(db, query, scope, k);
  } finally {
    db.close();
  }
}

export async function listScopeHits(projectRoot: string, scope: SearchScope): Promise<RawHit[]> {
  if (!(await pathExists(indexDbPath(projectRoot)))) return [];
  const db = openDb(projectRoot);
  try {
    return queryScope(db, scope);
  } finally {
    db.close();
  }
}

export async function rankScope(
  projectRoot: string,
  query: string,
  scope: SearchScope,
  k: number,
  session: RankSession,
): Promise<{ hits: RawHit[]; warning: boolean; hybrid: boolean }> {
  const keyword = async () => keywordHits(projectRoot, query, scope, k);
  if (!session.embeddings) return { hits: await keyword(), warning: false, hybrid: false };
  if (!(await pathExists(indexDbPath(projectRoot)))) {
    return { hits: [], warning: session.failure === "query", hybrid: false };
  }
  const db = openDb(projectRoot);
  try {
    const state = scopeVectorState(db, scope);
    const warn =
      session.failure === "query" ||
      (state !== "empty" &&
        (session.failure === "load" || state === "partial" || !session.queryVec));
    if (session.failure !== "none" || state !== "ready" || !session.queryVec) {
      return { hits: queryRanked(db, query, scope, k), warning: warn, hybrid: false };
    }
    const loaded = await ensureVecLoaded(db);
    if (!loaded) return { hits: queryRanked(db, query, scope, k), warning: true, hybrid: false };
    try {
      const keywordRows = queryRanked(db, query, scope, k);
      const vectorRows = queryVectors(db, scope, session.queryVec, k).map((row) =>
        mapHit({ ...row, score: row.distance }),
      );
      return { hits: fuseHits(keywordRows, vectorRows), warning: false, hybrid: true };
    } catch {
      return { hits: queryRanked(db, query, scope, k), warning: true, hybrid: false };
    }
  } finally {
    db.close();
  }
}

export async function searchProject(
  projectRoot: string,
  query: string,
  options: SearchQuery,
  runtime?: SearchRuntime,
): Promise<SearchResult> {
  const search = await loadSearchConfig(projectRoot);
  const embedder = await resolveEmbedder(projectRoot, search.embeddings, runtime);
  const embedded = await embedSearchQuery(embedder, search.embeddings, query);
  const ranked = await rankScope(projectRoot, query, options.scope, options.k, {
    embeddings: search.embeddings,
    queryVec: embedded.queryVec,
    failure: embedded.failure,
  });
  const preamble =
    options.preamble ?? searchPreamble(query, options.scope, options.budget, ranked.hybrid);
  const packed = packHits({ preamble, hits: ranked.hits, budget: options.budget });
  return {
    provider: "builtin",
    warning: ranked.warning ? EMBEDDINGS_UNAVAILABLE : undefined,
    query,
    scope: options.scope,
    budget: options.budget,
    usedTokens: packed.usedTokens,
    hits: packed.hits,
    text: packed.text,
  };
}
