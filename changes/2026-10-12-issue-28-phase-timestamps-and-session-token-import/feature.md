# Feature

> **Issue #28: phase timestamps and session token import** · `2026-10-12-issue-28-phase-timestamps-and-session-token-import` · 2026-10-12

## Problem / opportunity

Changes do not retain when a workflow phase started or ended, and token use from agent session logs must currently be gathered manually. This makes phase duration and actual input/output usage unavailable for the later S0 reporting work in issue #26.

## Users & value

Maintainers and contributors need reliable, locally recorded phase durations and measured token counts to evaluate change-pack friction and context cost without manually inspecting session logs.

## Scope

- Record UTC ISO 8601 timestamps with a `Z` suffix when a change enters or leaves a stage, in `changes/<id>/metrics.json`.
- Display recorded phase times in the user's local timezone.
- Add `sdd metrics import <session-log>` support for Claude Code and Codex logs.
- Attribute input, cache-read, cache-write, and output token counts to the change and the phase active when each request began.
- Deduplicate imports by stable request or message ID; importing the same log repeatedly must not increase totals.
- Label imported values as measured and provide an off switch that prevents metrics writes.
- Store counts, IDs, phase names, and timestamps only; do not store prompts or paths outside the repository.

## Non-goals

- LiteLLM proxy integration, pricing tables, cost calculations, `sdd report --all`, and human wait-time tracking remain in issue #26.
- Do not ingest or retain prompt text, response text, or external absolute paths from session logs.

## Success criteria

- Phase timestamps use UTC ISO 8601 `Z` values and match commit timestamps within one minute for a real change.
- Imported token counts exactly match supported session-log usage fields; a repeat import leaves totals unchanged.
- `metrics.json` contains only the approved metadata and token counts, with no prompt text or paths outside the repo.
- With metrics disabled, phase changes and imports write no metrics data.
- Focused tests cover stage transitions, both supported log formats, deduplication, privacy, and the off switch.

## Risks / open questions

- Claude Code and Codex session formats evolve; parser behavior must be based on representative fixtures and safely ignore unsupported records.
- Define how to represent a phase that has multiple visits without losing prior timestamps or attributing imported requests ambiguously.
- Confirm the existing config and stage-transition boundaries before choosing the smallest compatible metrics schema.
