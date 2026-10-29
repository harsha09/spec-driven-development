# Feature

> **Issue 66 evidence** · `2026-10-29-issue-66-evidence` · 2026-10-29

This is a proposal. The person has not signed it.

## Reading

A bot named in `.sdd/team.yaml` can read a file, search, ask for code context, run one allowlisted check, write a file, and commit on its own branch. A line that says the work passed, works, or is fixed is refused unless `changes/<id>/evidence/<sha>.json` shows the latest run exited 0 at the current HEAD.

`run_check` runs a command only when that exact string is on the active stage's `verify.commands` or in `.sdd/tools.yaml`. The command runs in a temporary git worktree detached at HEAD, then the worktree is removed. Uncommitted files in the checkout are not in that tree. The result file records the SHA, the command, the exit code, and the output.

On a stage that lists verify commands, an agree is stored only when it cites that evidence file for the current HEAD. An objection that does not claim a pass still needs only a cite, including `requirements.md#scope`. A room does not block `sdd next`.

Commit runs only when the current branch is already the rendered `team.branch` (`bot/{bot}/{change}` in the shipped templates). It does not create or switch branches, and it does not push. Push, a pull request, and merge are refused. They do not run git or `gh`, and they do not write a decision line. A name that is not a bot still only applies `write_file`. Commit, push, and merge on that path stay unavailable.

## Source

Issue #66 and the panel on this change. Research, the product manager, the product owner, the architect, the dev lead, and QA each proposed a piece. This file is not an acceptance. The product owner said an earlier candidate was not honest until the worktree output is in the next prompt, a failing latest run is not a pass, an agree on a stage with verify commands cites the evidence file, and this issue does not push or merge.

## Out of this change

Issue #54 stays open. This change does not add `sdd sandbox`, a port lease, a private build directory, boot, drive, waiver, or a process group that outlives the model call. `sdd verify` still runs in the project root. The worktree inherits the process environment. A hung command is not killed. The branch must already be checked out. The latest run in the evidence file is the one that counts.

## Product owner

The checks below are the ones QA proposed. They are not a recorded result.

- A bot read returns the file. Search and code context do not write an evidence file.
- A command that is not the exact allowlisted string does not start, including a chained tail.
- `node mark.js` in a worktree at HEAD writes `changes/<id>/evidence/<sha>.json` with `CLEAN` and that SHA. An uncommitted `dirty.txt` stays out of the worktree. The worktree list is unchanged afterward.
- `tests pass` with no exit 0 at HEAD is not stored as a check. The same words with that file are kept. `does not pass` is not that claim.
- An agree on a stage with verify commands needs the evidence cite. An objection cite `requirements.md#scope` that is not a pass claim is stored.
- Commit on `main` is refused. Commit on `bot/<bot>/<change>` moves HEAD. Push and merge leave HEAD and `decisions.md` unchanged.
- The author path still applies `write_file` and still reports commit as unavailable.
