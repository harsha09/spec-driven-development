# Design

> **Issue 66 evidence** · `2026-10-29-issue-66-evidence`

This is a proposal. The person has not signed it.

| Module | Role |
| --- | --- |
| `packages/core/src/team/tools.ts` | Tool registry, `.sdd/tools.yaml`, temporary worktree, evidence file |
| `packages/core/src/team/loop.ts` | Calls the tool, keeps the last output for the next prompt, refuses a pass claim before storing it |
| `packages/core/src/team/room.ts` | An agree on a stage with verify commands, and any pass claim, must cite the evidence file |

`runTool` handles `read_file`, `search`, `context`, `run_check`, `write_file`, and `commit`. `push`, `pull_request`, and `merge` return a refusal and do not spawn git. Any other name returns `That tool is not available.` The loop still logs the step and continues, so the bot can try again inside `loop_max_steps`.

`search` calls `searchProject`. `context` calls `generateCodeContext` and does not write an artifact. `read_file` and `write_file` use the same path rules as `isSafeProductPath`. The helper is copied in `tools.ts` because importing `run.ts` would cycle through the loop.

`.sdd/tools.yaml` is optional. A missing file means only the active stage's `verify.commands[].run` strings are allowed. A present file adds `allow[].run`. The match is the exact string. A command that contains `sdd next`, `sdd complete`, `git push`, `git merge`, or `gh pr merge` is refused even when it is listed.

The evidence file is one JSON object per SHA: `{ sha, runs: [{ command, exitCode, output }] }`. A second check at the same SHA appends a run. A pass needs the latest run's exit code to be 0, and the cite must be `changes/<id>/evidence/<sha>.json` for the current HEAD.

`commit` runs `git add` and `git commit` only when `git rev-parse --abbrev-ref HEAD` is exactly the rendered branch. `packages/core/src/role/run.ts`, `verify.ts`, and `stage-gates.ts` stay as they are.

The old author path is unchanged.
