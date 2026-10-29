# Local test plan

> **Issue 66 evidence** · `2026-10-29-issue-66-evidence`

This is a proposal. It is not a recorded result. The person has not signed it.

| Check | Expected |
| --- | --- |
| Bot `read_file`, `search`, and `context` | The next prompt contains the file text and `body-66`. No evidence file. The log has no `stub: true`. |
| `write_file` with no contents, and a tool named `browser` | Nothing is written. The next prompt names the refusal. |
| `run_check` of `node evil.js` and of `node mark.js; node evil.js` | `started.txt` is absent. No evidence file for those commands. |
| `run_check` of exact `node mark.js` with uncommitted `dirty.txt` | Evidence JSON at the current SHA contains `CLEAN` and that SHA. `git worktree list` is unchanged. |
| `tests pass` with empty evidence | The log has `refused`, not a check of that claim. The next prompt has the refusal sentence. |
| `tests pass` citing that JSON file | The run stdout is `tests pass`. |
| Room post `it works` without the cite, and an objection `it works` citing `requirements.md#scope` | Both refused. An agree that cites the evidence file is stored. |
| Stage with no verify commands | Objection cite `requirements.md#scope` for a non-claim is stored. A `tools.yaml` allow entry can run `node mark.js`. |
| Commit on `main` | HEAD unchanged. The next prompt says the bot commits only on its own branch. |
| Commit on `bot/builder/<change>`, then `push` and `merge` | HEAD moves on that branch. Push and merge do not. `decisions.md` is unchanged. |
| Existing suites | `team-loop`, `team-room`, `role`, and `signoff` stay green. `pnpm test` is the verify command. |
