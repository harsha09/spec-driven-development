# Design

> **Issue #28: phase timestamps and session token import** · `2026-10-12-issue-28-phase-timestamps-and-session-token-import`

## Approach

Keep measurements separate from workflow metadata. Add a versioned `metrics.json` to each change pack and a `metrics.enabled` config setting (enabled by default, with an explicit opt-out). When disabled, lifecycle operations and imports do not create or modify metrics files.

Represent each visit to a stage as a phase interval containing its stage ID, UTC `startedAt`, and optional UTC `endedAt`. Starting a change opens its initial phase; a stage transition closes the current interval and opens the next at the same timestamp; completion closes the final interval. Keep prior intervals when stages are revisited. Route all real stage changes through one metrics transition helper, including normal advancement, fallback to incomplete work, skipping the current stage, and workflow switching. Skipping a non-current stage does not create a transition.

Implement a core metrics module for validated JSON read/write, phase transitions, usage normalization, and import deduplication. Add separate line-oriented parsers for Claude Code and Codex session logs, normalize recognized token-usage records, and stream large logs rather than loading them whole. Resolve the target change from `--change` or the active change. Match each request's start timestamp to the phase interval containing it; ignore records outside the change's recorded intervals and report records that cannot be safely identified. Deduplicate by provider plus stable request/message ID. Import only measured counts and metadata; do not persist the supplied log path, prompt/response text, or any other log fields.

Extend `sdd status` output to display phase start/end values using the machine's local timezone while preserving UTC in the file. Leave existing change packs without `metrics.json` valid; create the file on their next enabled lifecycle transition.

## Components / modules

- `packages/core/src/schemas.ts`: optional `metrics.enabled` configuration, defaulting to true.
- `packages/core/src/metrics.ts` (new): versioned metrics model, phase enter/exit helpers, provider-specific JSONL parsers, and idempotent import/update operations.
- `packages/core/src/change.ts`: call the metrics transition helper when creating, advancing, falling back, skipping the current phase, switching to a different stage, and completing a change.
- `packages/core/src/agent-handoff.ts`: render stored UTC phase timestamps in the user's local timezone for `sdd status`.
- `packages/cli/src/commands.ts`: register `sdd metrics import <session-log> [--change <id>]` and report measured counts plus ignored/unidentified records without printing prompt content.
- Core lifecycle tests and CLI integration tests: cover intervals and all transition paths, both log formats, duplicate imports, privacy, opt-out, and status rendering.

## Data flow

1. `sdd new` initializes the first phase from the change creation time if metrics are enabled.
2. A lifecycle transition closes the active phase and, unless completing the change, opens the destination phase at one UTC timestamp.
3. `sdd status` reads phase records and formats timestamps in the local timezone; the persisted values remain ISO 8601 UTC strings ending in `Z`.
4. `sdd metrics import` streams each JSONL record, recognizes provider usage events, validates stable IDs/timestamps/counts, and assigns each request to the interval containing its start time.
5. The importer merges new measured request records by provider/request ID into the selected change's metrics file. Re-importing the same records changes no totals. Unknown formats and records without a stable ID are not counted and are summarized without exposing content.

## Alternatives considered

- Store phase timestamps in `meta.yaml`: rejected because metrics are optional telemetry and should not expand workflow-state semantics or couple import data to the stage engine.
- Persist the session-log path or complete provider events for easier debugging: rejected because paths can identify a user's home/project layout and raw events can contain prompts or other private content.
- Attribute every imported request to the phase active at import time: rejected because imports may happen later; request timestamps must select the phase that was active when the request began.
- Read the full session log into memory: rejected because session files grow over long agent sessions; JSONL can be streamed with Node's standard library.

## Risks

- Claude Code and Codex log formats vary by version. Use sanitized fixtures for supported records, validate fields, ignore unrecognized records, and return a concise warning rather than guessing.
- Some providers may omit a token category or stable request ID. Preserve only values actually reported; represent unavailable counts explicitly and do not count records lacking a stable deduplication key.
- A session log can span unrelated work. The explicit `--change` option and phase-time matching avoid assigning records to the phase active when import happens, but requests outside recorded intervals remain unassigned.
- Filesystem failure during a transition can leave workflow metadata and measurements out of sync. Do not silently swallow metrics write failures when metrics are enabled; ensure the active phase is not advanced before its exit/entry records are safely persisted.
