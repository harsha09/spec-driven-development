# Feature

> **Issue #26: report phase time, tokens, and cost** · `2026-10-17-issue-26-report-phase-time-tokens-and-cost` · 2026-10-17

## Problem / opportunity

Issue #28 already stores UTC phase intervals and measured token counts in `changes/<id>/metrics.json`, and `sdd status` prints those intervals in local time. There is still no command that turns that file into active time, human wait, token totals, or money. Operators cannot see cost without a calculator, and they cannot list every change that has metrics.

## Users & value

Maintainers running `sdd` locally can read one change, or every change that already has `metrics.json`, and see phase active time, the gaps between phases, measured tokens, and a price-table cost. The same numbers are available from `sdd cost`. Nothing in this change rewrites the measurements #28 stored.

## Scope

- Read-only `sdd report` for the active change, `sdd report --change <id>` for one change, and `sdd report --all` for every change that has a `metrics.json`.
- `sdd cost` and `sdd cost --change <id>` print that same one-change report, including the same cost figures. One calculator, not two.
- Active time is the sum of stored phase durations. Human wait is the sum of gaps between one phase's `endedAt` and the next phase's `startedAt`. An open phase is active from `startedAt` until an injectable report clock. Total is active plus wait.
- Prices come from `.sdd/prices.yaml`, shipped as `packages/core/defaults/prices.yaml`. Init writes the project file only when it is missing. The file is not `sdd:generated`.
- Cost uses `models.<provider>` when that key exists, otherwise `models.default`. Missing prices yield `n/a`, not zeros. Null token counts are left out of sums and render as `n/a`.
- When a change has zero measured requests, add one display-only estimate from `.sdd/handoff.md` Unicode code points divided by 4. The text says `estimated (handoff code points / 4)`.
- Optional `metrics.exclude` prefixes. Import refuses a session log under an excluded repo-relative prefix and still stores no path and no prompt text.
- Disabled metrics: `sdd report` and `sdd cost` print `Metrics are disabled` and exit 0, writing neither `metrics.json` nor `prices.yaml`.
- Docs sentences listed in `design.md`. The developer applies them after this spec is approved. This change does not edit those docs while the spec is being written.

## Non-goals

- Do not re-specify or rewrite the #28 importer, dedupe key, phase attribution, cache columns, `TokenUsageMetricSchema`, or status-line formatting.
- Do not write costs, estimates, or prices into `metrics.json`.
- Do not add a model field, a BPE tokenizer, `tiktoken`, a tokenizer download, LiteLLM, a proxy process, or proxy-log parsing.
- Do not add a QA or PO gate clock. Ignore `meta.yaml` gate records, including any optional `gates.*.at`. The product gate records are not a wait clock for this report.
- Do not add `display_timezone`.
- Do not build the rest of epic #21, search phases #21–#25, or call GitHub or any other network service.
- Do not treat a live AstroApp change as acceptance. This repo has no AstroApp end-to-end checkbox to run.

## Success criteria

- For a fixture with closed and open phases, active, human wait, and total match the formulas in `design.md`, using the injected clock for the open phase only.
- A provider-specific rate card wins over `models.default`. A provider with no card uses `default`. A missing `prices.yaml` makes every cost `n/a` and the report contains `prices.yaml is missing`.
- Null token counts do not become zero. INR is unrounded USD times `usd_to_inr`. Text shows 4 decimal places for USD and 2 for INR.
- The estimate row appears only when `requests` is empty, and only from `.sdd/handoff.md` code points divided by 4. Any measured request, even one whose counts are all null, suppresses it.
- An excluded session-log path is not read. `metrics.json` gains neither that path nor prompt text. Report text prints neither prompt text nor an absolute path.
- With `metrics.enabled` false, report and cost exit 0 after `Metrics are disabled` and leave `metrics.json` and `prices.yaml` untouched.
- `sdd report --all` orders changes by first phase `startedAt`, then change id. `sdd cost` shows the same cost figures as `sdd report` for that change.
- `metrics.json` on disk remains version 1 counts and UTC timestamps only.

## Risks / open questions

No product decisions are left open. The locks are in `design.md`.

Residual risks, already accepted:

- The shipped rates are illustrative. Real invoices stay wrong until an operator edits `.sdd/prices.yaml`. Init will not refresh that edit.
- `Date.toLocaleString()` follows the machine locale. Tests compare against the same process, not a hard-coded zone.
- `metrics.exclude` applies only to logs inside the project tree. A log outside the repo is still importable, and its path is still not stored.
