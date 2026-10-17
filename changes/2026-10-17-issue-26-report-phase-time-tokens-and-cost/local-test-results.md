# Local test results

> **Issue #26: report phase time, tokens, and cost** · `2026-10-17-issue-26-report-phase-time-tokens-and-cost`

## Results

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | Open fixture active `0h 15m 30s`, wait `0h 50m 0s`, total `1h 5m 30s`. Closed fixture active `0h 30m 0s`, wait `0h 30m 0s`, total `1h 0m 0s`. Shared boundary adds no wait. `90000ms` renders `0h 1m 30s`. |
| 2 | PASS | `claude-code` card 9 is `9.0000`; `codex` without a card uses default 3 and is `3.0000`. Total sums each request on its own card (`12.0000`). |
| 3 | PASS | Missing `prices.yaml`: usd/inr cells are `n/a`, text contains `prices.yaml is missing`, metrics bytes unchanged, file still absent. |
| 4 | PASS | Invalid prices: CLI exit 1, `prices.yaml is invalid`, no token table, metrics bytes unchanged. |
| 5 | PASS | 1_500_000 input at 1 USD/million is USD `1.5000`, INR `126.00`. Output and all-null columns are `n/a`. Numeric 0 is `0.0000`. |
| 6 | PASS | 5 input tokens at 10 USD/million and rate 84: USD `0.0001`, INR `0.00`. |
| 7 | PASS | `abcd😀` estimates input 1. `"abc"` estimates 0. One all-null measured request suppresses the estimate. Missing handoff prints `No estimate: .sdd/handoff.md is missing.` Other read failures exit 1 with `Could not read .sdd/handoff.md.` and no absolute path. |
| 8 | PASS | Prefix `secret` refuses `secret/session.jsonl` before read (mode `000` still throws the refuse message). `secrets/log.jsonl`, `secret-file.jsonl`, and an outside-repo log are imported. Invalid prefixes throw `metrics.exclude prefix is invalid.` |
| 9 | PASS | `sdd report`, `sdd report --all`, `sdd cost`, and `sdd report --change` with metrics disabled print exactly `Metrics are disabled`, exit 0, do not create `prices.yaml`, and leave `metrics.json` bytes unchanged. Holds with and without an active change. |
| 10 | PASS | `--all` order is `change-a`, `change-b`, `change-c`. A directory without `metrics.json` is omitted. Empty `--all` prints `No change metrics found.` and exits 0. |
| 11 | PASS | `sdd cost` stdout equals `sdd report` for the same closed change, including `3.0000` and `252.00`. `--all` with `--change` exits 1 and leaves `prices.yaml` bytes unchanged. |
| 12 | PASS | Double import stores one request. Report stdout has input `12`, no prompt text, and no log path. `metrics.json` has neither the prompt nor the log path. |
| 13 | PASS | Fresh init writes `.sdd/prices.yaml` without `sdd:generated` and without a generated-manifest entry. A user edit survives `initProject` `force: true`. Deleting the file and running `--force` writes it again. |

## Commands run

```bash
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/report.test.ts src/__tests__/metrics.test.ts src/__tests__/init-force.test.ts src/__tests__/config-merge.test.ts
pnpm --filter @structured-vibe-coding/cli test
pnpm lint
pnpm typecheck
pnpm test
```

Core: 193 passed. CLI: 34 passed. Lint and typecheck passed.

Node v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected on this machine. No network and no live AstroApp run.

## Sign-off

- Tested by: QA
- Date: 2026-10-17
