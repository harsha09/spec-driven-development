# Local test results

> **Issue #24: tiered spec summaries, stable-prefix handoff, result cache** · `2026-10-19-issue-24-tiered-spec-summaries-stable-prefix-handoff-result`

## Results

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | `pnpm test`: core 32 files, 236 passed. CLI 3 files, 38 passed. |
| 2 | PASS | `pnpm typecheck` and `pnpm lint` exited 0. Node v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected. |
| 3 | PASS | S1 budget-120 code search stays 108 tokens, both hits `full`, with no `· summary` and no cache banner. The secrets test allows `nestedHidden` and `hiddenSkip` only as cached query text. `FAKE_BIRTH_RECORD_S1`, `fake-secret-s1-do-not-index`, and `NESTED_JHD_SECRET` stay absent from the index bytes. |
| 4 | PASS | AstroApp keyword hit rate after this change is 6/8, the same as the before run on this measurement. It is not lower. |

## AstroApp measurement

Checkout `/Users/harshabharadwaj/astroapp` at `5632de076130300a94aac60fd96fe6fa0c86fa5b`. Measured on a detached throwaway worktree `/tmp/astroapp-s3-measure`, then removed. Nothing was committed there. The live checkout was not modified.

That tree already has `.sdd/` committed and has no `.sdd/search.yaml`, so `sdd init` refuses. This repo’s `packages/core/defaults/search.yaml` was copied into the worktree only. It has `k: 20`, `embeddings: false`, and `budgets.intent: 4000`. The tree was reset between the two CLIs: tracked files restored, untracked files removed, and `.sdd/index.db` deleted. The same `search.yaml` was copied again. No source file was edited between the two context commands or between the two agent commands.

The before CLI was built in `/tmp/sdd-s3-before` from `bc7f2be218408aec38302b25b761e362b80be8b3`, which does not contain this change. The after CLI was `packages/cli/dist/index.js` from this branch. Neither command used the globally installed `sdd`.

A hit is a packed `###` line that contains both the expected path and the expected symbol. Hit rate is hits divided by 8. Each question used `sdd search "<question>" --scope code --budget 12000`. Context used `sdd context --query compute_panchangam --budget 12000`, counted with `cl100k_base` on the bytes after `## Slices\n\n`. Handoff used `sdd new "compute_panchangam" -w feature --no-agent`, then `sdd agent --print --no-agent` with no `--budget`. The token count is `cl100k_base` of `.sdd/handoff.md` between the retrieved-context markers, after removing one leading newline and one trailing newline. `sdd agent` stdout was not counted.

Context ran twice before `sdd new`. The agent command ran twice after it. Before the second context command, `result_cache` had a row for query `compute_panchangam` and channel `context`. Before the second agent command, it had a row for that query and channel `handoff`. The second context count equals the first. The second handoff count equals the first. No search, context, or agent output contained a cache banner.

The packed handoff on the after CLI was 17 code chunks, every one `· full`, and no `· summary`. Code is not summarized, and those chunks filled the intent budget, so the handoff token count matches the before CLI. These figures were measured on this worktree. They were not copied from the S2 results file.

| Run | Context tokens | Handoff retrieved tokens | Hit rate |
|-----|----------------|--------------------------|----------|
| Keyword, embeddings off, before this phase | 5406 | 3945 | 6/8 |
| Keyword, embeddings off, after this phase, first build | 5406 | 3945 | 6/8 |
| Keyword, embeddings off, after this phase, second build (cache hit) | 5406 | 3945 | 6/8 |

| # | Question | Before | After |
|---|----------|--------|-------|
| 1 | `compute_panchangam` | hit | hit |
| 2 | `panchangam for a date and place` | miss | miss |
| 3 | `evaluate_compatibility` | hit | hit |
| 4 | `match two birth charts` | hit | hit |
| 5 | `compute_basic_kundali` | hit | hit |
| 6 | `basic kundali from a birth` | hit | hit |
| 7 | `matchSystemForPlace` | hit | hit |
| 8 | `which milan system a place uses` | miss | miss |

## Commands run

```bash
pnpm test
pnpm typecheck
pnpm lint
```

The AstroApp commands were the search, context, new, and agent invocations named above, once with the pre-change CLI and once with this branch’s CLI.

## Sign-off

- Tested by: QA
- Date: 2026-10-19
- Verdict: PASS
- Product owner: approved the code and the docs
- After keyword hit rate is not lower than the before keyword hit rate from this measurement.

---

## Latest run (2026-10-19T06:17:00.265Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="0dd6a43f7bebebe381accada8518f98dcf096600" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
