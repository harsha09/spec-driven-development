# Tasks

> **Issue #24: tiered spec summaries, stable-prefix handoff, result cache** · `2026-10-19-issue-24-tiered-spec-summaries-stable-prefix-handoff-result` · 2026-10-19

Implement `design.md`. Do not invent a second summary algorithm, a global index generation, or an AstroApp number. Do not edit `packages/core/src/report.ts`.

## Pack-time summary

- [x] Add `packages/core/src/search/summarize.ts` with `SUMMARY_TOKEN_CAP = 80` and `extractiveSummary(signature, body)` exactly as in `design.md`. Import `decode` and `encode` from `gpt-tokenizer/encoding/cl100k_base`. Export both symbols from `packages/core/src/search/index.ts`. Do not add a dependency and do not edit `packages/core/package.json`.
- [x] Pin the fixture in `design.md`: body token count 532, summary token count 80, summary bytes equal to the pinned `SpecAnswerHeading` string, `tailword6` absent. A body at or under 80 tokens, including the S1 Alpha-section body and the S1 preamble, is returned unchanged. `(preamble)` is not inserted into the body.
- [x] Extend `renderBlock` and `SearchHit.form` with `summary`. The `###` line keeps today’s en dash. The fence body for `summary` is the summary string. Do not add a cache banner or a `Mode:` line.
- [x] In `packHits`, drop a later hit with the same `path`, `symbol`, and `startLine`. Then keep the contained-range dedup, and only a hit packed as `full` is an outer. For a non-empty summary that differs from `body`, try the summary block first. If it does not fit, or the summary is missing or empty, use today’s full-then-signature path. Do not emit both forms.
- [x] Do not change `generateCodeContext` reason strings. It packs scope `code` only, so it never emits `· summary`.

## Storage

- [x] Add `spec_summaries`, `result_cache`, and `result_cache_files` with the columns in `design.md`. `CREATE TABLE IF NOT EXISTS` from `openDb`. Do not add a column to `chunks` and do not rebuild unrelated chunk rows.
- [x] Build a summary only from an indexed chunk body, lazily at pack time. Lookup is path + file `content_hash` + symbol + `start_line`. A hit does not call `extractiveSummary` and does not `UPDATE` the row. A miss inserts the row and deletes other hashes for that path only.
- [x] In `deletePath`, delete that path’s `spec_summaries` rows and the `result_cache` rows listed for that path in `result_cache_files`. Equality on the path, not `LIKE`. Do not delete cache rows that omit the path. Do not bump a `meta` generation.
- [x] Decide the summary from the scope rules in `design.md`. Active change for a handoff is `ctx.displayPath`. Active change for `executeSearch` and for the context cache key is `displayChangePath(config, id)` after reading `activePointerPath`. If that pointer is missing, empty, absolute, or contains a backslash or an empty, `.`, or `..` segment, the directory is `""`. Do not treat the bare id as the directory. `docs/` and `archive/` are specs outside that directory, so they summarize. Code never summarizes. The active change’s spec chunks stay full-then-signature.
- [x] Pass the active directory into `buildRetrievedInner`. Do not read `.active` from the handoff path.

## Result cache

- [x] Implement the length-prefixed key, the contributor text, and `index_version` from `design.md`. The query string is not trimmed or lowercased. Context `filter` is sorted paths, then `\n/\n`, then sorted symbols. Search and handoff use empty filter lists.
- [x] On a search or handoff hit, return the stored `text` unchanged and set `usedTokens` with `countTokens`. On a context hit, splice that text after `## Slices\n\n` and do not replace the frame. Do not call `rankScope`, `listScopeHits`, `packHits`, or the embedder. The context query is the string passed to `rankScope`, or `""` when `listScopeHits` is used. Validate contributor hashes and `hybrid_scopes` as in `design.md`. A bad payload is a miss. Do not insert `result_cache` or `result_cache_files` when the raw query or the payload text contains `FAKE_BIRTH_RECORD_S1` or `fake-secret-s1-do-not-index`. A read of such a row deletes it and packs again.
- [x] On a miss, rank and pack as today, then insert the cache row and one `result_cache_files` row per contributor. A write failure is ignored. Do not cache `Retrieved context skipped:`.
- [x] Warm S1 code search at budget 120 is byte-identical to the cold stdout (108 tokens, both hits `full`, no `· summary`, no banner). Specs and memory S1 pins stay `full` because those bodies are under the cap.
- [x] Editing file A drops cache rows that list A and leaves a row that lists only B, including that row’s `cache_key`. B’s `spec_summaries` rowid does not change. A’s summary is rebuilt from A’s new hash only.

## Handoff prefix

- [x] Reorder `buildAgentPrompt` to the stable prefix and volatile tail in `design.md`. Join with `\n`. Do not rewrite the constraint bullets, the artifact bullets, the code-context lines, or the closing `sdd next` sentence.
- [x] Move `- Current stage:` out of `## Change` into `## Stage`. The prefix ends before `\n## Stage\n` and does not include the stage goal, instructions, current-stage artifacts, MCP, retrieved context, or the closing sentence.
- [x] Remove ` · stage **${stage}**` from the `writeAgentHandoff` banner. Keep the two trailing spaces on the `Generated` line. Do not change `formatStatus` or the active-context banner.
- [x] Test one feature change titled `Stable prefix` at `clarify_intent` and `clarify_design`. The `buildAgentPrompt` prefixes match and neither prefix contains those stage ids. `.sdd/handoff.md` shares that leading material. Each tail contains its own stage id.

## Fallback, exclude, contracts that stay

- [x] A thrown summarizer or a thrown cache read/write packs full-then-signature, does not throw from handoff, and does not add a sentence inside the retrieved-context markers. Do not reuse `Embeddings are unavailable. Using keyword search.` for that failure. Real config, index, and rank failures still use `Retrieved context skipped:` via `safeMessage`. No absolute path.
- [x] With the S1 exclude fixture, `FAKE_BIRTH_RECORD_S1` and `fake-secret-s1-do-not-index` are absent from `spec_summaries`, `result_cache`, `result_cache_files`, handoff, context, budgeted search text, and the bytes of `.sdd/index.db`. Searching for either string does not insert a cache row and is not served from the cache. The string may appear on a stdout `Query:` line only.
- [x] Summaries and the cache perform no `fetch` and do not import `fastembed` when embeddings are off. Same inputs produce the same summary bytes and the same handoff prefix.
- [x] Do not edit `report.ts`. The `"abcd😀"` estimate stays 1. Do not change `costFor` or the metrics schema. Do not add a `search.yaml` key or bump version from 1. `k: 0` still throws `search.yaml is invalid`. Embeddings default stays false. `RRF_K` stays 60. FTS bodies stay full text. Summary text is not embedded.
- [x] Do not add a gitignore line. The new rows live in `.sdd/index.db`.
- [x] Code-only embeddings-off blocks stay byte-identical, including context budgets 87 and 88 and the S1 `function` handoff inner text at budget 87. A handoff that packs an over-cap spec or memory chunk is `· summary` and is no longer the S1 inner text. The `###` line for that heading is still present at the same `k`, and `chunks.body` still contains the cut tail.

## Docs and tests

- [x] Add the two short paragraphs named in `design.md` to `docs/reference/cli.md` and `docs/reference/agents.md`. Do not rewrite the embeddings paragraph or the code-point estimate paragraph. Do not mention `sdd cost`. Do not edit `docs/guides/code-context.md`.
- [x] Add `packages/core/src/__tests__/search-s3.test.ts` for the pins above. Extend an S1 or S2 test only when the new prefix or a summary form makes an old assertion wrong. Do not weaken the budget-120 equality. No CLI test unless stdout changes. The S1 code pin must stay, so no CLI change is expected.
- [x] Do not edit `.sdd/workflows/feature.yaml` or `packages/core/defaults/workflows/feature.yaml`. Local verify already runs `pnpm test`.

## AstroApp measurement

Write this table into `local-test-results.md` during local verify. Cells stay blank until that run. Do not copy the S2 keyword counts or the S2 hybrid counts into the before row. Method is the AstroApp section of `feature.md`: worktree of `/Users/harshabharadwaj/astroapp` at `5632de076130300a94aac60fd96fe6fa0c86fa5b`, copied default `search.yaml`, embeddings off, no commit of `.sdd/`, worktree removed afterward.

- [x] Record the before keyword run with a CLI that does not contain this change, then the after keyword run with this change’s CLI. Hit rate is hits/8 on the eight questions. Context is `sdd context --query compute_panchangam --budget 12000`, counted after `## Slices\n\n`. Handoff is `sdd new "compute_panchangam" -w feature --no-agent`, then `sdd agent --print --no-agent` with no `--budget`, counted from `.sdd/handoff.md` between the retrieved-context markers. Do not count `sdd agent` stdout. The second context command and the second `sdd agent --print --no-agent` are cache hits: a `result_cache` row exists before the second command, and the token count equals the first. The after hit rate is not lower than the before hit rate.

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

## Checks

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
