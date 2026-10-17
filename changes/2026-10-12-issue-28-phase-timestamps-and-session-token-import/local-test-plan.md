# Local test plan

> **Issue #28: phase timestamps and session token import** · `2026-10-12-issue-28-phase-timestamps-and-session-token-import`

## Environment

- How to run locally: Node 20.19.3 with pnpm 9.15.0; use the package-scoped Vitest commands below, then root typecheck/lint/build.
- Branch / flags / seed data: isolated temporary SDD projects with sanitized Claude Code and Codex JSONL records; no real prompts or personal session logs.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Phase lifecycle | Create a change, advance phases, skip a current phase, switch to a different stage, and complete | Each visit has ordered UTC start/end values; current phase remains open until transition; status formats local time |
| 2 | Fallback recovery | Move metadata past incomplete design and run `advanceStage` | Metrics remain aligned with the recovered open phase; no false transition is added |
| 3 | Claude import | Import a sanitized assistant usage row twice | Exact four token categories are stored once with measured marker and correct phase |
| 4 | Codex import | Import task-start, assistant-message, and token-count rows, including one request without an ID | Usage is attributed to task-start phase; absent cache-write stays null; unidentified usage is ignored |
| 5 | Privacy and opt-out | Seed fake prompt content and an external source path; repeat with `metrics.enabled: false` | Prompt/path are absent from metrics; disabled lifecycle writes nothing and disabled import is rejected |
| 6 | Change targeting | Import through CLI using active change, then explicit `--change` | Both paths select the expected change and duplicate import does not change totals |
| 7 | Commit-time comparison | Compare phase timestamps with a commit on one real change | Difference is within one minute; requires a real local commit and usable Git tooling |

## Out of scope this change

- LiteLLM proxy, pricing/cost estimates, all-change reports, and human wait-time tracking from issue #26.
- Real user session logs; all parser tests use synthetic sanitized records.
