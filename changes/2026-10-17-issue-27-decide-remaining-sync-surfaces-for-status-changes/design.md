# Design

> **Issue #27: decide remaining sync surfaces for status, changes table, and gates** · `2026-10-17-issue-27-decide-remaining-sync-surfaces-for-status-changes`

## Chosen approach

Record a decision and stop. Issue #27 stays closed on the behavior already shipped by `2026-10-12-issue-27-synchronize-change-references-to-the-current-commit` (PR #31). This change does not add a second sync path.

Canonical head-SHA records stay:

- `verify_results.<stage>.head_sha` in the change's `meta.yaml`
- the bounded `<!-- sdd:verify stage="..." head_sha="..." result_count="..." -->` marker in `local-test-results.md`

`sdd sync <change>` refreshes those local references from `git rev-parse --verify HEAD` and does not rerun checks. `sdd verify` fails while either native reference is stale. A hosted PR body is updated only by a person, as a separate explicit step. Sync prints that it does not change hosted PR bodies.

The 2026-10-12 design was checked against the current code (`packages/core/src/git-head.ts`, `packages/core/src/sync.ts`, `packages/core/src/verify.ts`, `packages/core/src/schemas.ts`, `packages/cli/src/sync-cmd.ts`). The shipped behavior matches that design. There is no implementation gap to specify.

`meta.yaml` failures name the file and the `verify_results.<stage>.head_sha` field, not a source line. The results-file failure names the file and line. That is what the 2026-10-12 design required for the native records. The issue's "file and line in all four places" rule applied to surfaces this product does not have.

## Why the alternatives stay rejected

- Automatic GitHub PR-body updates stay rejected. They need credentials and network access. Issue #27 says the external update is explicit. `sdd sync` is an offline local command; `git rev-parse` is the only Git invocation on that path.
- Required `status.md`, a changes table, and `gates/<sha>.md` stay rejected. The repo has no such artifact contract. Adding them would copy `verify_results` and `local-test-results.md` and would make verify fail on files contributors are not required to keep.
- Rewriting all of `local-test-results.md` during sync stays rejected. Human notes must survive. Sync may replace only the exact SDD marker.
- Reading `.git` files directly stays rejected. `git rev-parse --verify HEAD` already handles linked worktrees and packed refs.
- Implementing the four issue surfaces "just enough to close the ticket" stays rejected. The 2026-10-17 real-git recheck already shows the native marker goes stale, verify fails with the file and SHAs, and sync repairs it. A parallel set of files would not make that check more honest.

## Files to touch

None. No product code, tests, or docs change.

`docs/reference/cli.md` already says sync is local and does not update a hosted PR body (the sync paragraph under "About the AI opening", and the `sdd sync <change>` row in the command table). Do not edit that page.

Do not post to GitHub from this change's implementation. Closing #27 is an explicit out-of-repo step. Paste the comment below when a person closes the issue.

## Issue comment text

Post this when closing #27:

```text
Closing as done for this product.

Shipped command: `sdd sync <change>` (change 2026-10-12-issue-27-synchronize-change-references-to-the-current-commit, PR #31). It updates local `verify_results.*.head_sha` in the change's meta.yaml and the bounded `<!-- sdd:verify ... -->` marker in local-test-results.md to local `git rev-parse HEAD`. `sdd verify` fails when that recorded SHA or marker is stale, and names the file (and the line, for the results marker) plus the recorded and current SHAs. Sync is offline. It does not create a commit and it does not edit a hosted PR body. A real-git check on 2026-10-17 passed: a later commit made verify fail, sync updated the native records, and the next verify passed.

Rejected surfaces, same decision as that change's design:

- No GitHub API writes, network calls, or automatic PR-body edits. Updating a hosted PR body stays a separate, explicit step.
- No required status.md, changes table, or gates/<sha>.md. Those files are not part of the change-pack contract and would duplicate meta.yaml verify_results and local-test-results.md.

Canonical records remain meta.yaml verify_results and the bounded marker in local-test-results.md. docs/reference/cli.md already says sync is local and does not update a hosted PR body. No further product change.
```

## Risks

- Readers of the open issue can still expect the four named files. The close comment has to name both the shipped command and the rejected surfaces, or the issue will look abandoned rather than decided.
- Sync still does not rerun tests. The existing CLI sentence already says a sync is not fresh test evidence. This decision does not change that.
- A later, separate command that only prints PR-body markdown is out of scope here. Closing #27 must not be described as a promise to build or to forbid that command.
