# Design

> **Issue #23: search S2 opt-in embeddings and hybrid ranking** · `2026-10-18-issue-23-search-s2-opt-in-embeddings-and-hybrid-ranking`

## Approach

Keep the S1 keyword index. Add an opt-in embedding of the same chunks and fuse the two rankings. Embeddings off is not a second ranker: `searchPreamble` stays the S1 string, FTS order stays the S1 order, and `fastembed` is not imported.

S1 already reindexes a file when its raw-byte sha256 changes, deletes gone files on a full walk, and supports `index(paths)`. Those behaviors stay. S2 adds `chunk_hash`, sqlite-vec rows, and a git commit cursor used only by a full `index()` (no path list).

Node on this machine is v20.19.3. Package `engines` still say `>=24`. Do not call `node:sqlite`, `Promise.withResolvers`, `Array.fromAsync`, `Set` union helpers, or `using`. Do not add a polynomial regex (CodeQL `js/polynomial-redos`). Parse git `-z` output with `indexOf(0)`. Reuse `getHeadSha` in `packages/core/src/git-head.ts` for the HEAD sha. Strip nothing with a new regex.

Do not edit `packages/core/src/report.ts`. Do not change `sdd report`, `sdd cost`, or the code-point estimate.

## Licenses

Checked on 2026-10-18 from the npm `license` field and the upstream license file. None of the chosen pieces is AGPL. S1's rejection of `js-tiktoken` still stands: keyword mode must not fetch.

| Piece | What is shipped | SPDX | Evidence |
|-------|-----------------|------|----------|
| Embedding runtime | npm `fastembed@3.0.0` | `MIT` | npm `license` `MIT`. Package `LICENSE` is MIT, copyright 2026. Upstream `https://github.com/qdrant-labs/fastembed-js` (GitHub reports `MIT`). |
| ONNX runtime | npm `onnxruntime-node@1.21.0` (exact dependency of fastembed 3.0.0, not a range) | `MIT` | npm `license` `MIT`. Upstream `https://github.com/microsoft/onnxruntime` `LICENSE` at tag `v1.21.0` is MIT, copyright Microsoft Corporation. `https://www.npmjs.com/package/onnxruntime-node` version 1.21.0. Node 16+ prebuilds, including Node 20. |
| ONNX runtime shared code | npm `onnxruntime-common@1.21.0` | `MIT` | Exact dependency of `onnxruntime-node@1.21.0`. npm `license` `MIT`. |
| ONNX runtime proxy helper | npm `global-agent` (transitive of onnxruntime-node `^3`) | `BSD-3-Clause` | npm `license` `BSD-3-Clause`. Not AGPL. sdd must not set `GLOBAL_AGENT_*`. Importing it is not a license problem. Keyword mode never imports it. |
| Hub client pulled in by fastembed's top-level import | npm `@huggingface/hub@2.7.1` | `MIT` | fastembed depends on `^2.7.1`. Pin 2.7.1 with a pnpm override so the range cannot float. npm `license` `MIT`. Upstream `https://github.com/huggingface/huggingface.js`. Version 2.7.1 exports `downloadFileToCacheDir`. Latest 2.17.8 on this date is also MIT and is not the pin. |
| Tokenizer native binding | npm `@anush008/tokenizers@0.6.0` | `MIT` | fastembed depends on `^0.0.0`. Pin 0.6.0. npm `license` `MIT`. Upstream `https://github.com/Anush008/tokenizers`. The wrapped Hugging Face tokenizers project is `Apache-2.0` (`https://github.com/huggingface/tokenizers`). Not AGPL. |
| sqlite-vec | npm `sqlite-vec@0.1.9` and the matching optional platform package (`sqlite-vec-darwin-arm64@0.1.9` on this machine) | `Apache-2.0 OR MIT` | npm `license` is the string `MIT OR Apache`. Upstream has both `LICENSE-MIT` (MIT, copyright 2024 Alex Garcia) and `LICENSE-APACHE` (Apache License 2.0) at `https://github.com/asg017/sqlite-vec`. GitHub's licensee API reports `Apache-2.0`. The dual expression is the one to record. Not AGPL. |
| Model weights (canonical) | `BAAI/bge-small-en-v1.5` | `MIT` | Hugging Face model API tag `license:mit`. Card `https://huggingface.co/BAAI/bge-small-en-v1.5`. 384 dimensions. English. Small class, not base or large. |
| Model weights (the ONNX file that is downloaded) | `Qdrant/bge-small-en-v1.5-onnx-Q` file `model_optimized.onnx`, plus `tokenizer.json`, `tokenizer_config.json`, `config.json`, `special_tokens_map.json` | `MIT` | Hugging Face model API tag `license:mit`. Card `https://huggingface.co/Qdrant/bge-small-en-v1.5-onnx-Q`. This is the repo `fastembed@3.0.0` maps to `EmbeddingModel.BGESmallENV15`. Quantized ONNX, pooling `CLS`, about 0.067 GB in the fastembed model table. |

`fastembed@3.0.0` `downloadFileFromHF` builds `https://huggingface.co/<repo>/resolve/main/<file>` unless `HF_ENDPOINT` is already set. sdd must not set `HF_ENDPOINT`. If the destination file already exists, that function returns before `fetch`. `passageEmbed` and `queryEmbed` do not download.

Do not call `SparseTextEmbedding`. Its `retrieveModel` uses `@huggingface/hub` `downloadFileToCacheDir` and skips the network only when the whole cache directory exists. S2 does not need sparse vectors.

### Rejected: transformers.js

`@huggingface/transformers@4.3.1` is `Apache-2.0` (`https://github.com/huggingface/transformers.js`). It is not rejected for AGPL. It is rejected because a query-time network fetch is the documented default: the README sets `env.backends.onnx.wasm.wasmPaths` to a jsDelivr CDN and says remote models load from the Hub unless `env.allowRemoteModels` is turned off. That is the same class of fetch S1 refused for `js-tiktoken`. The package also depends on both `onnxruntime-web@1.31.0-dev.20260914-8d85527a0` and `onnxruntime-node@1.30.0`, plus `sharp`. Two ONNX runtimes, and the web one wants a CDN. `fastembed@3.0.0` uses only the native `onnxruntime-node@1.21.0` build that is already on disk after install, and it does not fetch when the cache file exists.

Do not vendor a third runtime (including `fasttextembed`). The issue allows fastembed or transformers.js. The choice is fastembed.

### Dependencies

Add to `packages/core/package.json`:

- `fastembed` at `3.0.0`
- `sqlite-vec` at `0.1.9`

Add pnpm overrides so the floated transitives stay on the versions above:

- `@huggingface/hub` at `2.7.1`
- `@anush008/tokenizers` at `0.6.0`

Do not add `@huggingface/transformers`, `onnxruntime-web`, or a direct `onnxruntime-node` dependency. fastembed already pins `onnxruntime-node@1.21.0`.

`packages/core/tsup.config.ts` `external` must include `fastembed`, `sqlite-vec`, `onnxruntime-node`, `@huggingface/hub`, and `@anush008/tokenizers`. Do not bundle the native addons.

`embed.ts` is the only module that imports `fastembed`. `vec.ts` is the only module that imports `sqlite-vec`. Both imports are dynamic (`await import(...)`), and only from a branch where embeddings are on or an existing `chunk_vec_*` table must be updated. `builtin.ts` must not static-import either package. Keyword search on a fresh database must not evaluate those modules.

## Config file

Replace the shipped body of `packages/core/defaults/search.yaml`. Init still copies it with `writeTextIfMissing` and still does not mark it `sdd:generated`. An existing `.sdd/search.yaml` that omits `embeddings` is valid and means off. Do not rewrite a user's file.

Exact shipped body:

```yaml
# Operator-owned search config. sdd does not refresh this file.
# Keyword index is always on. Embeddings stay off until embeddings is true.
version: 1
provider: builtin
k: 20
embeddings: false
budgets:
  default: 12000
  intent: 4000
  clarify_intent: 4000
  brainstorm: 4000
  design: 8000
  clarify_design: 8000
  tasks: 8000
  clarify_tasks: 8000
  implement: 12000
  local_verify: 8000
exclude: []
```

Add to the zod object, next to `k`:

- `embeddings`: `z.boolean().default(false)`.

`embeddings: true` and `embeddings: false` are valid. `embeddings: "true"`, `embeddings: 1`, and `embeddings: yes` throw `search.yaml is invalid` with no parser text and no absolute path. There is no `embedding_model` key. The model id is a code constant so a config typo cannot select another set of weights.

`k` caps the keyword list and the vector list before fusion. It does not cap the fused list. It is not the RRF constant. The RRF constant is not configurable.

## Embedder

```ts
export interface Embedder {
  /** One L2-normalized vector per text, same order. Text is the raw chunk body. */
  embedPassages(texts: readonly string[]): Promise<Float32Array[]>;
  /** One L2-normalized vector for the raw user query. */
  embedQuery(text: string): Promise<Float32Array>;
}
```

The fastembed adapter:

- Dynamic-imports `fastembed` and calls `FlagEmbedding.init` once per process for a given cache directory.
- Options: `model: EmbeddingModel.BGESmallENV15`, `executionProviders: [ExecutionProvider.CPU]`, `maxLength: 512`, `showDownloadProgress: false`, `cacheDir: join(sddRoot(projectRoot), "models", "fastembed")`.
- `embedPassages` collects `passageEmbed(texts, 16)`. The library prefixes `passage: `. Do not prefix again in our code.
- `embedQuery` calls `queryEmbed`. The library prefixes `query: `. Do not prefix again.
- Each vector must be length 384. Any other length, a throw, or a failed init is an embedder failure.

Cache directory on disk: `.sdd/models/fastembed/Qdrant_bge-small-en-v1.5-onnx-Q/`. These five files, each a non-empty regular file, mean the cache is complete:

- `model_optimized.onnx`
- `tokenizer.json`
- `tokenizer_config.json`
- `config.json`
- `special_tokens_map.json`

If init throws and any of those five was missing or empty before the call, delete that `Qdrant_bge-small-en-v1.5-onnx-Q` directory so a partial file cannot pass `existsSync` next time, then fall back. If all five were already non-empty and init throws, leave them in place and fall back. A broken ONNX session must not wipe a good cache.

`meta` key `embedding_model` is the string `BAAI/bge-small-en-v1.5`, written only after at least one vector is stored. If the stored value is ever different, drop the three `chunk_vec_*` tables and `vec_meta`, then embed again. S2 has one model, so this is only the guard.

Tests pass an injected `Embedder` into the builtin provider. The CLI does not grow a backdoor env var. The injected double sees raw bodies and the raw query. It does not add `passage:` or `query:`.

## What sdd search prints

`searchPreamble` in `packages/core/src/search/pack.ts` today returns:

```ts
`# Search\nQuery: ${query}\nScope: ${scope}\nProvider: builtin\nBudget: ${budget}\n\n`
```

Keep that string when embeddings are off, when the key is omitted, and when hybrid was requested but fell back. Do not insert a blank `Mode` line. The S1 budget-120 stdout stays 108 cl100k tokens.

When hybrid actually runs, insert one line between `Provider` and `Budget`:

```ts
`# Search\nQuery: ${query}\nScope: ${scope}\nProvider: builtin\nMode: hybrid\nBudget: ${budget}\n\n`
```

`Provider` stays `builtin`. The warning is stderr only.

Fallback warning, exact, and the whole warning (do not append the embedder's message, which can contain an absolute cache path):

```text
Embeddings are unavailable. Using keyword search.
```

`sdd search` writes it with `consola.warn` and exits 0. Stdout is the keyword text. A provider-name fallback still uses its S1 sentence first. If both fire, print the provider sentence, then the embeddings sentence. Stdout stays the keyword builtin result.

Context: `ok` stays true. Add gap `embeddings_unavailable` with that same message. Do not throw. Keyword slices are what get packed. Embeddings off adds no gap.

Handoff: do not throw and do not add a sentence inside or outside the retrieved-context markers. The inner text is the keyword pack. The command exits 0. That is the "stage does not fail" rule. The markers and the process half of the handoff stay as S1 left them.

## Index schema

Same database: `.sdd/index.db`. Same `PRAGMA journal_mode = DELETE` and `PRAGMA foreign_keys = ON`.

New installs create `chunks` with `chunk_hash`. S1 databases do not have the column. On open, if `pragma table_info(chunks)` has no `chunk_hash`, run:

```sql
ALTER TABLE chunks ADD COLUMN chunk_hash TEXT NOT NULL DEFAULT '';
```

Then, in the same connection, for every row whose `chunk_hash` is `''`, set it to the hex sha256 of the UTF-8 bytes of `body`. Use `node:crypto` `createHash("sha256")`. Do not rebuild FTS. Do not change `files.content_hash` (that remains the sha256 of the raw file bytes).

`chunk_hash` is the hex sha256 of the stored `body` string only. Two files with the same body share a hash and share a vector.

Normal table, no extension required:

```sql
CREATE TABLE IF NOT EXISTS vec_meta (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  chunk_hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('code', 'specs', 'memory'))
);
```

sqlite-vec tables are created only after `sqliteVec.load(db)` succeeds, and only when embeddings are on or a rewrite must update an existing vec table:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec_code USING vec0(
  embedding float[384] distance_metric=cosine
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec_specs USING vec0(
  embedding float[384] distance_metric=cosine
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec_memory USING vec0(
  embedding float[384] distance_metric=cosine
);
```

`rowid` is `chunks.id`. One table per scope so `k` is applied inside that scope. Do not use a single table plus a post-filter that can drop the scope and return fewer than `k` for the wrong reason.

`deletePath` deletes the path's `vec_meta` rows with normal SQL. If a `chunk_vec_*` table exists, load sqlite-vec (local, no model import) and `DELETE FROM chunk_vec_<scope> WHERE rowid = ?` for each chunk id of that path before deleting the chunk rows. If the extension fails to load, still delete the chunk and `vec_meta` rows. Keyword search does not read `chunk_vec_*`. Loading sqlite-vec to delete orphans is allowed while embeddings are off. Importing `fastembed` is not.

Keyword search does not call `sqliteVec.load` when no `chunk_vec_*` table exists.

New `meta` keys, decimal integers except the commit:

| Key | Meaning |
|-----|---------|
| `last_chunks_reindexed` | Chunk rows inserted by this `index()` call. |
| `last_chunks_embedded` | Bodies sent to `embedPassages` on this call. Copies by hash count as 0. |
| `indexed_commit` | Lowercase HEAD sha after a full index. Absent when git could not supply one. |
| `embedding_model` | `BAAI/bge-small-en-v1.5` after a vector write. |

`stats()` returns the S1 fields plus:

```ts
lastIndexChunksReindexed: number;
lastIndexChunksEmbedded: number;
indexedCommit: string | null;
```

`sdd search` does not print these.

## Vectors

On a file rewrite, before `deletePath`, read `vec_meta` and the vec blob for any `chunk_hash` that the new chunk list still uses. After the new chunk rows exist, for each new chunk:

1. If a copied blob for that hash exists, insert it into `chunk_vec_<scope>` at the new `chunks.id` and insert `vec_meta`. Do not call the embedder.
2. Otherwise, if embeddings are on and the embedder loaded, queue the raw body.
3. If embeddings are off, write no vec row.

Queue is embedded with `embedPassages` in batches of 16. Store the `Float32Array` as the sqlite-vec binding value. Do not round-trip through JSON. Before insert, `DELETE FROM chunk_vec_<scope> WHERE rowid = ?` so a reused integer id cannot keep a stale vector.

`last_chunks_reindexed` counts inserts. `last_chunks_embedded` counts queued bodies only, including bodies queued by the backfill below.

Embeddings off writes no `vec_meta` row and no `chunk_vec_*` row. It does not import `fastembed` and does not download a model.

### Backfill

A full `index()` with embeddings on, after the file sync below, selects every stored chunk in `code`, `specs`, and `memory` that has no `vec_meta` row for that `chunk_id` and `chunk_hash`. That includes a chunk whose file bytes did not change and a chunk the commit cursor did not reopen. Copy a vector when another row already has the same hash. Otherwise queue the raw body. This is how embeddings turned on later, and how a batch that wrote no vector, gets covered without editing the file.

`index(paths)` does not run that scan. It embeds only chunks that this call inserted for the named paths and that still have no vector. Other paths stay as they are, with or without vectors.

One `embedPassages` call is one batch, and a batch is one file's missing bodies. If that call throws, keep the keyword rows already written for that file, write no vector for that batch, and continue with the next file. `index()` does not throw. A later full `index()` selects those chunks again because `vec_meta` is still missing, and it retries them even when the raw sha256 matches and the file is not in the git diff. `index(paths)` does not retry some other path's failed batch.

### Hybrid-ready

A scope is hybrid-ready only when all of these hold:

- `embeddings` is true.
- The embedder loaded and `embedQuery` returned length 384.
- Every `chunks` row in that scope has a `vec_meta` row with the same `chunk_id` and the same `chunk_hash`.
- `embedding_model` is missing or is `BAAI/bge-small-en-v1.5`.

Otherwise that scope's search is keyword, with the fallback warning when embeddings were requested. A scope with zero chunks is keyword-empty and needs no warning. Hybrid-ready is per scope. A scope whose `vec_meta` rows are complete stays hybrid even when a sibling scope has no vectors. Do not latch one file's embed failure into a process-wide keyword mode. `embedQuery` throwing is the exception: the query vector is missing, so every scope uses keyword search for that call and the warning is set.

### Query

Keyword list: the existing `queryRanked` SQL, `LIMIT k`, order `bm25` ascending, then path, start line, symbol. Rank 1 is the first row. Do not change this SQL.

Vector list, only when hybrid-ready. `?` is the query `Float32Array`.

```sql
SELECT c.path, c.scope, c.symbol, c.start_line, c.end_line, c.signature, c.body,
       f.language AS language, v.distance AS distance
FROM chunk_vec_code AS v
JOIN chunks AS c ON c.id = v.rowid
JOIN vec_meta AS m ON m.chunk_id = c.id AND m.chunk_hash = c.chunk_hash
JOIN files AS f ON f.path = c.path
WHERE v.embedding MATCH ?
  AND k = ?
  AND c.scope = 'code'
ORDER BY v.distance ASC, c.path ASC, c.start_line ASC, c.symbol ASC
```

Use `chunk_vec_specs` or `chunk_vec_memory` for the other scopes. Rank 1 is the nearest. Drop a row whose `vec_meta` hash does not match. Do not pin the distance float. Tests pin order.

### Reciprocal rank fusion

Constant `RRF_K = 60`. Not the yaml `k`. Ranks are 1-based. A chunk missing from a list contributes 0.

```ts
function rrf(rank: number | undefined): number {
  if (rank === undefined) return 0;
  return 1 / (RRF_K + rank);
}
```

Score is `rrf(keywordRank) + rrf(vectorRank)`. Sort the union by that score descending, then path ascending, then start line ascending, then symbol ascending. Do not cut the union to `k`. `k` already limited each source list. `packHits` walks this full order under the token budget. It still emits `full`, else `signature`, else skips that hit and keeps walking, which is the S1 packer. It does not stop after `k` fused rows. Packing does not read `score`.

When the scope is hybrid-ready, `RawHit.score` is the RRF score (higher is better) and the hit is tagged `rankedBy: "rrf"`. The tag is not printed. When the scope is keyword, `score` stays the raw BM25 value (more negative is better) and the hit is tagged `rankedBy: "bm25"`.

`generateCodeContext` searches `code` only. It uses the fused list when `code` is hybrid-ready, and `keywordHits` otherwise. Embeddings off therefore keeps the S1 context bytes at budgets 87 and 88.

`buildRetrievedInner` still searches `specs`, then `memory`, then `code`. Each scope contributes either its fused list or its keyword list, as that scope's hybrid-ready flag says. Merge with one comparator:

- If every hit is `bm25`: keep the S1 sort. Score ascending, then scope order `specs`, `memory`, `code`, then path, start line, symbol. Embeddings off stays on this branch, so the S1 handoff inner text stays byte-identical.
- If any hit is `rrf`: do not compare an RRF number with a BM25 number, and do not use scope order. Emit every `rrf` hit first, sorted by RRF score descending, then path, start line, symbol. After those, emit every `bm25` hit, sorted by BM25 ascending, then path, start line, symbol.

A code scope that failed to embed therefore cannot outrank a spec or memory hit that has an RRF score, no matter how negative its BM25 is.

### Worked ranks for the S2 fixture

`k` is 2. Query `zebraMarker`. BM25 of `src/a.ts` and `src/b.ts` is equal on better-sqlite3 12.8.0 (same symbol, same token length). Path order gives keyword ranks a=1, b=2. `src/c.ts` (`padText`) shares no token with `zebraMarker`, so it is not in the keyword list.

Injected vectors, length 384, already unit length:

- Query, and `src/c.ts`: `v[0] = 1`, other lanes 0. Cosine distance 0. Vector rank 1.
- `src/b.ts`: `v[0] = 0.6`, `v[1] = 0.8`, other lanes 0. Cosine similarity 0.6. Vector rank 2.
- `src/a.ts`: `v[1] = 1`, other lanes 0. Orthogonal to the query. Outside `k = 2`, so no vector rank.

Scores:

- `src/b.ts`: `1/62 + 1/62 = 1/31`.
- `src/a.ts`: `1/61`.
- `src/c.ts`: `1/61`.

`1/31` is greater than `1/61`. `src/a.ts` and `src/c.ts` tie. Path order puts `src/a.ts` before `src/c.ts`. The fused list is `src/b.ts`, `src/a.ts`, `src/c.ts`. It has three rows. It is not cut to `k`. Budget 400 fits every block as `full`. `countTokens` of that stdout is 148, and `148 <= 400`. `padText` is the third hit, not the first, and it is not dropped. Do not "fix" the test to expect `padText` first, and do not drop it because `k` is 2.

Keyword-only on the same files and the same `k` is `src/a.ts` then `src/b.ts`, and the stdout does not contain `padText`. That list is not fused. The keyword `LIMIT` is still `k`, so `padText` is absent there because it is not a keyword hit at all.

## Commit cursor

`indexed_commit` is written only at the end of `index()` when the caller passed no path list, and only when `getHeadSha` returns a sha. Write that sha even if the worktree is dirty. Do not invent a dirty sentinel. A dirty tree's extra bytes are already in `files.content_hash`. The next full index diffs the same HEAD, `syncOne` sees the matching hash, and that file counts as unchanged.

`index(paths)` does not read git and does not update `indexed_commit`. It still runs `syncOne` on those paths only. Other files stay as they are, even if they changed on disk and even if embeddings are on. That is the S1 rule.

Full `index()` when there is no `.git`, `getHeadSha` returns null, or the stored cursor is not a 40- or 64-character hex sha: do the S1 walk (eligible files, hash short-circuit, delete stored paths that are no longer eligible). Do not clear a stored cursor when git fails. Do not throw. Do not fail the stage.

Full `index()` when the cursor is valid:

1. `git diff --name-status -z --no-renames <cursor>` with `cwd` the project root, `stdio` `["ignore", "pipe", "pipe"]`, no shell. The cursor is a validated hex argument, never string-concatenated into a shell.
2. `git ls-files --others --exclude-standard -z` the same way.
3. If either command exits non-zero, fall back to the S1 full walk. Do not throw.
4. Otherwise parse with `indexOf(0)`. Name-status records are `status`, NUL, `path`, NUL. A status whose first character is `D` is a deletion. Any other non-empty status is a candidate path (`A`, `M`, `T`, and two-letter statuses). `--no-renames` avoids a second path. Untracked output is paths separated by NUL. Skip empty records. Skip a path that is absolute. Do not throw `Index path must be project-relative.` for a git path; that error stays reserved for an absolute entry in `index(paths)`.
5. `git diff <cursor>` compares that commit to the worktree, so staged and unstaged edits are both included. Untracked files are not in that diff, which is why `ls-files` is separate.
6. Run `syncOne` on each candidate that is not a deletion. `syncOne` still returns `unchanged` when the raw sha256 matches, so a dirty file that was indexed and then committed is not chunked again. If that chunk already has `vec_meta`, it is not embedded again either.
7. `deletePath` on each deletion.
8. Then scan every path already in `files`. If the file is missing, excluded, or not a code/spec/memory path, `deletePath`. This scan does not hash and does not embed. It is what drops a file when `exclude:` or `.gitignore` changes without a content edit. A file that is still eligible and was not in the diff is not rehashed and its chunk rows stay.
9. If embeddings are on, run the backfill in the Vectors section. Unchanged files are not rechunked, but a stored chunk with no `vec_meta` row is embedded. Embeddings off skips this step.

`last_files_considered` counts candidates passed to `syncOne` plus stored paths that this scan deletes. It does not count untouched files. `last_files_reindexed` still counts every `syncOne` result other than `unchanged`, plus deletions, as S1 does.

Files changed since the cursor and then reverted to the indexed bytes are `unchanged`. Deleted files leave no chunk and no `vec_meta` row. A later embeddings-on index must not find `FAKE_BIRTH_RECORD_S1` in either.

No `.git` means every full index is the S1 walk. The S1 test that edits `src/budget.ts` and expects `lastIndexFilesReindexed === 1` uses a temp directory without `.git`. It must still pass with the default `embeddings: false`.

## Exclusions

Use the S1 excluder unchanged, before chunking. Do not call the embedder with text from an excluded path, a secret path, or a path outside the three scopes. The personal-data fixture is the S1 one: `review-private/birth.jhd` containing `FAKE_BIRTH_RECORD_S1`, `.env` containing `fake-secret-s1-do-not-index`, and `exclude` listing `*.jhd` and `review-private/`. With embeddings on and an injected embedder that would return a vector for any string, those strings are absent from `chunks.body`, from `vec_meta`, from the bytes of `.sdd/index.db`, from hybrid stdout (they may appear only on the `Query:` line if the user searched for them), from context markdown, and from the handoff.

## Gitignore

`ensureIgnoreEntries` for `.sdd/.gitignore` gains one line after the S1 six:

```text
handoff.md
active-context.md
index.db
index.db-journal
index.db-wal
index.db-shm
models/
```

Fresh init writes exactly those seven lines. `--force` appends only missing lines. The tracked-path warning list stays `.sdd/index.db`. Do not add `.sdd/models` to that warning list and do not `git rm`. Embeddings off must not create `.sdd/models`. Update `init-force.test.ts` so the expected ignore text includes `models/`.

The S1 search stdout pins are not part of that gitignore change. They stay byte-identical.

## CLI and docs

No new command and no new flag. `sdd search` still refuses a bad scope, a bad budget, and an empty query with the S1 sentences. It calls `index()` with no path list, then `search`.

Update `docs/reference/cli.md` with one short paragraph: embeddings are off by default; `embeddings: true` in `.sdd/search.yaml` downloads `BAAI/bge-small-en-v1.5` once into `.sdd/models/` and ranks with hybrid fusion; a missing model falls back to keyword search. Do not edit the paragraph that describes the `sdd report` code-point estimate. Do not add a language matrix.

Update the opening of `docs/guides/code-context.md` with one sentence: hybrid ranking is optional and off by default. Do not change the S1 budget description.

## Components / modules

- `packages/core/src/search/embed.ts`: `Embedder`, fastembed adapter, cache check, dynamic import.
- `packages/core/src/search/vec.ts`: dynamic `sqlite-vec` load, create the three virtual tables, delete by rowid.
- `packages/core/src/search/rrf.ts`: `RRF_K`, fuse, pure function tested without SQLite.
- `packages/core/src/search/schema.ts`: `chunk_hash` column, `vec_meta`, migration.
- `packages/core/src/search/builtin.ts`: cursor, hash copy, hybrid query, fallback.
- `packages/core/src/search/config.ts`: `embeddings` boolean.
- `packages/core/src/search/pack.ts`: optional hybrid preamble line.
- `packages/core/src/search/registry.ts`: handoff uses fused hits only when hybrid-ready.
- `packages/core/src/code-context/index.ts`: same, plus the gap on fallback.
- `packages/core/src/search/types.ts`: stats fields.
- `packages/core/defaults/search.yaml`: shipped body above.
- `packages/core/src/init.ts`: `models/` gitignore line.
- `packages/core/package.json` and the pnpm overrides. The lockfile is updated by the implementer, not by this spec.
- `packages/core/tsup.config.ts`: `external` names above.
- Tests in `local-test-plan.md`.
- The two doc sentences above.

Do not edit `packages/core/src/report.ts`. Do not add an MCP server. Do not add a result cache.

## Data flow

1. `loadSearchConfig`. Invalid file throws `search.yaml is invalid` before any import of `fastembed`.
2. `index()`. Embeddings off: S1 sync, no model import, no vec tables on a fresh db. Embeddings on: load the embedder, sync files, embed missing hashes.
3. `search()`. Embeddings off or not hybrid-ready: S1 FTS, S1 preamble. Hybrid-ready: FTS plus KNN, RRF, `Mode: hybrid`.
4. Context and handoff call the same choice. Fallback does not set `ok: false` and does not skip the handoff.
5. `sdd report` still does not read `index.db`.

## Alternatives considered

- `@huggingface/transformers@4.3.1`: rejected. Apache-2.0, but the default WASM path is a jsDelivr CDN fetch at query time, and it pulls a second ONNX runtime. See Licenses.
- `SparseTextEmbedding` inside fastembed: rejected. Different download path, sparse vectors, not the bge-small dense model.
- `node:sqlite`: still rejected. Not on Node 20, and it is not how sqlite-vec is loaded. sqlite-vec loads into the existing `better-sqlite3@12.8.0` connection.
- Configurable RRF `k` or a configurable model name: rejected. The pinned hybrid stdout and the MIT weight check depend on both staying fixed.
- Storing vectors in a second database or a hosted service: rejected. Same git-ignored `.sdd/index.db`.
- Replacing the S1 file hash with the commit cursor: rejected. `index(paths)` and the hash short-circuit stay. The cursor only narrows the full walk.
- Fusing with RRF even when embeddings are off (one list): rejected. A one-list RRF re-sort would still be path-stable here, but it is a different code path. Keyword mode must keep calling the S1 sort so the budget-120 bytes cannot drift.
- Deleting the model cache every time init throws: rejected. A warm cache plus a broken native session would re-download on every search. Delete the cache directory only when the five files were not already complete.

## Risks

- better-sqlite3 12.8.0 must keep allowing `loadExtension`. sqlite-vec 0.1.9 ships the platform package as an optional dependency. A failed load is a keyword fallback, not a failed stage.
- fastembed 3.0.0's top-level import evaluates `@huggingface/hub`. That is why the import stays inside the embeddings-on branch. A unit test with a `fetch` spy covers embeddings off.
- ONNX output is not a cross-machine fixture. The injected vectors are.
- `git diff <cursor>` on a shallow or corrupted object exits non-zero. The code then full-walks. It must not fail the command.
- Adding `models/` changes the init gitignore assertion. It does not change the S1 search stdout assertion.
