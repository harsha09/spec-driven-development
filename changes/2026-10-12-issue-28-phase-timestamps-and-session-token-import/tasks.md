# Tasks

> **Issue #28: phase timestamps and session token import** · `2026-10-12-issue-28-phase-timestamps-and-session-token-import`

## Breakdown

- [x] Add the versioned metrics JSON model and `metrics.enabled` config setting; test default/disabled behavior and preserve existing change packs without metrics files.
- [x] Record phase entry/exit timestamps at change creation, normal advance, fallback, current-stage skip, actual workflow-stage change, and completion; test repeated visits and no-op skips.
- [x] Add streaming Claude Code and Codex JSONL parsers that normalize only recognized request IDs, timestamps, and measured token counts; test sanitized fixtures, malformed rows, missing IDs, and unsupported records.
- [x] Add `sdd metrics import <session-log> [--change <id>]`, phase-time attribution, and provider/request-ID deduplication; test active/explicit target selection, re-import idempotency, privacy, and metrics-off behavior.
- [x] Render stored phase timestamps in local time from `sdd status` and run focused core/CLI tests, typecheck, lint, build, and CLI smoke verification; record outcomes in the local verification artifacts.

## Traceability

| Task | Story / design ref |
|------|--------------------|
| Metrics model and config | Design: data file, opt-out, legacy compatibility |
| Lifecycle timestamps | Design: phase interval transition coverage |
| Session parsers | Design: normalized, streamed, privacy-preserving usage |
| Import command | Design: target selection, phase attribution, idempotency |
| Status and verification | Issue #28 acceptance criteria; design: local-time display |
