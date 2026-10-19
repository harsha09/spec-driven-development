import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Database from "better-sqlite3";
import { isAbsolute } from "pathe";
import { activePointerPath, displayChangePath, indexDbPath } from "../paths.js";
import type { Config } from "../schemas.js";
import { EMBEDDINGS_UNAVAILABLE, EMBEDDING_MODEL } from "./embed.js";
import { SEARCH_SCHEMA_SQL } from "./schema.js";
import { extractiveSummary } from "./summarize.js";
import type { RawHit, SearchHit, SearchScope } from "./types.js";

const PRIVATE_MARKERS = ["FAKE_BIRTH_RECORD_S1", "fake-secret-s1-do-not-index"] as const;

export type CacheChannel = "search" | "context" | "handoff";

export interface CacheRequest {
  projectRoot: string;
  query: string;
  channel: CacheChannel;
  scope: string;
  k: number;
  budget: number;
  embeddings: boolean;
  activeChange: string;
  filterPaths?: readonly string[];
  filterSymbols?: readonly string[];
  /** Scopes this channel ranks. Used to compare hybrid readiness. */
  scopes: readonly SearchScope[];
}

export interface CacheHit {
  text: string;
  hits: SearchHit[];
  warning?: string;
}

interface CacheRow {
  cache_key: string;
  mode: string;
  hybrid_scopes: string;
  index_version: string;
  payload: string;
  query: string;
}

interface FileRow {
  path: string;
  content_hash: string;
}

function containsPrivate(text: string): boolean {
  return PRIVATE_MARKERS.some((marker) => text.includes(marker));
}

function field(value: string): string {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

function comparePath(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function filterText(paths: readonly string[], symbols: readonly string[]): string {
  const pathText = [...paths].sort(comparePath).join("\n");
  const symbolText = [...symbols].sort(comparePath).join("\n");
  return `${pathText}\n/\n${symbolText}`;
}

function contributorText(rows: readonly FileRow[]): string {
  const sorted = [...rows].sort((a, b) => comparePath(a.path, b.path));
  return sorted.map((row) => `${row.path}\t${row.content_hash}\n`).join("");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function cacheMaterial(request: CacheRequest, version: string, filter: string): string {
  return [
    field(request.query),
    field(request.channel),
    field(request.scope),
    field(String(request.k)),
    field(String(request.budget)),
    field(request.embeddings ? "1" : "0"),
    field(request.activeChange),
    field(version),
    field(filter),
  ].join("\n");
}

function under(rel: string, root: string): boolean {
  let end = root.length;
  while (end > 0 && root.charCodeAt(end - 1) === 47) end -= 1;
  const prefix = root.slice(0, end);
  if (!prefix) return false;
  return rel === prefix || rel.startsWith(`${prefix}/`);
}

function openCacheDb(projectRoot: string): Database.Database {
  const db = new Database(indexDbPath(projectRoot));
  db.exec(SEARCH_SCHEMA_SQL);
  return db;
}

type ScopeState = "empty" | "ready" | "partial";

function scopeState(db: Database.Database, scope: string): ScopeState {
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM chunks WHERE scope = ?) AS chunks,
         (SELECT COUNT(*) FROM chunks AS c
            JOIN vec_meta AS m ON m.chunk_id = c.id AND m.chunk_hash = c.chunk_hash
            WHERE c.scope = ?) AS ready`,
    )
    .get(scope, scope) as { chunks: number; ready: number };
  if (!counts || counts.chunks === 0) return "empty";
  const model = db.prepare("SELECT value FROM meta WHERE key = ?").get("embedding_model") as
    | { value: string }
    | undefined;
  const modelOk = !model || model.value === EMBEDDING_MODEL;
  if (counts.ready === counts.chunks && modelOk) return "ready";
  return "partial";
}

function readyList(db: Database.Database, scopes: readonly string[], embeddings: boolean): string {
  if (!embeddings) return "";
  return scopes
    .filter((scope) => scopeState(db, scope) === "ready")
    .sort(comparePath)
    .join(",");
}

function normalizeHybrid(hybridScopes: string): string {
  return hybridScopes.split(",").filter(Boolean).sort(comparePath).join(",");
}

export async function resolveActiveDirectory(projectRoot: string, config: Config): Promise<string> {
  let text: string;
  try {
    text = await readFile(activePointerPath(projectRoot, config), "utf8");
  } catch {
    return "";
  }
  const id = text.trim();
  if (!id || isAbsolute(id) || id.includes("\\")) return "";
  const parts = id.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return "";
  return displayChangePath(config, id);
}

export function forgetPath(db: Database.Database, rel: string): void {
  const keys = db.prepare("SELECT cache_key FROM result_cache_files WHERE path = ?").all(rel) as {
    cache_key: string;
  }[];
  const dropCache = db.prepare("DELETE FROM result_cache WHERE cache_key = ?");
  const dropFiles = db.prepare("DELETE FROM result_cache_files WHERE cache_key = ?");
  for (const row of keys) {
    dropCache.run(row.cache_key);
    dropFiles.run(row.cache_key);
  }
  db.prepare("DELETE FROM spec_summaries WHERE path = ?").run(rel);
}

function dropCacheKey(db: Database.Database, cacheKey: string): void {
  db.prepare("DELETE FROM result_cache WHERE cache_key = ?").run(cacheKey);
  db.prepare("DELETE FROM result_cache_files WHERE cache_key = ?").run(cacheKey);
}

function hitFromPayload(value: unknown): SearchHit | null {
  if (!value || typeof value !== "object") return null;
  const hit = value as SearchHit;
  const formOk = hit.form === "full" || hit.form === "signature" || hit.form === "summary";
  if (!formOk) return null;
  if (typeof hit.path !== "string" || typeof hit.symbol !== "string") return null;
  if (typeof hit.text !== "string" || typeof hit.signature !== "string") return null;
  if (typeof hit.body !== "string" || typeof hit.language !== "string") return null;
  if (typeof hit.startLine !== "number" || typeof hit.endLine !== "number") return null;
  if (typeof hit.score !== "number" || typeof hit.scope !== "string") return null;
  return {
    scope: hit.scope,
    path: hit.path,
    startLine: hit.startLine,
    endLine: hit.endLine,
    symbol: hit.symbol,
    score: hit.score,
    form: hit.form,
    text: hit.text,
    signature: hit.signature,
    body: hit.body,
    language: hit.language,
  };
}

function payloadHits(raw: string): { text: string; hits: SearchHit[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const body = parsed as { text?: unknown; hits?: unknown };
  if (typeof body.text !== "string" || !Array.isArray(body.hits)) return null;
  const hits: SearchHit[] = [];
  for (const value of body.hits) {
    const hit = hitFromPayload(value);
    if (!hit) return null;
    hits.push(hit);
  }
  return { text: body.text, hits };
}

function cachedWarning(db: Database.Database, request: CacheRequest): string | undefined {
  if (!request.embeddings) return undefined;
  const partial = request.scopes.some((scope) => scopeState(db, scope) === "partial");
  return partial ? EMBEDDINGS_UNAVAILABLE : undefined;
}

export function readPackedCache(request: CacheRequest): CacheHit | null {
  if (containsPrivate(request.query)) return null;
  const db = openCacheDb(request.projectRoot);
  try {
    const filter = filterText(request.filterPaths ?? [], request.filterSymbols ?? []);
    const rows = db
      .prepare(
        `SELECT cache_key, mode, hybrid_scopes, index_version, payload, query
         FROM result_cache
         WHERE query = ? AND channel = ? AND scope = ? AND k = ? AND budget = ?
           AND embeddings = ? AND active_change = ? AND filter = ?`,
      )
      .all(
        request.query,
        request.channel,
        request.scope,
        request.k,
        request.budget,
        request.embeddings ? 1 : 0,
        request.activeChange,
        filter,
      ) as CacheRow[];
    const expected = readyList(db, request.scopes, request.embeddings);
    for (const row of rows) {
      const parsed = payloadHits(row.payload);
      if (
        !parsed ||
        containsPrivate(row.query) ||
        containsPrivate(row.payload) ||
        containsPrivate(parsed.text)
      ) {
        dropCacheKey(db, row.cache_key);
        continue;
      }
      const files = db
        .prepare("SELECT path, content_hash FROM result_cache_files WHERE cache_key = ?")
        .all(row.cache_key) as FileRow[];
      let fresh = true;
      for (const file of files) {
        const current = db
          .prepare("SELECT content_hash FROM files WHERE path = ?")
          .get(file.path) as { content_hash: string } | undefined;
        if (!current || current.content_hash !== file.content_hash) {
          fresh = false;
          break;
        }
      }
      if (!fresh || sha256(contributorText(files)) !== row.index_version) {
        dropCacheKey(db, row.cache_key);
        continue;
      }
      const hybrid = normalizeHybrid(row.hybrid_scopes);
      if (!request.embeddings) {
        if (row.mode !== "bm25" || hybrid !== "") {
          dropCacheKey(db, row.cache_key);
          continue;
        }
      } else if (hybrid !== expected) {
        dropCacheKey(db, row.cache_key);
        continue;
      }
      return { text: parsed.text, hits: parsed.hits, warning: cachedWarning(db, request) };
    }
    return null;
  } finally {
    db.close();
  }
}

function serializeHit(hit: SearchHit & { rankedBy?: RawHit["rankedBy"] }): Record<string, unknown> {
  return {
    scope: hit.scope,
    path: hit.path,
    startLine: hit.startLine,
    endLine: hit.endLine,
    symbol: hit.symbol,
    score: hit.score,
    form: hit.form,
    text: hit.text,
    signature: hit.signature,
    body: hit.body,
    language: hit.language,
    rankedBy: hit.rankedBy ?? null,
  };
}

export function writePackedCache(
  request: CacheRequest,
  packed: { text: string; hits: SearchHit[] },
  contributors: readonly RawHit[],
  mode: "bm25" | "rrf",
  hybridScopes: string,
): void {
  if (containsPrivate(request.query) || containsPrivate(packed.text)) return;
  if (packed.text.startsWith("Retrieved context skipped:")) return;
  const db = openCacheDb(request.projectRoot);
  try {
    const byPath = new Map<string, string>();
    for (const hit of contributors) {
      if (byPath.has(hit.path)) continue;
      const row = db.prepare("SELECT content_hash FROM files WHERE path = ?").get(hit.path) as
        | { content_hash: string }
        | undefined;
      if (row) byPath.set(hit.path, row.content_hash);
    }
    const files: FileRow[] = [...byPath.entries()].map(([path, content_hash]) => ({
      path,
      content_hash,
    }));
    const version = sha256(contributorText(files));
    const filter = filterText(request.filterPaths ?? [], request.filterSymbols ?? []);
    const cacheKey = sha256(cacheMaterial(request, version, filter));
    const payload = JSON.stringify({
      text: packed.text,
      hits: packed.hits.map((hit) => serializeHit(hit)),
    });
    if (containsPrivate(payload)) return;
    const hybrid = normalizeHybrid(hybridScopes);
    const write = db.transaction(() => {
      db.prepare(
        `INSERT INTO result_cache (
           cache_key, query, channel, scope, k, budget, embeddings, active_change, filter,
           index_version, mode, hybrid_scopes, payload
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           query = excluded.query,
           channel = excluded.channel,
           scope = excluded.scope,
           k = excluded.k,
           budget = excluded.budget,
           embeddings = excluded.embeddings,
           active_change = excluded.active_change,
           filter = excluded.filter,
           index_version = excluded.index_version,
           mode = excluded.mode,
           hybrid_scopes = excluded.hybrid_scopes,
           payload = excluded.payload`,
      ).run(
        cacheKey,
        request.query,
        request.channel,
        request.scope,
        request.k,
        request.budget,
        request.embeddings ? 1 : 0,
        request.activeChange,
        filter,
        version,
        mode,
        hybrid,
        payload,
      );
      db.prepare("DELETE FROM result_cache_files WHERE cache_key = ?").run(cacheKey);
      const insertFile = db.prepare(
        "INSERT INTO result_cache_files (cache_key, path, content_hash) VALUES (?, ?, ?)",
      );
      for (const file of files) insertFile.run(cacheKey, file.path, file.content_hash);
    });
    write();
  } finally {
    db.close();
  }
}

export function attachSummaries(
  projectRoot: string,
  hits: readonly RawHit[],
  activeChange: string,
): RawHit[] {
  const db = openCacheDb(projectRoot);
  try {
    return hits.map((hit) => {
      if (hit.scope === "code") return hit;
      if (hit.scope === "specs" && under(hit.path, activeChange)) return hit;
      if (hit.scope !== "specs" && hit.scope !== "memory") return hit;
      try {
        const file = db.prepare("SELECT content_hash FROM files WHERE path = ?").get(hit.path) as
          | { content_hash: string }
          | undefined;
        if (!file) return hit;
        const stored = db
          .prepare(
            `SELECT summary FROM spec_summaries
             WHERE path = ? AND content_hash = ? AND symbol = ? AND start_line = ?`,
          )
          .get(hit.path, file.content_hash, hit.symbol, hit.startLine) as
          | { summary: string }
          | undefined;
        if (stored) return { ...hit, summary: stored.summary };
        if (containsPrivate(hit.body) || containsPrivate(hit.signature)) return hit;
        const summary = extractiveSummary(hit.signature, hit.body);
        if (containsPrivate(summary)) return hit;
        db.prepare("DELETE FROM spec_summaries WHERE path = ? AND content_hash != ?").run(
          hit.path,
          file.content_hash,
        );
        db.prepare(
          `INSERT INTO spec_summaries (path, content_hash, symbol, start_line, summary)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(hit.path, file.content_hash, hit.symbol, hit.startLine, summary);
        return { ...hit, summary };
      } catch {
        return hit;
      }
    });
  } catch {
    return hits.slice();
  } finally {
    db.close();
  }
}
