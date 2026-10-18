# Tasks

> **Issue #39: import Grok token usage and models** · `2026-10-18-issue-39-import-grok-token-usage-and-models`

## Implement

- [x] Extend `TokenUsageMetricSchema` with provider `grok` and optional nullable `model`. Keep version 1.
- [x] Detect a directory or a `usage.json` basename and parse the Grok document in `importSessionMetrics`. Leave the JSONL stream for every other path.
- [x] Map each `turns[].modelUsage` entry to one request using the design split, request id, and timestamp rule. Set `incomplete` from `usageIsIncomplete`. Do not store the path, prompt text, ticks, or reasoning.
- [x] Add the `model` column, grouping, and model-then-provider-then-default price card in `report.ts`.
- [x] Update `metrics-cmd.ts` copy and the incomplete warning. Core stays silent.
- [x] Add the core and CLI tests listed in `design.md`. Keep the existing Claude import test.
- [x] Update `docs/reference/cli.md` with the three sentence changes in `design.md`.

## Verify

- [x] `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass.
- [x] `sdd verify` for this change passes when the feature workflow has a verify command.
