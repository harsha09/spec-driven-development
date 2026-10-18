# Local test results

> **Issue #22: search S1 keyword index and token budgets** · `2026-10-17-issue-22-search-s1-keyword-index-and-token-budgets`

## Results

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | `countTokens("hello world")` is 2. |
| 2 | PASS | Code search `function` at budget 120 matches the pinned stdout. Token count is 108. No absolute temp path. No `.sdd/handoff.md`. CLI exit 0. |
| 3 | PASS | Budget 105 is the pinned signature stdout. Token count is 102. `return x.trim()` is absent. |
| 4 | PASS | Budget 30 is the header only. Token count is 20. |
| 5 | PASS | Budget 19 writes zero bytes. Token count is 0. |
| 6 | PASS | A second budget-120 run is byte-identical. |
| 7 | PASS | Specs search `AlphaSectionBody` matches the pinned block. Token count is 61. |
| 8 | PASS | Memory search `MemoryAlphaBody` matches the pinned block. Token count is 58. |
| 9 | PASS | `alpha_symbol` hits `src/notes.py` and `src/notes.rs`. A second run is byte-identical. Token count is at most 200. |
| 10 | PASS | `FAKE_BIRTH_RECORD_S1`, `fake-secret-s1-do-not-index`, and `NESTED_JHD_SECRET` are absent from search stdout, context markdown, the handoff, `readFile` of `.sdd/index.db`, and `SELECT body FROM chunks`. `nestedHidden` and `hiddenSkip` are absent from those bodies and from every `###` line. |
| 11 | PASS | `src/skip-me.ts` and `skip-me.ts` are excluded. `packages/secret-nest/note.jhd` is excluded. `other/note.jhd` is not. `nestedShown` is a hit. `nestedHidden` has no `###` line and does not print `packages/secret-nest/hidden.ts`. |
| 12 | PASS | After a one-line edit to `src/budget.ts`, `lastIndexFilesReindexed` is 1 and `src/other.ts` is unchanged. `index(["src/budget.ts"])` leaves the old `src/other.ts` body after that file changes on disk. An absolute path throws `Index path must be project-relative.` and does not echo the path. |
| 13 | PASS | Provider `does-not-exist` and a registered provider `broken` that throws both warn `Search provider "<name>" is unavailable. Using built-in keyword search.` Stdout is the built-in budget-120 result. CLI exit 0. |
| 14 | PASS | `k: 0` throws `search.yaml is invalid` with no absolute path. CLI: missing query, `--scope no`, `--budget 0`, and `--budget 1.5` exit 1 with the exact sentences. |
| 15 | PASS | Context bytes after `## Slices\n\n` at budget 87 are the signature slice (82 tokens, no `return x.trim()`). At budget 88 they are both full slices (88 tokens). Headings stay in order. No `…(truncated)` and no temp path. |
| 16 | PASS | Fresh init `.sdd/.gitignore` is the six names. `--force` line-merges the `# keep` fixture. `search.yaml` has no `sdd:generated` marker, is not in `.generated.json`, keeps a user edit, and is restored after delete. `git check-ignore .sdd/index.db` exits 0. |

Handoff budget: a change titled `function` whose `feature.md` was overwritten, then reindexed, writes a retrieved section. Bytes between the markers, trimmed of one leading and one trailing newline, equal the budget-87 slice. `FAKE_BIRTH_RECORD_S1` and the temp path are absent. The intent handoff does not contain `## Code context (product code)`. The implement-stage pointer test still expects that heading. The change id is not stored in `chunks.body`. `.sdd/handoff.md` is not an indexed path.

`sdd report` on an unmeasured change still prints `estimated (handoff code points / 4)`. `"abcd😀"` still estimates 1. Those assertions were not changed.

AstroApp is not on this machine. It was not run. No before/after token count was invented.

## Commands run

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Core: 30 files, 206 passed. CLI: 3 files, 37 passed. Lint and typecheck passed.

Node v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected on this machine. No network and no model download.

## Sign-off

- Tested by: QA
- Date: 2026-10-18
- Verdict: PASS
