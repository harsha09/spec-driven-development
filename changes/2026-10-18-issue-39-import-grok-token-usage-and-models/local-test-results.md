# Local test results

> **Issue #39: import Grok token usage and models** · `2026-10-18-issue-39-import-grok-token-usage-and-models` · 2026-10-18

Node v20.19.3. `EBADENGINE` warnings are expected (`engines` wants Node >= 24).

| # | Result |
|---|--------|
| 1 | PASS. `metrics.test.ts` stores the two model rows and omits 999999, the prompt, the path, and `costUsdTicks`. |
| 2 | PASS. Second import reports `duplicates: 2`. |
| 3 | PASS. `unmatched: 1`, `requests` stays `[]`. |
| 4 | PASS. Sibling `turn_started` wins. Stored input is 0. A bad `events.jsonl` line is ignored. |
| 5 | PASS. One valid row, `ignored: 2`, `incomplete: true`. |
| 6 | PASS. Both throw messages match. |
| 7 | PASS. Existing Claude test still expects one request and no `model` field. |
| 8 | PASS. `report.test.ts` pins 9.0000, 4.0000, 3.0000, and total 16.0000 / 1344.00. Existing rows insert `n/a` or `all`. |
| 9 | PASS. CLI test `imports a Grok usage.json per model and warns when usage is incomplete`. |
| 10 | PASS. `pnpm lint` clean. Core and CLI `tsc --noEmit` clean. `pnpm test`: core 31 files, 229 passed; CLI 3 files, 38 passed. |

`sdd verify` is recorded by the tool when it runs.

---

## Latest run (2026-10-18T08:56:00.914Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="226e0d40bd5857eb5bd6c9b6c3bd29c8d5667320" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
