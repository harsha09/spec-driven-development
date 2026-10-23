# Local test results

> **Issue #36: show missing bundled workflows and adopt matching files** · `2026-10-23-issue-36-show-missing-bundled-workflows`

Node v20.19.3. `EBADENGINE` warnings for `engines.node >= 24` are expected. No network.

| # | Result |
|---|--------|
| 1 | PASS. Full core vitest, 276 tests, exit 0. A matching unmarked file is recorded and a later bundled change refreshes it. A differing unmarked file stays kept. |
| 2 | PASS. CLI integration: 29 tests, exit 0, including `names missing bundled workflows and adopts a matching unmarked file (#36)`. The other CLI files (node support, role, search, story) also passed, 16 tests. |
| 3 | PASS. `biome check` on the touched TypeScript, exit 0. |
| 4 | PASS. `tsc --noEmit` for core and cli, exit 0. CLI typecheck used the rebuilt core declarations. |

The patch workflow's `verify.commands` is empty, so `sdd verify` would report NOT RUN. The checks above are the verification.

---
