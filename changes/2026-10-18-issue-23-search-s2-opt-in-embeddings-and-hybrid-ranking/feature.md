# Feature

> **Issue #23: search S2 opt-in embeddings and hybrid ranking** · `2026-10-18-issue-23-search-s2-opt-in-embeddings-and-hybrid-ranking` · 2026-10-18

## Problem / opportunity

S1 (#22) ships a git-ignored FTS5 keyword index and a token packer. A query that does not share a token with the chunk is invisible. `padText` (`return s.trim()`) is not a hit for a question that says "trim" only when the identifier is different, and it is not a hit for a paraphrase that shares no token at all.

Epic #21 phase S2 adds an optional local embedding of those same chunks and fuses it with BM25. The keyword path stays the default. A project that never turns embeddings on must keep today's stdout, including the pinned budget-120 search, and must not download a model.

## Users & value

- An operator sets `embeddings: true` in `.sdd/search.yaml` when they want hybrid search. Until they do, `sdd search`, `sdd context`, and the handoff retrieved section behave as S1.
- With embeddings on, a chunk can surface because its text is near the question even when FTS misses it, and a chunk that both rankings like can outrank a keyword-only hit. Reciprocal rank fusion is fixed, so the same index and the same question return the same text.
- A missing model, a failed download, or a broken ONNX session does not fail `sdd search` or the agent stage. The command uses keyword search and says so.
- Excluded and secret paths are still not indexed. They are not embedded either.

## Scope

- Opt-in switch `embeddings` in `.sdd/search.yaml`. Default `false`. Omitted key means `false`, so an S1 file keeps working. The model downloads only after the flag is true and the local cache is missing a file.
- One local ONNX embedder: npm `fastembed@3.0.0`, model `BAAI/bge-small-en-v1.5` (384 dimensions) via the quantized weights `Qdrant/bge-small-en-v1.5-onnx-Q`. `@huggingface/transformers` is rejected. Reasons and SPDX ids are in `design.md`.
- Vectors live in the same `.sdd/index.db`, in sqlite-vec `vec0` tables, one per scope. The index file stays git-ignored. The model cache `.sdd/models/` is git-ignored too.
- Hybrid rank: S1 FTS5/BM25 list plus a cosine k-nearest list, fused with reciprocal rank fusion, constant `RRF_K = 60`. Yaml `k` caps each source list before fusion. It does not cap the fused list. Packing walks that full order under the token budget. Embeddings off does not fuse. It keeps the S1 order.
- Incremental reindex. S1 already skips a file whose raw-byte sha256 is unchanged and honors `index(paths)`. S2 does not remove that. S2 adds a commit cursor: a full `index()` with no path list considers files `git diff` reports between that cursor and the worktree, plus untracked files, and deletes stored paths that are gone or now excluded. `index(paths)` does not move the cursor. A full index with embeddings on also embeds every stored chunk that has no vector, including chunks whose file bytes did not change. `index(paths)` embeds only the chunks it rewrote. Embeddings off writes no vectors.
- Chunks gain `chunk_hash` (sha256 of the stored body). A second chunk with the same hash copies the vector and does not call the model again.
- The S1 exclude rules apply before chunking and before embedding. `FAKE_BIRTH_RECORD_S1` is not a chunk, not a vector, and not a hybrid hit.

## Non-goals

- #24: tiered spec summaries, stable-prefix handoff, result cache.
- #25: external MCP search adapters and the docs language matrix. S2 does not dynamic-import a package named by `provider:`.
- Changing `sdd report`, `sdd cost`, or the handoff code-point estimate (`Math.floor(codePoints / 4)`, fixture `"abcd😀"` → 1). Do not edit `packages/core/src/report.ts`.
- Hosted vector databases, an inbound sdd MCP server, and a second embedding model.
- A new CLI flag for embeddings. The switch is `search.yaml` only.
- Rewriting the process half of `.sdd/handoff.md`.
- `node:sqlite`, `Promise.withResolvers`, `Array.fromAsync`, or any other API missing on Node v20.19.3.
- Removing S1 per-file hash reindex or `index(paths)`.

## Success criteria

- [ ] With `embeddings` omitted or `false`, `sdd search "function" --scope code --budget 120` on the S1 fixture prints the S1 pinned stdout (108 cl100k tokens, both hits full). No `Mode:` line. No model download. A `fetch` spy sees zero calls.
- [ ] The other S1 pins stay byte-identical in that mode: budgets 105, 30, and 19; the specs and memory blocks; context budgets 87 and 88.
- [ ] `embeddings: true` on the S2 fixture, with the injected embedder in `design.md` and `k: 2`, prints the hybrid stdout pinned in the local test plan (148 tokens, three hits). `k` does not drop the third hit. The first hit is `src/b.ts` · `zebraMarker`. `padText` is third. Keyword-only on that same fixture prints `src/a.ts` first and does not contain `padText`.
- [ ] A full index with embeddings off stores chunks and no vectors. Turning embeddings on and running a full index again, without editing files, gives every stored chunk a vector. A batch that wrote no vector is retried by the next full index. `index(paths)` does not backfill other paths.
- [ ] When specs and memory are hybrid and code fell back to keyword, the handoff lists the RRF hits first and the BM25 hits after them. It does not sort those scores on one number line.
- [ ] A throwing embedder, or a missing model file, prints `Embeddings are unavailable. Using keyword search.` on stderr for `sdd search`, exits 0, and stdout is the keyword result with no `Mode:` line. Context stays `ok: true` and adds that sentence as a gap. Handoff still writes. The stage does not fail.
- [ ] Once the five cache files are present, a second search does not call `fetch`. Two searches of the same index return byte-identical stdout.
- [ ] Editing one file reindexes only that file. `lastIndexFilesReindexed` is 1. Chunks of the other file keep their hash. A full index after a dirty edit updates the dirty file and does not move `indexed_commit` off `HEAD`. `index(["src/b.ts"])` does not rewrite `src/a.ts` and does not write the cursor.
- [ ] Deleting a committed file removes its chunk rows and its vector rows on the next full index.
- [ ] With embeddings on, `FAKE_BIRTH_RECORD_S1` and `fake-secret-s1-do-not-index` are absent from chunk bodies, from `vec_meta`, from the database file bytes, from hybrid stdout, from context, and from the handoff. The embedder is not called with those strings.
- [ ] Fresh init gitignores `index.db` and its sidecars and `.sdd/models/`. `embeddings: false` does not create `.sdd/models`.
- [ ] `sdd report` / `sdd cost` still estimate an unmeasured handoff as code points / 4.
- [ ] Before merge, `local-test-results.md` records the AstroApp table in the local test plan: keyword and hybrid, separately, for handoff tokens, context tokens, and hit rate on the named pairs. The cells in this spec stay blank. Fixture cases do not replace that table.

## AstroApp

The checkout is on this machine at `/Users/harshabharadwaj/astroapp` (README title "AstroApp — Vedic Astrology"). Rust core symbols used as known answers live under `backend/core/src/`. The TypeScript symbol lives in `frontend/src/matchSystem.ts`. This spec does not record before/after handoff token counts, context token counts, or a hit rate. Those figures were not measured. Inventing them would be false.

Fixture cases prove the mechanism. They do not by themselves let this phase land. The phase does not land until `local-test-results.md` records the AstroApp measurements, keyword and hybrid separately, from that checkout. The known-answer pairs and the blank table are in `local-test-plan.md`. Do not copy AstroApp into this repo and do not point `sdd` at the live checkout in a way that commits `.sdd/` there.

## Risks / open questions

Decisions are locked in `design.md`. No product choice is left open.

- `fastembed` and `sqlite-vec` are native addons. Keyword mode must not import them. A failure to load them is the embedding fallback, not a failed stage.
- ONNX float output can differ across CPUs. CI pins the injected embedder, not raw ONNX bytes. The real model is required only to honor the cache and fallback rules.
- BM25 floats stay unpinned, as in S1. The S2 fixture uses equal BM25 scores and path order so the keyword ranks are 1 and 2 without depending on the float.
- AstroApp number cells stay blank in this spec because they have not been measured. Filling `local-test-results.md` from the checkout is required before merge. It is not optional.
