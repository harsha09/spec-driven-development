# Design

> **Issue 64 per-bot brain** · architect seams. Not an acceptance.

## Modules

| Module | Path | Job |
|---|---|---|
| Facts | `packages/core/src/team/facts.ts` | Append-only `.sdd/facts.jsonl`. Newest line for a key wins. |
| Memory | `packages/core/src/team/memory.ts` | `.sdd/agents/<bot>/memory.md` and `lessons.jsonl`. Migrate. |
| Brain | `packages/core/src/team/brain.ts` | `loadBrain` packs the role file, memory tail, lessons, facts, and the item. |
| Loop | `packages/core/src/team/loop.ts` | `runLoop` and `LoopStepSchema`. |
| Runner | `packages/core/src/role/run.ts` | A bot calls `runLoop`. Any other run stays as it is. |
| Profile | `packages/core/src/role/profile.ts` | `memoryDir(root, name, true)` is the agents directory. Delete removes brain files, not the inbox. |
| Schema | `packages/core/src/role/schema.ts` | Optional `limits.loop_max_steps`, a positive integer. |
| CLI | `fact-cmd.ts`, `role-cmd.ts`, `team-cmd.ts` | `sdd fact`, `sdd role memory`, `sdd role lesson add`, `sdd team migrate`. |

## Seams

`memoryDir(root, name)` stays `.sdd/role-runs/memory/<name>`. Team mode passes `true` and gets `.sdd/agents/<name>/`. The inbox file in that directory is not deleted. `deleteRole` with no team file still removes the legacy directory.

A missing team file is old mode. A team file that does not parse fails the run with the existing team error. A name that matches one bot, or the only bot of that role, uses the loop. Two bots of one role and a role-name argument return `Name the bot.`

The brain budget is `budgetForStage` (default 12000), counted with `countTokens`. Over the budget, facts drop, then lessons, then the memory tail. The role file stays. Inputs are an empty list. A cut memory file adds `Memory is longer than the budget.`

A fact is refused when a constitution line starts with `- `, the trimmed bullet is at least 12 characters and is contained in the value, and the value matches `ignore`, `skip`, or `override` as a word. The note is `fact <key> contradicts constitution`. No active change means the sentence `A fact contradicts the constitution.` and no decision line.

The loop does not call `finishRun` and does not change the critique prompts. Ask appends a decision request when the question is one line. It does not approve a gate. At the step limit the loop logs `Stopped after N steps.` and does not call the model again.

A lesson is written by `sdd role lesson add`, or once from the previous run when that log has a reviewer `changed` list or a model line from another role. The bot's own step text is not a lesson.

## Risks

The constitution check misses a paraphrase. A role file that is larger than the budget is still sent whole. Real tools stay in #66.
