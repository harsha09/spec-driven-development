# Local test plan

> **Issue #24: tiered spec summaries, stable-prefix handoff, result cache** · `2026-10-19-issue-24-tiered-spec-summaries-stable-prefix-handoff-result`

## Environment

- How to run locally: from the repo root, `pnpm test`, then `pnpm typecheck` and `pnpm lint`. Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected. Do not publish and do not download an embedding model.
- `countTokens` is `encode(text).length` from `gpt-tokenizer/encoding/cl100k_base`. The en dash in slice headings is U+2013.
- Branch: `feat/issue-24-tiered-summaries` from `bc7f2be218408aec38302b25b761e362b80be8b3`. Embeddings stay off in the fixture `search.yaml` files.
- The S1 and S2 suites stay. Budget 120 code search stays 108 tokens, both hits `full`, with no `· summary` and no cache banner.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Summary pin | Run `extractiveSummary` on the design fixture body. | Body is 532 tokens. Summary is 80 tokens, ends at `tailword5`, and does not contain `tailword6`. A body at or under 80 tokens is unchanged. |
| 2 | Active change stays full | Pack one spec under the active change directory and one spec outside it. | The active chunk is `· full`. The other chunk is `· summary` when the summary differs from the body. Code is never `· summary`. |
| 3 | Warm code search | Search the S1 corpus for `function` at budget 120 twice. | The second stdout equals the first. A `result_cache` row exists. Token count stays 108. |
| 4 | Per-file invalidation | Cache a hit that lists only file B, then edit file A. | B's `cache_key` and `spec_summaries` rowid stay. A's cache row is gone. |
| 5 | Private markers | Index the S1 exclude fixture and search the two marker strings. | `FAKE_BIRTH_RECORD_S1` and `fake-secret-s1-do-not-index` are absent from `.sdd/index.db`. No `result_cache` row is stored for those queries. |
| 6 | Summarizer throw | Make `extractiveSummary` throw, then pack. | The chunk is `· full`. The embeddings fallback sentence is absent. Handoff still exits. |
| 7 | Stable prefix | Build prompts for `clarify_intent` and `clarify_design` on one feature change titled `Stable prefix`. | The text before `\n## Stage\n` matches. Neither prefix contains those stage ids. The handoff banner has no `· stage **`. |
| 8 | Context cache | Run `generateCodeContext` twice on the same query. | Bytes after `## Slices\n\n` match. The second call does not rank again. |
| 9 | AstroApp | Throwaway worktree of astroapp at `5632de076130300a94aac60fd96fe6fa0c86fa5b`. Keyword search, context, and handoff, before this change and after it. | After hit rate is not lower than the before hit rate. The second context and the second handoff match the first token counts. Cells go in `local-test-results.md` only. |

## Out of scope this change

- `sdd cost`, `packages/core/src/report.ts`, metrics schema, and MCP search.
- A new `search.yaml` key, a new dependency, and a global cache generation counter.
- Filling the AstroApp cells inside `feature.md`.
