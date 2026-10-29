# Local test plan

> **Issue 64 per-bot brain** · QA proposal. Not a recorded result. The person has not signed.

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

| # | What to try | Expected |
|---|---|---|
| 1 | No team file. One reading reply | One model call. The log has no `step` line |
| 2 | No team file. Delete a role that has legacy memory | `.sdd/role-runs/memory/<name>/` is gone |
| 3 | A bot returns plan, tool, check, then done | The log has those four steps. The tool path is not created. No fact is written |
| 4 | A bot returns ask, with a change active | `meta.yaml` is unchanged. No review file. One `decision-needed` line |
| 5 | `loop_max_steps: 2` and a model that keeps planning | Two model calls. The last line asks `Stopped after 2 steps.` |
| 6 | Set a fact, set the same key again, list two keys | The first line remains. Get returns the new value. List shows one line per key |
| 7 | Empty key, empty value, newline, slash in the key | Nothing is written |
| 8 | A value contains a constitution bullet and ignore, skip, or override | Nothing is written. With a change, one decision line and no review file. With no change, the refusal sentence |
| 9 | A value says ignore and contains no long bullet. The constitution file is removed | The fact is written |
| 10 | `sdd role lesson add` then run the bot | The next prompt contains that lesson. A plan item is not stored as a lesson |
| 11 | Budget smaller than the role file, and a budget that fits the role but not the lesson | The role file stays both times. The lesson is absent when it does not fit |
| 12 | `sdd team migrate` with a legacy `memory.md` and an inbox line | The file moves and the command prints the move. A second migrate leaves the destination. The inbox line stays |
| 13 | Delete the role while the team file exists | `memory.md` and `lessons.jsonl` are gone. `inbox.jsonl` remains |

Commands already run for this proposal: `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/team-facts.test.ts src/__tests__/team-memory.test.ts src/__tests__/team-brain.test.ts src/__tests__/team-loop.test.ts src/__tests__/role.test.ts` (29 passed) and `pnpm --filter @structured-vibe-coding/core exec tsc --noEmit`. The workflow command is `pnpm test`.
