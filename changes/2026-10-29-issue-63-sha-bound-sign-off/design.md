# Design

> **Issue 63 SHA-bound sign-off** · `2026-10-29-issue-63-sha-bound-sign-off`

## Approach

Add `recordSignoff` and `recordDecisionRequest` in `packages/core/src/role/signoff.ts`. The sign-off command writes `reviews/<stage>-<sha>.md` beside `reviews/R-001.md` and appends one decisions line. A second call for the same valid file appends another line and does not rewrite that file. A file that is not this person's accept at this sha is replaced, so a role cannot leave a blocking fake in place.

`canLeaveStage` grows an optional project root. `advanceStage` and `completeChange` pass it. A hard gate whose approvers contain the exact string `human` opens when the review file matches this HEAD, the reviewer is a human on the team, and the verdict is `accept`. Waive still opens it. Failed still blocks. Approve alone does not. Soft gates and gates without `human` keep today's check. `force: true` still skips the error.

`readRule` and `saveRule` store the HEAD sha on an always-allow rule when git has one. A missing or different sha returns null. No HEAD keeps today's match, so the non-git role tests stay green.

## Seams

| Piece | Change |
|---|---|
| `role/signoff.ts` | New writer and the leave check |
| `stage-gates.ts` | Human hard gates call that check |
| `change.ts` | Passes the project root into the check |
| `role/run.ts` | Always allow carries the sha |
| `team-cmd.ts` | `sdd team signoff --note` |
| `role-cmd.ts` | `sdd role decide --note` |
| `docs/reference/cli.md` | Two sentences in the role section |
| `team-software.yaml` | Unchanged. Acceptance stays `[human]` |

## Risks

A hand-written file whose reviewer is a listed human and whose verdict is accept opens the gate. `git config user.name` is a local guard, not a second factor. `sdd next --force` still skips the error. `sdd complete` has no force, so the last human gate cannot be completed that way. An old always-allow rule with no sha stops matching inside a real git repo. That is intended.

The product manager and the architect disagreed on listing product-manager, architect, and product-owner as acceptance approvers. Those names would read as signatures this change does not check. The list stays `[human]`, which is the check.
