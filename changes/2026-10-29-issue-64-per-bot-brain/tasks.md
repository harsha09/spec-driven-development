# Tasks

> **Issue 64 per-bot brain** · dev-lead proposal. Not an acceptance.

1. Add optional `limits.loop_max_steps` on `TeamSchema`. Do not edit shipped team files.
2. Add fact, memory, brain, and loop modules under `packages/core/src/team/`.
3. Point team-mode memory at `.sdd/agents/<bot>/`. Keep the legacy `memoryDir` path. Delete removes brain files and the legacy directory, and leaves `inbox.jsonl`.
4. Branch `runRole`: no team file, or a name that is not a bot, stays the author, critique, and revision path. A bot calls `runLoop`.
5. Add `sdd fact set|get|list`, `sdd role memory`, `sdd role lesson add`, and `sdd team migrate`. Add one paragraph to `docs/reference/cli.md`.
6. Add `team-facts`, `team-memory`, `team-brain`, and `team-loop` tests. Leave `role.test.ts` unchanged.
