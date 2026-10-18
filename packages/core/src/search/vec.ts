import type Database from "better-sqlite3";
import type { SearchScope } from "./types.js";

export type VectorBlob = Buffer | Float32Array;

const TABLES: Record<SearchScope, string> = {
  code: "chunk_vec_code",
  specs: "chunk_vec_specs",
  memory: "chunk_vec_memory",
};

const CREATE_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec_code USING vec0(
  embedding float[384] distance_metric=cosine
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec_specs USING vec0(
  embedding float[384] distance_metric=cosine
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec_memory USING vec0(
  embedding float[384] distance_metric=cosine
);
`;

const state = new WeakMap<Database.Database, "ready" | "failed">();

export function vecTable(scope: SearchScope): string {
  return TABLES[scope];
}

export function vecTablesPresent(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS n FROM sqlite_master
       WHERE name IN ('chunk_vec_code', 'chunk_vec_specs', 'chunk_vec_memory')
       LIMIT 1`,
    )
    .get() as { n: number } | undefined;
  return Boolean(row);
}

function pickLoad(mod: unknown): ((db: Database.Database) => void) | null {
  if (!mod || typeof mod !== "object") return null;
  const record = mod as { load?: unknown; default?: { load?: unknown } };
  if (typeof record.load === "function") return record.load as (db: Database.Database) => void;
  if (record.default && typeof record.default.load === "function") {
    return record.default.load as (db: Database.Database) => void;
  }
  return null;
}

/** Local extension load. Does not import fastembed. */
export async function ensureVecLoaded(db: Database.Database): Promise<boolean> {
  const known = state.get(db);
  if (known === "ready") return true;
  if (known === "failed") return false;
  try {
    const mod = await import("sqlite-vec");
    const load = pickLoad(mod);
    if (!load) {
      state.set(db, "failed");
      return false;
    }
    load(db);
    state.set(db, "ready");
    return true;
  } catch {
    state.set(db, "failed");
    return false;
  }
}

export function vecReady(db: Database.Database): boolean {
  return state.get(db) === "ready";
}

export function createVecTables(db: Database.Database): void {
  db.exec(CREATE_SQL);
}

export function dropVecTables(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS chunk_vec_code;
    DROP TABLE IF EXISTS chunk_vec_specs;
    DROP TABLE IF EXISTS chunk_vec_memory;
  `);
}

export function insertVector(
  db: Database.Database,
  scope: SearchScope,
  id: number,
  value: VectorBlob,
  hash: string,
): void {
  const table = TABLES[scope];
  const rowid = BigInt(id);
  db.prepare(`DELETE FROM ${table} WHERE rowid = ?`).run(rowid);
  db.prepare(`INSERT INTO ${table} (rowid, embedding) VALUES (?, ?)`).run(rowid, value);
  db.prepare(
    `INSERT INTO vec_meta (chunk_id, chunk_hash, scope) VALUES (?, ?, ?)
     ON CONFLICT(chunk_id) DO UPDATE SET chunk_hash = excluded.chunk_hash, scope = excluded.scope`,
  ).run(id, hash, scope);
}

function asBlob(value: unknown): VectorBlob | null {
  if (value instanceof Float32Array) return value;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return null;
}

export function readVectorBlob(db: Database.Database, hash: string): VectorBlob | null {
  if (!vecReady(db)) return null;
  const row = db
    .prepare("SELECT chunk_id, scope FROM vec_meta WHERE chunk_hash = ? LIMIT 1")
    .get(hash) as { chunk_id: number; scope: SearchScope } | undefined;
  if (!row || !TABLES[row.scope]) return null;
  try {
    const stored = db
      .prepare(`SELECT embedding FROM ${TABLES[row.scope]} WHERE rowid = ?`)
      .get(BigInt(row.chunk_id)) as { embedding: unknown } | undefined;
    return stored ? asBlob(stored.embedding) : null;
  } catch {
    return null;
  }
}

export interface VecHitRow {
  path: string;
  scope: SearchScope;
  symbol: string;
  start_line: number;
  end_line: number;
  signature: string;
  body: string;
  language: string;
  distance: number;
}

export function queryVectors(
  db: Database.Database,
  scope: SearchScope,
  queryVec: Float32Array,
  k: number,
): VecHitRow[] {
  const table = TABLES[scope];
  return db
    .prepare(
      `SELECT c.path, c.scope, c.symbol, c.start_line, c.end_line, c.signature, c.body,
              f.language AS language, v.distance AS distance
       FROM ${table} AS v
       JOIN chunks AS c ON c.id = v.rowid
       JOIN vec_meta AS m ON m.chunk_id = c.id AND m.chunk_hash = c.chunk_hash
       JOIN files AS f ON f.path = c.path
       WHERE v.embedding MATCH ?
         AND k = ?
         AND c.scope = ?
       ORDER BY v.distance ASC, c.path ASC, c.start_line ASC, c.symbol ASC`,
    )
    .all(queryVec, k, scope) as VecHitRow[];
}
