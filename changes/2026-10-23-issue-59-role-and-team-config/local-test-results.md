# Local test results

> **Issue 59 role and team config** · `2026-10-23-issue-59-role-and-team-config`

Node v20.19.3. `EBADENGINE` warnings for `engines.node >= 24` are expected.

| # | Result |
|---|--------|
| 1 | PASS. `team.test.ts`, `role.test.ts`, and `agents.test.ts` — 38 tests, exit 0. |
| 2 | PASS. Full core vitest, 281 tests, exit 0. |
| 3 | PASS. CLI integration, 30 tests, exit 0, including `installs a team template and creates a role from one (#59)`. |
| 4 | PASS. `tsc --noEmit` for core and cli. `biome check` on the touched TypeScript, exit 0. |

The feature workflow's `verify.commands` is empty, so `sdd verify` reports NOT RUN. The checks above are the verification.

Using `sdd` from main (`sdd new`, `sdd next`, `sdd skip`) advanced this change to local verify. No separate CLI defect showed up.
