# Local test plan

> **Issue 65 rooms** · `2026-10-29-issue-65-rooms`

This table is a proposal. It is not a recorded QA result. The person has not signed it.

| # | Check |
| --- | --- |
| 1 | No team file: review writes nothing. |
| 2 | An objection without a cite is not stored. |
| 3 | Requirements review stores product-manager and architect, and the prompt contains `Check ids:`. |
| 4 | The stage file and `meta.yaml` stage stay put. The second round's owner prompt contains `changed must list every gap cite.` |
| 5 | `room_rounds: 1` with an open cite writes that cite and `decision-needed`, then another review does not call the model. |
| 6 | A person can post an agreement. |
| 7 | Three collaborator names produce three posts. |
| 8 | Two bots of one role use the first. `--roles` uses the named bot. |
| 9 | `rooms.commit: true` removes a `rooms/` ignore line and leaves `handoff.md`. |
| 10 | Free text without models is a post. With a decider that picks `agree`, the stored type is `agree`. |
| 11 | A loop with no room file does not create one. A loop with a room file includes it and posts on done. |

Command: `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/team-room.test.ts`

Workspace verify command: `pnpm test`.
