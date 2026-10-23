# Local test results

> **Issue 60 configurable team workflow** · `2026-10-23-issue-60-configurable-team-workflow`

Node v20.19.3. `EBADENGINE` warnings for `engines.node >= 24` are expected.

| # | Result |
|---|--------|
| 1 | PASS. `team-workflow.test.ts` and `engine.test.ts` — 17 tests, exit 0. |
| 2 | PASS. Full core vitest, 284 tests, 37 files, exit 0. |
| 3 | PASS. `tsc --noEmit` for core and cli. `biome check` on `packages/core/src` and `packages/cli/src`, 141 files, exit 0. |

This project's feature workflow runs `pnpm test` (`pnpm -r run test`) as Workspace tests. `sdd verify` recorded exit 0. The stamp is HEAD `1c62be3`, the commit before this change was committed. The command ran on the working tree that contains this change.

QA proposes this result. The person has not recorded it. The recorded result would be the person's words plus the git SHA.

Using `sdd` 0.18.0 from main (`sdd new`, `sdd next`, `sdd skip`, `sdd verify`) advanced this change. No separate CLI defect showed up. The software template still has no QA role; that is issue #72.

---

## Latest run (2026-10-23T09:27:50.050Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="1c62be3e941f260d197a41a614c92b38cb4cdda8" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
