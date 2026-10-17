# Local test plan

> **Issue #26: report phase time, tokens, and cost** · `2026-10-17-issue-26-report-phase-time-tokens-and-cost`

## Environment

- How to run locally: from the repo root, run the package Vitest files first, then the CLI package tests, then the root suite. Node and pnpm are the repo engines. No network, no GitHub, no live AstroApp.
- Branch / flags / seed data: temporary projects from `initProject` or `sdd init --here --no-agent`. Sanitized JSONL only. Clock passed as a `Date` into `renderChangeReport`. Do not freeze the machine timezone. Compare timestamp text with `new Date(iso).toLocaleString()` in the same process.

## Files

- Add `packages/core/src/__tests__/report.test.ts`.
- Extend `packages/core/src/__tests__/metrics.test.ts` for the exclude refusal only. Do not change the dedupe-key assertions.
- Extend `packages/core/src/__tests__/init-force.test.ts` for prices write-if-missing.
- Extend `packages/cli/src/__tests__/cli.integration.test.ts` for the commands.

## Commands

```bash
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/report.test.ts src/__tests__/metrics.test.ts src/__tests__/init-force.test.ts
pnpm --filter @structured-vibe-coding/cli test
pnpm test
pnpm lint
pnpm typecheck
```

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Wait vs active | Render the design's three-phase fixture at `2026-01-01T01:05:30.000Z`, and the closed-only fixture at `03:00:00.000Z` | Open fixture: active `0h 15m 30s`, human wait `0h 50m 0s`, total `1h 5m 30s`. Closed fixture: active `0h 30m 0s`, human wait `0h 30m 0s`, total `1h 0m 0s`. The tail after the last end is not included. A zero-length shared boundary adds no wait. |
| 2 | Price lookup | One million input tokens on `claude-code` with card 9, and on `codex` with no `models.codex` and default 3 | USD `9.0000` and `3.0000`. Estimate, when used, prices at `models.default`. |
| 3 | Missing prices.yaml | Report a change while `.sdd/prices.yaml` is absent | Every usd and inr cell is `n/a`. Text contains `prices.yaml is missing`. The metrics file is unchanged and prices.yaml is still absent. |
| 4 | Invalid prices.yaml | Report with a prices file that fails the schema | Exit 1, message contains `prices.yaml is invalid`, no token table, no writes. |
| 5 | Null tokens | One row with input 1500000 at 1 USD per million, output null, `usd_to_inr` 84. A second group whose input is null | USD `1.5000`, INR `126.00`. Output cell `n/a` and not added. All-null column is `n/a`, not `0`. |
| 6 | INR conversion and rounding | 5 input tokens at 10 USD per million, `usd_to_inr` 84 | USD `0.0001`, INR `0.00`. Not INR `0.01`. |
| 7 | Estimate only when unmeasured | Zero requests and handoff text `abcd😀`. Then one measured request with all counts null. Then zero requests and no handoff file | First report has `estimated (handoff code points / 4)` and input `1`. Second has no estimate row. Third has `No estimate: .sdd/handoff.md is missing.` and does not invent tokens. `"abc"` estimates 0. |
| 8 | Exclude path | `metrics.exclude: ["secret"]`. Import `secret/session.jsonl` whose body contains `PRIVATE PROMPT CONTENT`. Also import `secrets/log.jsonl` and a log outside the repo | `secret/session.jsonl` throws `Refusing to import a session log under excluded prefix "secret".` before read. `metrics.json` is unchanged and has no prompt text and no log path. `secrets/log.jsonl` is not excluded by that prefix. An outside-repo log is not excluded. |
| 9 | Disabled metrics do not write | `metrics.enabled` false. Run `sdd report`, `sdd report --all`, and `sdd cost` with no active change and with a change whose `metrics.json` already exists. Delete `prices.yaml` first | Each command prints `Metrics are disabled`, exits 0, does not create `prices.yaml`, and leaves `metrics.json` bytes unchanged. |
| 10 | `--all` sort | Three changes with metrics files: `change-c` first start `2026-01-03`, `change-b` and `change-a` first start `2026-01-02`. A fourth change directory has no `metrics.json` | Order is `change-a`, `change-b`, `change-c`. The fourth id is absent. Empty `--all` prints `No change metrics found.` and exits 0. |
| 11 | `sdd cost` matches `sdd report` | Closed phases and one measured request. Run both commands for that change | Cost figures match, including USD and INR text. Both use the same renderer. `--all` together with `--change` exits 1 and writes nothing. |
| 12 | No prompt text in metrics.json | Import a sanitized log that contains `PRIVATE PROMPT CONTENT`, then report it. Also double-import that log and report | `metrics.json` has no prompt text and no absolute log path. Report stdout has neither. Token total equals the single stored row, not twice the row. Dedupe key is still provider plus request id. |
| 13 | Init prices file | Fresh init, then edit `.sdd/prices.yaml`, then `initProject` with `force: true` | File exists after first init, does not contain `sdd:generated`, and the edit survives `--force`. |

## Out of scope this change

- Rewriting the #28 importer, a BPE tokenizer, LiteLLM, proxy logs, writing costs into `metrics.json`, and epic #21.
- A live AstroApp change. Acceptance is the fixture tests above.
- Searching GitHub or any network service.
