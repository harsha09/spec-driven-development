# Local test results

> **Issue #23: search S2 opt-in embeddings and hybrid ranking** · `2026-10-18-issue-23-search-s2-opt-in-embeddings-and-hybrid-ranking`

## Results

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | S1 corpus with `embeddings` omitted. Budget 120 stdout is the S1 block, 108 tokens, no `Mode: hybrid`. Budgets 105, 30, and 19 are 102, 20, and 0 tokens. Context budgets 87 and 88 are 82 and 88 tokens. `fetch` was not called. `.sdd/models` was not created. `fastembedImportCount` did not change. |
| 2 | PASS | Embeddings off, `k: 2`, query `zebraMarker`, budget 400. Stdout is 102 tokens. It does not contain `padText` or `Mode:`. |
| 3 | PASS | Injected embedder, embeddings on, `k: 2`, budget 400. Stdout is 148 tokens, byte-identical on the second run, no warning. Three hits: `src/b.ts` · `zebraMarker`, `src/a.ts` · `zebraMarker`, `src/c.ts` · `padText`. |
| 4 | PASS | `fuseHits` with keyword ranks a=1, b=2 and vector ranks c=1, b=2. Scores are `1/31`, `1/61`, `1/61`. Order is b, a, c. |
| 5 | PASS | A throwing embedder factory falls back. Stderr is `Embeddings are unavailable. Using keyword search.` Stdout equals case 2. No `Mode:` line. The temp path is absent. |
| 6 | PASS | Same factory. Context `ok` is true and the gap is `embeddings_unavailable` with that sentence. Slice text has no `padText`. The handoff exists. The retrieved section has neither the warning nor `padText`. |
| 7 | PASS | Context and handoff `###` lines are the case 3 order. Context has no `Mode:` line. Default `memory/*.md` was removed before the change was created so those chunks are not in the handoff. |
| 8 | PASS | Case 1 records zero `fetch` calls. An init throw on an empty cache deletes the model directory. Five non-empty cache files stay in place when init throws after that. |
| 9 | PASS | Two files with the same body. Chunks reindexed 2, chunks embedded 1, one embedder call, equal `vec_meta` hashes. |
| 10 | PASS | After a full index, `indexedCommit` is HEAD and 2 files were reindexed. `index(["src/b.ts"])` keeps the committed `src/a.ts` body, stores `// b` inside the `src/b.ts` chunk, and does not move `indexedCommit`. |
| 11 | PASS | A dirty edit of `src/a.ts` reindexes 1 file, leaves `src/b.ts` `content_hash` unchanged, and keeps the old HEAD. After that edit is committed, `indexedCommit` moves and `lastIndexFilesReindexed` is 0. |
| 12 | PASS | Deleting committed `src/a.ts` removes its chunk and `vec_meta` rows. Search does not print `src/a.ts`. `src/b.ts` remains. |
| 13 | PASS | `FAKE_BIRTH_RECORD_S1` and `fake-secret-s1-do-not-index` are absent from embedder inputs, stdout (except the `Query:` line), context, the handoff, `chunks.body`, `vec_meta`, and the bytes of `.sdd/index.db`. |
| 14 | PASS | `embeddings: "true"` throws `search.yaml is invalid` before `fastembed` is imported. |
| 15 | PASS | Fresh init writes the seven gitignore lines, ending in `models/`. `.sdd/models` is not created. `search.yaml` contains `embeddings: false` and has no `sdd:generated` marker. `init-force.test.ts` expects `models/` on the force-merge fixture. |
| 16 | PASS | `packages/core/src/report.ts` has no diff. `report.test.ts` still prints `estimated (handoff code points / 4)`. `"abcd😀"` still estimates 1. |
| 17 | PASS | Keyword index writes chunks and zero `vec_meta` rows. Turning embeddings on backfills 3 vectors with `lastIndexFilesReindexed` 0. A throwing factory leaves `vec_meta` empty and does not throw. A later full index with a working embedder fills every chunk. `index(["src/a.ts"])` after a keyword index writes no `vec_meta` rows. |
| 18 | PASS | One chunk each for `SpecHybrid`, `MemHybrid`, and `codeKeyword`. Both markdown chunks have `vec_meta`. The code chunk does not. Handoff order is spec, memory, then the keyword-only code hit. |

## AstroApp measurement

Checkout `/Users/harshabharadwaj/astroapp` at `5632de076130300a94aac60fd96fe6fa0c86fa5b`. Measured on a detached throwaway worktree `/tmp/astroapp-s2-measure`, then removed. Nothing was committed there. The live checkout was not modified.

That tree already has `.sdd/` committed and has no `.sdd/search.yaml`, so `sdd init` refuses. The shipped default `packages/core/defaults/search.yaml` was copied into the worktree only. It has `k: 20`, `embeddings: false`, and `intent: 4000`. Commands used this branch's `packages/cli/dist/index.js`.

A hit is a packed `###` line that contains both the expected path and the expected symbol. Hit rate is hits divided by 8. Search used `--scope code --budget 12000`. Context used `sdd context --query compute_panchangam --budget 12000`. The handoff is a feature change titled `compute_panchangam` at stage `intent`, and the token count is `countTokens` of the bytes between the retrieved-context markers, trimmed of one leading and one trailing newline. `countTokens` is `cl100k_base`.

Hybrid ran only after these five cache files were non-empty: `model_optimized.onnx` (66465124 bytes), `tokenizer.json` (711396), `tokenizer_config.json` (1242), `config.json` (706), `special_tokens_map.json` (695). Every hybrid search printed `Mode: hybrid`. No search, context, or handoff contained `Embeddings are unavailable. Using keyword search.`

Question 4's matching heading is `evaluate_compatibility_with`, which contains `evaluate_compatibility`. The same heading is the hybrid match for questions 3 and 4. Question 3's keyword match is the exact `evaluate_compatibility` heading. Question 8 matched neither run.

| Run | Context tokens | Handoff retrieved tokens | Hit rate |
|-----|----------------|--------------------------|----------|
| Keyword, embeddings off | 5406 | 3945 | 6/8 |
| Hybrid, embeddings on | 11993 | 3996 | 7/8 |

| # | Question | Keyword | Hybrid |
|---|----------|---------|--------|
| 1 | `compute_panchangam` | hit | hit |
| 2 | `panchangam for a date and place` | miss | hit |
| 3 | `evaluate_compatibility` | hit | hit |
| 4 | `match two birth charts` | hit | hit |
| 5 | `compute_basic_kundali` | hit | hit |
| 6 | `basic kundali from a birth` | hit | hit |
| 7 | `matchSystemForPlace` | hit | hit |
| 8 | `which milan system a place uses` | miss | miss |

## Commands run

```bash
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/search-s2.test.ts src/__tests__/search-s1.test.ts src/__tests__/init-force.test.ts
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/report.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

Search S2: 16 passed. Search S1: 12 passed. Init force: 10 passed. Report: 11 passed. Typecheck and lint passed. Full `pnpm test`: core 31 files, 223 passed; CLI 3 files, 37 passed.

Node v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected on this machine.

## Sign-off

- Tested by: QA
- Date: 2026-10-18
- Verdict: PASS
- Product owner: approved the code and the docs

---

## Latest run (2026-10-18T07:38:17.351Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="c5456af4f75b19d2bf26a30767677f50490d8a8d" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
