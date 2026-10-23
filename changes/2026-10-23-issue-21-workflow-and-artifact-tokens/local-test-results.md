# Local test results

> **Issue 21 workflow and artifact tokens** · `2026-10-23-issue-21-workflow-and-artifact-tokens`

Node v20.19.3. `EBADENGINE` warnings for `engines.node >= 24` are expected.

| # | Result |
|---|--------|
| 1 | PASS. `token-inventory.test.ts` — 1 test, exit 0. `hello world` counted as 2. |
| 2 | PASS. Full core vitest, 282 tests, 37 files, exit 0. |
| 3 | PASS. `tsc --noEmit` for core and cli. `biome check` on `packages/core/src` and `packages/cli/src`, 141 files, exit 0. |
| 4 | PASS. `sdd workflows` printed `Tokens (cl100k):` for enterprise-feature, feature, greenfield, hotfix, patch, and spike, then the active change's artifact files. No dollar amount. |

QA proposes this result. The person has not recorded it. `sdd verify` ran `pnpm test` and recorded exit 0. The stamp is HEAD `1c62be3`, the commit before this change was committed. The command ran on the working tree that contains this change.

Dollar cost is left on `sdd report` and `sdd cost`. This slice does not close epic #21. Issue #25 remains open.

---

## Latest run (2026-10-23T10:35:52.601Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="1c62be3e941f260d197a41a614c92b38cb4cdda8" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
