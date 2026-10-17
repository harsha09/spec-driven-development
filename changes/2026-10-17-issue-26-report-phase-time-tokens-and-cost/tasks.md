# Tasks

> **Issue #26: report phase time, tokens, and cost** · `2026-10-17-issue-26-report-phase-time-tokens-and-cost`

## Breakdown

- [x] Add `packages/core/defaults/prices.yaml` with the locked illustrative rates and `usd_to_inr: 84`. Add `defaultPricesYamlPath()`. Make `initProject` write `.sdd/prices.yaml` only when the destination is missing, including on `--force`, with no `sdd:generated` marker and no generated-manifest entry.
- [x] Extend `ConfigSchema` so `metrics.exclude` defaults to `[]` and `metrics.enabled` still defaults to true. Keep `mergeConfigDefaults` filling both. Reject an empty-string prefix.
- [x] Add `packages/core/src/report.ts` with the locked timing formula, injectable clock, provider-then-default price lookup, null-token exclusion, half-away rounding, estimate row, and plain-text `renderChangeReport`. Do not write `metrics.json` or `prices.yaml`. Do not put costs into the metrics schema.
- [x] In `importSessionMetrics` only, refuse an in-repo session log under `metrics.exclude` before opening the file. Leave the dedupe key, phase attribution, parsers, and disabled-import throw unchanged.
- [x] Add `sdd report` and `sdd cost` in `packages/cli/src/report-cmd.ts`. Wire them into `commands`. Disabled metrics print `Metrics are disabled` and exit 0 before change resolution. `--all` with `--change` exits 1. Do not launch an agent or rewrite handoff.
- [x] Apply the exact `docs/reference/cli.md` and `docs/reference/layout.md` sentences from `design.md`. Do not add a proxy config, a tokenizer dependency, or a second calculator.
- [x] Cover the cases in `local-test-plan.md`. Acceptance is those fixture tests, not a live AstroApp change.

## Traceability

| Task | Story / design ref |
|------|--------------------|
| Default prices and init write-if-missing | Design: Prices. Feature: prices are not generated |
| `metrics.exclude` schema | Design: Exclude. Feature: privacy prefix list |
| Report math and text | Design: Time, Cost math, Tokens, Estimate, Report text |
| Import refusal | Design: Exclude. #28 dedupe key unchanged |
| `sdd report` and `sdd cost` | Design: Commands. Feature: one calculator |
| Docs sentences | Design: Docs |
| Fixture tests | `local-test-plan.md`. Feature: no AstroApp end-to-end |
