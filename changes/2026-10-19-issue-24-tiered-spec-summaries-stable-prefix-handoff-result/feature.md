# Feature

> **Issue #24: tiered spec summaries, stable-prefix handoff, result cache** · `2026-10-19-issue-24-tiered-spec-summaries-stable-prefix-handoff-result` · 2026-10-19

## Problem / opportunity

S1 (#22) and S2 (#23) put whole spec and memory chunks into the handoff whenever they fit the stage budget. The keyword index is full text, which is what makes a search find a heading, but the packed block then repeats the whole section. On a feature workflow the intent budget is 4000 tokens. Related change packs and `memory/` compete with the active change.

The handoff is also rebuilt on every stage. `buildAgentPrompt` puts the current stage id, the stage goal, and the stage instructions before the standing constraints. A prompt cache cannot reuse the leading bytes across stages of one change.

Every `sdd search`, `sdd context`, and handoff rebuilds the pack from SQLite even when the query and the file hashes have not changed.

Epic #21 phase S3 is this change. `sdd cost` is #26. It is not in this change.

## Users & value

- An agent reading the handoff still sees the active change in full. Related change-pack markdown and memory pages arrive as a short extractive summary, so the same budget can keep the active change and the code hits.
- Two handoffs of one change, at two stages, share a leading byte prefix that does not name either stage. The stage goal, the instructions, MCP, and the retrieved chunks stay at the end.
- A second identical search, context build, or handoff reuses the packed text. The stdout does not grow a cache banner. Keyword ranking stays the S1/S2 ranking, because the FTS body stays the full chunk.

## Scope

- Pack-time summaries for spec and memory chunks. The active change directory is packed as today (`full`, else `signature`). Other specs-scope markdown whose path is not under that directory, and every memory-scope chunk, is packed as a summary when one is available and shorter than the body. Code chunks are never summarized.
- The summary is extractive and local. It keeps the heading line and the symbol, and it is capped at 80 cl100k tokens on a token boundary. It is cached by repo-relative path plus the file `content_hash` the indexer already stores. A one-byte edit of file A does not rebuild file B’s summary.
- A result cache keyed by the query, scope, `k`, budget, embeddings on/off, and an index version. The index version is a hash of the content hashes of the files that contributed to that result. It is not a global counter. An unrelated file edit does not flush entries that do not list that file.
- Reorder `buildAgentPrompt` so the stable prefix comes first and the stage-specific tail comes last. Drop the stage id from the leading `.sdd/handoff.md` banner so the file shares that prefix.
- The existing exclude list runs before a summary is stored and before a cache row is written. No new search.yaml key. Embeddings stay off by default. `RRF_K` stays 60.

## Non-goals

- #26: `sdd cost`, `sdd report`, the metrics schema, `costFor`, and the handoff code-point estimate (`Math.floor(codePoints / 4)`, fixture `"abcd😀"` → 1). Do not edit `packages/core/src/report.ts`.
- #25: external MCP search adapters and a docs language matrix.
- Replacing FTS chunk bodies with summaries. The keyword index stays full text. Summary text is not embedded. Hybrid ranking is unchanged.
- A new npm dependency, an LLM call, a `fastembed` call, or a model download for summaries or for the cache.
- A new `search.yaml` key or a version bump. Invalid yaml still throws exactly `search.yaml is invalid`.
- A cache banner, a `Mode:` line, or a summary label on the pinned S1 code search (embeddings off, budget 120).
- Rewriting the S1/S2 embeddings paragraphs in the docs.
- Filling AstroApp number cells in this spec.

## Success criteria

- [ ] With embeddings off, `sdd search "function" --scope code --budget 120` on the S1 fixture prints the pinned S1 stdout (108 cl100k tokens, both hits `full`). A warm result cache prints the same bytes. No cache banner, no `Mode:` line, no `· summary`.
- [ ] Code-only packed blocks with embeddings off stay byte-identical to S1, including context budgets 87 and 88 and the handoff inner text for the S1 title `function` at budget 87. The S2 rule that embeddings-off handoff inner text is byte-identical to S1 no longer holds once a spec or memory chunk is in summary form.
- [ ] A spec heading that full packing returns at a fixed `k` is still returned when summary packing is on. The packed `###` line contains the path and the symbol, and the fence still contains the heading line. The FTS body still contains the uncut section. Code chunks never use `· summary`.
- [ ] The active change’s spec chunks stay `full` or `signature`. A chunk under another change, under `archive/`, under `docs/`, or under `memory/` uses the summary when the body is over 80 tokens.
- [ ] The same file bytes produce the same summary bytes. Editing file A does not change file B’s stored summary. A cached query whose contributor list does not include A still hits. A cached query that lists A is dropped and recomputed. No single index generation is bumped.
- [ ] `FAKE_BIRTH_RECORD_S1` and `fake-secret-s1-do-not-index` are absent from summaries, `result_cache`, `result_cache_files`, the handoff, budgeted context, and the bytes of `.sdd/index.db`. A query or payload that contains either string is not inserted and is not served from the cache. That search is packed again. The string may appear only on a stdout `Query:` line.
- [ ] Summaries and the result cache work with the network off and with no model download. A thrown summarizer or a thrown cache read/write falls back to today’s full/signature pack, does not throw from handoff, and does not add a sentence inside the retrieved-context markers.
- [ ] Two `buildAgentPrompt` results for one change at stages `clarify_intent` and `clarify_design` share a byte prefix that ends immediately before the `## Stage` line and does not contain either stage id. `.sdd/handoff.md` starts with that same stable material. The stage id is only in the tail.
- [ ] `sdd report` / `sdd cost` are unchanged. `packages/core/src/report.ts` has no diff.
- [ ] Before merge, `local-test-results.md` records the AstroApp table below. The cells in this spec stay blank. The S2 results file is a previous phase. Do not copy its counts into this table.

## AstroApp

The checkout is `/Users/harshabharadwaj/astroapp` at commit `5632de076130300a94aac60fd96fe6fa0c86fa5b`. Use a throwaway git worktree. Do not commit `.sdd/` into the live checkout. Do not copy the AstroApp tree into this repo. Delete the worktree when the run is done.

That commit already has `.sdd/` tracked and has no `.sdd/search.yaml`, so `sdd init` refuses. Copy this repo’s `packages/core/defaults/search.yaml` into the worktree as `.sdd/search.yaml` and do not commit it. Leave `embeddings: false`. That file has `k: 20` and `budgets.intent: 4000`.

This spec does not record before or after token counts or a hit rate. Those figures are not this phase’s measurements yet. Inventing them, or pasting the S2 keyword row (or the S2 hybrid row) into the before cells, would be false. Fixture tests do not replace the table.

Run the keyword measurements twice. The before run uses a CLI built from this repo without this change. The after run uses a CLI built from this change. Same worktree, same `search.yaml`, embeddings off. Commands are this repo’s CLI, not a globally installed one.

A hit is a packed `###` line that contains both the expected path and the expected symbol. Hit rate is hits divided by 8. Questions:

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

For each question: `sdd search "<question>" --scope code --budget 12000`.

Token counts use the question `compute_panchangam` and `countTokens` (`cl100k_base`):

- Context: `sdd context --query compute_panchangam --budget 12000`. Count the bytes after the exact marker `## Slices\n\n`. If that marker is missing, the run is invalid. Do not write 0.
- Handoff, from the worktree, with no `--budget`: `sdd new "compute_panchangam" -w feature --no-agent`, then `sdd agent --print --no-agent`. Stage `intent` uses `budgets.intent` from the copied yaml. Count the bytes in `.sdd/handoff.md` between `<!-- retrieved-context:start -->` and `<!-- retrieved-context:end -->`, after removing one leading newline and one trailing newline when those newlines are present. Do not count `sdd agent` stdout. Do not trim spaces. Do not strip more than one newline on each side.

Run the context command twice back to back before `sdd new`. After `sdd new`, run `sdd agent --print --no-agent` twice back to back. Do not edit a file between a pair. Do not pass `--budget` on either agent command. Before the second command of each pair, `result_cache` in the worktree’s `.sdd/index.db` has a row for that query. The second token count must equal the first. The product prints no cache banner. Record the equality in `local-test-results.md`.

The after keyword hit rate on these 8 questions must not be lower than the before keyword hit rate from this same measurement. That comparison is written in `local-test-results.md`, not here.

| Run | Context tokens | Handoff retrieved tokens | Hit rate |
|-----|----------------|--------------------------|----------|
| Keyword, embeddings off, before this phase | | | |
| Keyword, embeddings off, after this phase, first build | | | |
| Keyword, embeddings off, after this phase, second build (cache hit) | | | |

| # | Question | Before | After |
|---|----------|--------|-------|
| 1 | `compute_panchangam` | | |
| 2 | `panchangam for a date and place` | | |
| 3 | `evaluate_compatibility` | | |
| 4 | `match two birth charts` | | |
| 5 | `compute_basic_kundali` | | |
| 6 | `basic kundali from a birth` | | |
| 7 | `matchSystemForPlace` | | |
| 8 | `which milan system a place uses` | | |

## Risks / open questions

Decisions are locked in `design.md`. No product choice is left open.

- A cache entry stays valid when a file it does not list changes, including when that edit would add a new hit. That is the opposite of a global generation counter. It is accepted. Do not “fix” it by hashing every file in the index.
- The summary label is longer than `full`. The packer still falls through to today’s full-then-signature path, so a hit full packing kept is not dropped.
- `.sdd/active-context.md` still starts with `formatStatus` and a banner that names the stage. It is not the cache prefix. Do not reorder that status block.
- AstroApp cells stay blank here because they have not been measured for this phase. Filling `local-test-results.md` from the worktree is required before merge.
