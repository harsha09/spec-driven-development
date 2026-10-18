# Tasks

> **Issue #23: search S2 opt-in embeddings and hybrid ranking** · `2026-10-18-issue-23-search-s2-opt-in-embeddings-and-hybrid-ranking`

## Breakdown

- [x] Add `fastembed@3.0.0` and `sqlite-vec@0.1.9` to `packages/core` dependencies. Pin `@huggingface/hub@2.7.1` and `@anush008/tokenizers@0.6.0` with pnpm overrides. Do not add `@huggingface/transformers` or `onnxruntime-web`. Mark `fastembed`, `sqlite-vec`, `onnxruntime-node`, `@huggingface/hub`, and `@anush008/tokenizers` external in `packages/core/tsup.config.ts`.
- [x] Extend `search.yaml` with `embeddings` boolean, default `false`. Ship the exact default body from `design.md`. An omitted key stays false. A non-boolean fails with `search.yaml is invalid`.
- [x] Add `chunk_hash` to `chunks`, migrate S1 databases with the `ALTER TABLE` in `design.md`, and backfill sha256 of `body`. Add `vec_meta`. Do not rebuild FTS and do not change `files.content_hash`.
- [x] Add `embed.ts`, `vec.ts`, and `rrf.ts`. Dynamic-import `fastembed` and `sqlite-vec` only on the branches `design.md` names. `RRF_K` is 60. The fastembed adapter uses `EmbeddingModel.BGESmallENV15`, CPU only, cache `.sdd/models/fastembed`, and does not prefix twice.
- [x] Full `index()` with no path list uses the commit cursor when it is valid, includes a dirty worktree and untracked files, and deletes gone or excluded paths. `index(paths)` does not read or write `indexed_commit` and still rewrites only the named paths. No `.git` keeps the S1 walk.
- [x] On rewrite, copy a vector when `chunk_hash` already has one. Otherwise embed the raw body when embeddings are on. A full index with embeddings on then backfills every stored chunk that has no `vec_meta` row, including unchanged files and a batch that failed last time. `index(paths)` does not backfill other paths. Embeddings off writes no vectors and does not download a model. `last_chunks_embedded` counts model calls only.
- [x] Search: keyword path unchanged when embeddings are off or the scope is not hybrid-ready. Hybrid path runs the cosine KNN in `design.md` and fuses. Do not cut the fused list to `k`. `Mode: hybrid` is inserted only when fusion runs. Fallback warning is exactly `Embeddings are unavailable. Using keyword search.` One scope missing vectors does not force the other scopes off hybrid.
- [x] Point context at the fused list only when `code` is hybrid-ready. Handoff merges with the comparator in `design.md`: all-keyword stays S1 BM25 order; if any hit is RRF, those hits come first by RRF descending, then keyword hits by BM25 ascending. Context gap `embeddings_unavailable` on fallback. Handoff still writes and does not put the warning inside the markers.
- [x] Append `models/` to `.sdd/.gitignore` required lines. Do not create `.sdd/models` when embeddings are off. Update `init-force.test.ts`.
- [x] Add the S2 fixture and cases 1–18 in `local-test-plan.md`, including backfill and the mixed-scope handoff. The S1 budget-120 stdout test stays byte-identical with embeddings off. Do not edit `packages/core/src/report.ts`. The AstroApp table is recorded in `local-test-results.md` before merge. Do not invent its numbers in the spec.
- [x] Add the two doc sentences from `design.md`. Do not change the `sdd report` estimate paragraph and do not add a language matrix.

## Traceability

| Task | Story / design ref |
|------|--------------------|
| Pins and tsup external | Licenses; Rejected transformers.js |
| `embeddings` key | Config file |
| `chunk_hash`, `vec_meta` | Index schema |
| Embedder, sqlite-vec, RRF | Embedder; Vectors; Reciprocal rank fusion |
| Commit cursor and `index(paths)` | Commit cursor |
| Hash copy, backfill, embed count | Vectors; Backfill |
| Stdout, fallback warning, fused list not cut to `k` | What sdd search prints; Reciprocal rank fusion |
| Context and handoff merge | Query; mixed RRF and BM25 comparator |
| `models/` gitignore | Gitignore |
| Fixture tests | `local-test-plan.md` |
| Docs | CLI and docs |
