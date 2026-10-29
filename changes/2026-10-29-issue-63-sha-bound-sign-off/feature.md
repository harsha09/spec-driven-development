# Feature

> **Issue 63 SHA-bound sign-off** · `2026-10-29-issue-63-sha-bound-sign-off` · 2026-10-29

## Reading

A hard gate whose approvers include `human` stays closed until a listed person signs that exact commit. `sdd team signoff --note "..."` writes `changes/<id>/reviews/<stage>-<sha>.md` with kind, sha, reviewer, verdict `accept`, and the note as evidence. The reviewer is `git config user.name`, and that name must be one of the humans in `.sdd/team.yaml`. The command also appends one line to `changes/<id>/decisions.md`. An empty note, a note with a newline, a missing HEAD, a missing team file, or a git name that is not listed writes nothing.

`sdd gate approve` does not open that gate. `sdd gate waive` still does. A new commit needs a new sign-off. Soft gates stay warnings. The feature workflow has no human approver, so it still advances. `sdd next --force` still skips a failed gate.

Always allow stores the HEAD sha when the repo has one. The same tool and the same inputs apply again only while that sha is still HEAD. A rule with no sha does not apply in a repo that has a HEAD. A project with no HEAD keeps today's match.

`sdd role decide --note "..."` appends an unsigned `decision-needed` line. It does not approve a gate and it does not call the model picker.

Pull-request review stays a soft gate for the architect and the dev lead. Acceptance stays a hard gate whose only approver is `human`. The product owner still owns acceptance. The product manager and the architect still collaborate. They do not sign.

## Source

Issue #63, as filed, including the paragraph decided on 20/10/2026. The product manager, product owner, architect, and dev lead proposed this reading. It is not an acceptance. The person accepts or corrects it.

## Product owner

The decided lines that this change meets: a human approver is a name in `team.yaml` matched to `git config user.name`; always allow stops applying when the sha changes; no bot push or merge command is added; `sdd next` reads `gate.approvers` and, when that list contains `human`, requires the review file for the current HEAD.

The issue also names `.sdd/decisions.yaml`. This change does not generate that file. The matrix it checks is the workflow gate's approver list, which already ships on the team workflow.

Proposed checks, not a recorded decision: empty and broken notes are refused; a stranger and a missing HEAD are refused; a sign-off at one sha does not open the gate at the next sha; approve alone does not; waive does; a failed gate does not; soft pull-request review advances without a human file; `reviews/R-001.md` is not overwritten; the feature workflow still advances; always allow expires with the commit; decide appends a line and does not change `meta.yaml`.

## Non-goals

- No `.sdd/decisions.yaml`. The approver list on the workflow gate is the matrix this change checks.
- No confidence threshold, protected-file list, or two-round disagreement counter. The runner has none of those signals. `sdd role decide` is the stop.
- No rooms, no evidence-by-sha tool, and no 13-stage sequence. Those are issues #65, #66, and #74.
- No bot commit, push, or merge command. Merge stays a person action after the acceptance sign-off for that sha. The branch pattern already contains `{bot}`.
- Role names on a gate are not signatures. Acceptance approvers stay `[human]`.
- Solo, research, the feature workflow, and an existing team's files are not rewritten.
