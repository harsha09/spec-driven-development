# Design

> **Issue 65 rooms** · `2026-10-29-issue-65-rooms` · 2026-10-29

This is a proposal. The person has not accepted it.

| Module | Role |
| --- | --- |
| `packages/core/src/team/room.ts` | JSONL room, review round, consensus line, loop read and done post |
| `packages/core/src/role/prompts.ts` | The critique and revision prompts, moved unchanged |
| `packages/core/src/role/schema.ts` | Optional `limits.room_rounds` |
| `packages/core/src/role/team.ts` | Print the cap. Sync `rooms/` in `.sdd/.gitignore` from `rooms.commit` |
| `packages/core/src/team/loop.ts` | Include an existing room in the prompt. Post on done |
| `packages/cli/src/role-cmd.ts` | `room`, `room post`, `review` |

Members come from `owner` and `collaborates`. There is no `reviewers` field. `state.ts`, `escalate.ts`, and `decisions.ts` are not added. An open cap uses `recordDecisionRequest`.

`rooms.commit` stays a required boolean. The three team templates set it to true. A false value appends `rooms/`. A true value removes that one line. `SDD_IGNORE_LINES` does not grow.

The room prompt calls `critiquePrompt` and, for the owner after an open objection, `revisionPrompt`. Their sentences are the same strings as before.
