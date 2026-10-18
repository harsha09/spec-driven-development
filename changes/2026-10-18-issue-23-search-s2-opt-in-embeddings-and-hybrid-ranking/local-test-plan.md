# Local test plan

> **Issue #23: search S2 opt-in embeddings and hybrid ranking** · `2026-10-18-issue-23-search-s2-opt-in-embeddings-and-hybrid-ranking`

## Environment

- How to run locally: from the repo root, `pnpm --filter @structured-vibe-coding/core test` and `pnpm --filter @structured-vibe-coding/cli test`. Node on this machine is v20.19.3. Do not require a Node 24-only API. Do not call `node:sqlite` or `Promise.withResolvers`.
- The S1 suite stays. With `embeddings` omitted or `false`, it must pass without editing the pinned stdout. This plan adds S2 cases. S2 unit tests use an injected `Embedder`. They must not download a model. A `fetch` spy is installed for the network cases.
- `countTokens` is `encode(text).length` from `gpt-tokenizer/encoding/cl100k_base`. The en dash in `lines 1–3` is U+2013.
- Branch / seed data: S1 corpus `packages/core/src/__tests__/fixtures/search-s1/` for the byte-compatibility case. New corpus `packages/core/src/__tests__/fixtures/search-s2/` for fusion. Each file below includes one trailing `\n`. Tests copy the corpus into a temp directory.

### S2 fixture files

`src/a.ts`

```ts
export function zebraMarker() {
  return 1;
}
```

`src/b.ts`

```ts
export function zebraMarker() {
  return 2;
}
```

`src/c.ts`

```ts
export function padText(s: string): string {
  return s.trim();
}
```

`review-private/birth.jhd` — one line `FAKE_BIRTH_RECORD_S1`

`.env` — one line `API_TOKEN=fake-secret-s1-do-not-index`

`.sdd/search.yaml` sets `embeddings: true` and `k: 2` unless a case says otherwise. The personal-data case also sets:

```yaml
exclude:
  - "*.jhd"
  - "review-private/"
```

Injected vectors, length 384. Unspecified lanes are 0.

- Query and the body of `src/c.ts`: lane 0 is `1`.
- Body of `src/b.ts`: lane 0 is `0.6`, lane 1 is `0.8`.
- Body of `src/a.ts`: lane 1 is `1`.
- Any other text, including a secret: lane 2 is `1`. The exclusion test fails if this function is called with a secret.

Tree-sitter on this shape yields lines 1–3, the same as the S1 `alphaWidget` fixture. The symbol is the function name. The body stored in `chunks` has no trailing newline after `}`.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Keyword bytes unchanged | S1 corpus. `embeddings` omitted. `sdd search "function" --scope code --budget 120`. Repeat the S1 budgets 105, 30, and 19, and context budgets 87 and 88. | Exit 0. Budget 120 stdout is the S1 pinned block, byte for byte, 108 tokens. No line `Mode: hybrid`. Budgets 105, 30, 19 and context 87 and 88 match the S1 plan. `fetch` was not called. `.sdd/models` does not exist. `fastembed` was not imported. |
| 2 | Keyword order on the S2 corpus | S2 corpus. `embeddings: false`, `k: 2`. Search `zebraMarker`, scope `code`, budget 400. | Exit 0. Stdout is the keyword block below, 102 tokens. It does not contain `padText` and does not contain `Mode:`. |
| 3 | Hybrid order | Same corpus. `embeddings: true`, `k: 2`, injected embedder. Search `zebraMarker`, scope `code`, budget 400. Run it twice. | Exit 0. No stderr warning. Stdout is the hybrid block below, 148 tokens, and `148 <= 400`. The two stdouts are byte-identical. `k` capped each source list at 2 and did not cap the fused list, so there are three hits. First is `src/b.ts` · `zebraMarker`. Second is `src/a.ts`. Third is `src/c.ts` · `padText`. |
| 4 | RRF unit | Call the pure fuse function with keyword ranks a=1, b=2 and vector ranks c=1, b=2, constant 60. | Scores are `1/31` for b, `1/61` for a, `1/61` for c. Order is b, a, c. |
| 5 | Broken embedder | `embeddings: true`. The embedder factory throws `model missing`. Run case 2's search. | Exit 0. Stderr contains `Embeddings are unavailable. Using keyword search.` and does not contain the temp absolute path. Stdout equals case 2. No `Mode:` line. |
| 6 | Context and handoff fallback | Same throwing factory. Build context for query `zebraMarker` at budget 400. Write a handoff whose change title is `zebraMarker`. | Context `ok` is true. Gaps include `embeddings_unavailable` and the message `Embeddings are unavailable. Using keyword search.` The slice text does not contain `padText`. The handoff file exists. The bytes between the retrieved-context markers do not contain that warning sentence and do not contain `padText`. The command does not throw. |
| 7 | Hybrid context order | Injected embedder, embeddings on, `k: 2`. Context query `zebraMarker`, budget 400. Handoff title `zebraMarker`. | The first `###` hit is `src/b.ts` · `zebraMarker`. `padText` is present. The handoff inner text uses that same order. No `Mode:` line in the context frame. |
| 8 | No fetch when off, and no fetch from a warm cache | Install a `fetch` that records the URL and throws. Run case 1. Then call the real fastembed factory with `embeddings: true` and an empty cache. Then repeat with the five cache files present as non-empty files and an init that throws after the cache check. | Case 1 records zero `fetch` calls. On the empty cache, if `fetch` is called, every URL starts with `https://huggingface.co/Qdrant/bge-small-en-v1.5-onnx-Q/resolve/main/` and the file name is one of `model_optimized.onnx`, `tokenizer.json`, `tokenizer_config.json`, `config.json`, `special_tokens_map.json`. No other host. Search still returns the keyword stdout and the fallback sentence. On the warm cache, `fetch` is not called, the five files are still present, and search falls back with the same sentence. |
| 9 | Same hash embeds once | Two files with the same body `export function sameBody() {\n  return 1;\n}`. Embeddings on. Full index. | `lastIndexChunksReindexed` is 2. `lastIndexChunksEmbedded` is 1. The embedder received that body once. Both `vec_meta.chunk_hash` values are equal. |
| 10 | One file, and the cursor ignores `index(paths)` | `git init` in the temp dir, commit `src/a.ts` and `src/b.ts` only. Embeddings on, injected embedder. Full `index()`. Append a comment to `src/a.ts` and also to `src/b.ts`. Call `index(["src/b.ts"])`. | After the full index, `indexedCommit` equals `git rev-parse HEAD` and `lastIndexFilesReindexed` is 2. After the path index, `src/a.ts` stored body is still the committed text, `src/b.ts` stored body contains the comment, and `indexedCommit` is still the old HEAD. |
| 11 | Dirty worktree | From the clean commit in case 10, append a comment to `src/a.ts` and do not commit. Full `index()`. Then commit that edit and full `index()` again. | First dirty index: `lastIndexFilesReindexed` is 1, `src/b.ts` `content_hash` is unchanged, `indexedCommit` still equals the pre-edit HEAD. After the commit, `indexedCommit` equals the new HEAD, `src/b.ts` `content_hash` is still unchanged, and `lastIndexFilesReindexed` is 0 because the indexed bytes already matched. |
| 12 | Delete removes the vector | Commit both files, full index, record the `vec_meta` count. Delete `src/a.ts`, commit, full index. | No `chunks` row and no `vec_meta` row for `src/a.ts`. `src/b.ts` remains. Searching `zebraMarker` does not print `src/a.ts`. |
| 13 | Exclude list applies to vectors | S2 corpus plus the secret files and the `exclude` list. Embeddings on. Injected embedder. Index. Search `FAKE_BIRTH` and `fake-secret` in each scope at budget 200. Build context and a handoff. | The embedder was not called with `FAKE_BIRTH_RECORD_S1` or `fake-secret-s1-do-not-index`. Those strings are absent from stdout (except a `Query:` line that is the query itself), from context, from the handoff, from `SELECT body FROM chunks`, from `SELECT chunk_hash FROM vec_meta`, and from `readFile` of `.sdd/index.db`. |
| 14 | Invalid embeddings flag | `embeddings: "true"`. | `loadSearchConfig` throws `search.yaml is invalid`. Search exits 1 with that sentence and no absolute path. `fastembed` is not imported. |
| 15 | Init gitignore | Fresh `initProject` with `agents: false`. | `.sdd/.gitignore` is the seven lines below. `.sdd/models` was not created. `search.yaml` contains `embeddings: false` and has no `sdd:generated` marker. |
| 16 | Report untouched | The existing unmeasured-handoff report test. | It still prints `estimated (handoff code points / 4)`. `"abcd😀"` still estimates 1. |
| 17 | Backfill when embeddings turn on | `git init`, commit `src/a.ts`, `src/b.ts`, and `src/c.ts`. `embeddings: false`. Full `index()`. Then set `embeddings: true`, install the injected embedder, and full `index()` again without editing a file. Separately, with embeddings on from the start, use an embedder that throws. Full `index()`. Swap in the working embedder. Full `index()` again with no file edit. | After the off index, chunk rows exist, `vec_meta` has 0 rows, and `fetch` was not called. After the on index, `lastIndexFilesReindexed` is 0 and every stored chunk has a `vec_meta` row. `lastIndexChunksEmbedded` is 3. On the throw path, `index()` does not throw, `vec_meta` stays empty, and the next full index writes a `vec_meta` row for every stored chunk. `index(["src/a.ts"])` after the keyword-only index, with no edit, writes no `vec_meta` row for `src/a.ts`, `src/b.ts`, or `src/c.ts`, because that call inserts no chunk. |
| 18 | Mixed RRF and BM25 | Temp project contains only the three files below, plus `.sdd/search.yaml`. No other `.md` file. Embeddings on, `k: 2`. The embedder returns a 384-d vector for every body that does not contain `codeKeyword`, and throws when the body contains `codeKeyword`. `embedQuery` for `sharedToken` succeeds. Handoff title `sharedToken`. If writing the handoff creates a change `feature.md`, overwrite that file with a single `\n` and reindex before the search that fills the retrieved section. | `chunkMarkdown` returns one chunk for each markdown file: symbol `SpecHybrid` and symbol `MemHybrid`. There is no `(preamble)` chunk and no second heading. `index()` does not throw. Both markdown chunks have `vec_meta`. The code chunk does not. The handoff `###` lines, in order, are `docs/spec-hit.md` · `SpecHybrid`, then `memory/mem-hit.md` · `MemHybrid`, then `src/code-hit.ts` · `codeKeyword`. The code hit is last even though it is the only BM25 hit in `code`. No single sort mixes the RRF numbers with the BM25 number. |

### Case 2 stdout (102 tokens)

```text
# Search
Query: zebraMarker
Scope: code
Provider: builtin
Budget: 400

### `src/a.ts` · `zebraMarker` (lines 1–3) · full
```ts
export function zebraMarker() {
  return 1;
}
```
### `src/b.ts` · `zebraMarker` (lines 1–3) · full
```ts
export function zebraMarker() {
  return 2;
}
```
```

The block ends with a newline after the last fence. `padText` is absent.

### Case 3 stdout (148 tokens)

```text
# Search
Query: zebraMarker
Scope: code
Provider: builtin
Mode: hybrid
Budget: 400

### `src/b.ts` · `zebraMarker` (lines 1–3) · full
```ts
export function zebraMarker() {
  return 2;
}
```
### `src/a.ts` · `zebraMarker` (lines 1–3) · full
```ts
export function zebraMarker() {
  return 1;
}
```
### `src/c.ts` · `padText` (lines 1–3) · full
```ts
export function padText(s: string): string {
  return s.trim();
}
```
```

The block ends with a newline after the last fence. `countTokens` is 148. Those three hits are the whole fused list. `k: 2` did not remove `padText`.

### Case 18 files

`docs/spec-hit.md` is these bytes, including the final `\n`. The first line is the only heading. Nothing before it. No second heading.

```text
# SpecHybrid

sharedToken appears in the spec.
```

`memory/mem-hit.md` is these bytes, including the final `\n`.

```text
# MemHybrid

sharedToken appears in memory.
```

`src/code-hit.ts` is these bytes, including the final `\n`.

```text
export function codeKeyword() {
  return "sharedToken";
}
```

`chunkMarkdown` drops one trailing `\n`, then sees a heading on line 1, so it does not emit `(preamble)`. Each markdown file has one heading, so it emits one chunk. `docs/spec-hit.md` is symbol `SpecHybrid`, lines 1–3, body `# SpecHybrid\n\nsharedToken appears in the spec.` `memory/mem-hit.md` is symbol `MemHybrid`, lines 1–3, body `# MemHybrid\n\nsharedToken appears in memory.` Neither body contains `codeKeyword`. The code symbol is `codeKeyword`. Each hybrid scope has one chunk, and that chunk matches `sharedToken`, so each RRF score is `1/61 + 1/61`. The tie breaks by path, and `docs/spec-hit.md` sorts before `memory/mem-hit.md`. Those two RRF hits come before the BM25 `codeKeyword` hit.

### Case 15 gitignore bytes

```text
handoff.md
active-context.md
index.db
index.db-journal
index.db-wal
index.db-shm
models/
```

## AstroApp measurement

The checkout is `/Users/harshabharadwaj/astroapp`. Do not invent a token count or a hit rate. The cells below stay blank in this plan. Cases 1–18 prove the mechanism on the fixture. They do not satisfy the landing rule. This phase does not land until `local-test-results.md` copies this table with the measured cells filled, keyword and hybrid separately, from that checkout.

Use a throwaway copy or a git worktree. Do not commit `.sdd/` into the live checkout. Do not copy the AstroApp tree into this repo.

Known-answer pairs, read from that tree. A hit counts only when the packed `###` line contains both the expected path and the expected symbol. Hit rate is hits divided by 8. Use `sdd search "<question>" --scope code --budget 12000` with yaml `k: 20`. Run the eight questions twice: `embeddings: false`, then `embeddings: true` after the five cache files exist.

| # | Question | Expected path | Expected symbol |
|---|----------|---------------|-----------------|
| 1 | `compute_panchangam` | `backend/core/src/panchangam.rs` | `compute_panchangam` |
| 2 | `panchangam for a date and place` | `backend/core/src/panchangam.rs` | `compute_panchangam` |
| 3 | `evaluate_compatibility` | `backend/core/src/compatibility.rs` | `evaluate_compatibility` |
| 4 | `match two birth charts` | `backend/core/src/compatibility.rs` | `evaluate_compatibility` |
| 5 | `compute_basic_kundali` | `backend/core/src/kundali.rs` | `compute_basic_kundali` |
| 6 | `basic kundali from a birth` | `backend/core/src/kundali.rs` | `compute_basic_kundali` |
| 7 | `matchSystemForPlace` | `frontend/src/matchSystem.ts` | `matchSystemForPlace` |
| 8 | `which milan system a place uses` | `frontend/src/matchSystem.ts` | `matchSystemForPlace` |

Token counts use one fixed question, `compute_panchangam`, on that same worktree:

- Context: `sdd context --query compute_panchangam --budget 12000`. Record `countTokens` of the bytes after `## Slices\n\n`.
- Handoff: a change titled `compute_panchangam` at stage `intent`. Record `countTokens` of the bytes between the retrieved-context markers, trimmed of one leading and one trailing newline.

Repeat both with embeddings off and with embeddings on. Write the numbers only in `local-test-results.md`.

| Run | Context tokens | Handoff retrieved tokens | Hit rate |
|-----|----------------|--------------------------|----------|
| Keyword, embeddings off | | | |
| Hybrid, embeddings on | | | |

## Out of scope this change

- Inventing AstroApp token counts or a hit rate in this spec. The blank table is filled later in `local-test-results.md`, and that file is required before merge.
- Tiered summaries, stable-prefix handoff, result cache (#24).
- MCP search adapters and a docs language matrix (#25).
- Changing `sdd cost`, `sdd report`, or the handoff code-point estimate.
- A hosted vector database, a second model, or an inbound sdd MCP server.
