# Local test plan

> **Warn when doctor sees Node 20** · `2026-11-08-warn-when-doctor-sees-node-20`

This table is a proposal. It is not a recorded QA result. The person has not signed it.

| # | Case | Expected |
| --- | --- | --- |
| 1 | Doctor version check for 18, 20, 22, and 24 | Fail, warn, warn, pass |
| 2 | `sdd doctor` on Node v20.19.5 after `sdd init --here --no-agent` | Exit 0. The Node line contains `WARN` and does not contain `FAIL` |
| 3 | `sdd doctor` on Node v24.22.2 after init | Exit 0. The Node line is a pass and does not contain `WARN` |
| 4 | `pnpm install --frozen-lockfile` on Node v20.19.5 | Exit 0. No unsupported-engine warning |
| 5 | `pnpm test` on Node v20.19.5 and on Node v24.22.2 | Exit 0 on both |
