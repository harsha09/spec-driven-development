import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import Database from "better-sqlite3";
import { isAbsolute, join } from "pathe";
import { ensureDir, pathExists } from "../fs.js";
import { changesPathRel, indexDbPath, memoryPathRel, sddRoot } from "../paths.js";
import type { Config } from "../schemas.js";
import { chunkCode, languageForExt } from "./chunk-code.js";
import { chunkMarkdown } from "./chunk-markdown.js";
import { loadSearchConfig } from "./config.js";
import { isPrunedDir, loadExcluder } from "./exclude.js";
import { packHits, searchPreamble } from "./pack.js";
import { SEARCH_SCHEMA_SQL } from "./schema.js";
import { ftsTokens } from "./tokenize.js";
import type {
  IndexStats,
  RawHit,
  SearchProvider,
  SearchQuery,
  SearchResult,
  SearchScope,
} from "./types.js";

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

function openDb(projectRoot: string): Database.Database {
  const db = new Database(indexDbPath(projectRoot));
  db.exec(SEARCH_SCHEMA_SQL);
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
): void {
  deletePath(db, rel);
  if (!chunks.length) return;
  db.prepare("INSERT INTO files (path, content_hash, scope, language) VALUES (?, ?, ?, ?)").run(
    rel,
    hash,
    scope,
    language,
  );
  const insertChunk = db.prepare(
    `INSERT INTO chunks (path, scope, symbol, start_line, end_line, signature, body)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare("INSERT INTO chunks_fts (symbol, body) VALUES (?, ?)");
  const insertMap = db.prepare("INSERT INTO chunks_fts_map (chunk_id, fts_rowid) VALUES (?, ?)");
  for (const chunk of chunks) {
    const info = insertChunk.run(
      rel,
      scope,
      chunk.symbol,
      chunk.startLine,
      chunk.endLine,
      chunk.signature,
      chunk.body,
    );
    const fts = insertFts.run(chunk.symbol, chunk.body);
    insertMap.run(info.lastInsertRowid, fts.lastInsertRowid);
  }
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

function readStats(db: Database.Database): IndexStats {
  const files = db.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number };
  const chunks = db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number };
  const meta = (key: string) => {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    const n = Number(row?.value ?? "0");
    return Number.isFinite(n) ? n : 0;
  };
  return {
    provider: "builtin",
    files: files.n,
    chunks: chunks.n,
    lastIndexFilesConsidered: meta("last_files_considered"),
    lastIndexFilesReindexed: meta("last_files_reindexed"),
  };
}

function writeMeta(db: Database.Database, considered: number, reindexed: number): void {
  const stmt = db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  stmt.run("last_files_considered", String(considered));
  stmt.run("last_files_reindexed", String(reindexed));
}

export function createBuiltinProvider(projectRoot: string, config: Config): SearchProvider {
  const syncOne = async (
    db: Database.Database,
    rel: string,
    excluded: (path: string) => boolean,
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
    const tx = db.transaction(() => {
      writeChunks(db, rel, hash, scope, language, chunks);
    });
    tx();
    return "rewritten";
  };

  return {
    id: "builtin",
    async index(changed) {
      const rels = changed?.map((entry) => assertRepoRelative(entry));
      const db = await ensureDb(projectRoot);
      try {
        const searchExclude = await loadSearchConfig(projectRoot);
        const filter = await loadExcluder(projectRoot, searchExclude.exclude);
        let considered = 0;
        let reindexed = 0;
        const note = (action: SyncAction) => {
          considered += 1;
          if (action !== "unchanged") reindexed += 1;
        };
        if (rels) {
          for (const rel of rels) note(await syncOne(db, rel, filter));
        } else {
          const desired = new Set<string>();
          for (const rel of await walkFiles(projectRoot)) {
            if (filter(rel) || !scopeForPath(rel, config)) continue;
            desired.add(rel);
            note(await syncOne(db, rel, filter));
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
        writeMeta(db, considered, reindexed);
        return readStats(db);
      } finally {
        db.close();
      }
    },
    async search(query, options) {
      return searchProject(projectRoot, query, options);
    },
    async stats() {
      if (!(await pathExists(indexDbPath(projectRoot)))) {
        return {
          provider: "builtin",
          files: 0,
          chunks: 0,
          lastIndexFilesConsidered: 0,
          lastIndexFilesReindexed: 0,
        };
      }
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

export async function searchProject(
  projectRoot: string,
  query: string,
  options: SearchQuery,
): Promise<SearchResult> {
  const preamble = options.preamble ?? searchPreamble(query, options.scope, options.budget);
  const hits = await keywordHits(projectRoot, query, options.scope, options.k);
  const packed = packHits({ preamble, hits, budget: options.budget });
  return {
    provider: "builtin",
    query,
    scope: options.scope,
    budget: options.budget,
    usedTokens: packed.usedTokens,
    hits: packed.hits,
    text: packed.text,
  };
}
