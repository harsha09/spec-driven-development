# Local test plan

> **Issue 63 SHA-bound sign-off** · QA proposal. Not a recorded result. The person has not signed.

| # | What to try | Expected |
|---|---|---|
| 1 | Sign off with a one-line note in a git repo whose humans include the git user | Review file has kind, sha, reviewer, verdict accept, and evidence. `decisions.md` gains one line |
| 2 | Sign off again with a second note | The review file is unchanged. `decisions.md` gains a second line |
| 3 | Empty note, a newline, missing HEAD, missing team, git name not in humans | Each refuses and writes nothing |
| 4 | Advance requirements after approve alone, then after the sha changes | The stage stays both times |
| 5 | Waive the human gate | The stage leaves with no review file |
| 6 | Mark the gate failed while a valid review file exists | The stage stays |
| 7 | Fill `reviews/R-001.md` and advance pull-request review with no human file | The soft stage leaves. A later sign-off does not change `R-001.md` |
| 8 | A review file whose reviewer is a role, or whose verdict is not accept | The stage stays |
| 9 | Advance a feature change with no team file | The stage leaves |
| 10 | Force through to implement with no human file | The stage reaches implement |
| 11 | Always allow, repeat, then commit and repeat | The rule applies before the new commit and asks again after it |
| 12 | Always allow with no sha in a non-git project, and the same rule in a git repo | It applies only when there is no HEAD |
| 13 | `sdd role decide --note` | One `decision-needed` line. `meta.yaml` is unchanged |

Commands to run, not yet a result: `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/signoff.test.ts src/__tests__/team-workflow.test.ts src/__tests__/role.test.ts src/__tests__/stage-gates.test.ts src/__tests__/stage-complete.test.ts src/__tests__/engine.test.ts src/__tests__/dynamic-bugs.test.ts`, then `pnpm --filter @structured-vibe-coding/core exec tsc --noEmit` and `pnpm --filter @structured-vibe-coding/cli exec tsc --noEmit`. The workflow verify command is `pnpm test`.
