# Feature

> **Issue #27: decide remaining sync surfaces for status, changes table, and gates** · `2026-10-17-issue-27-decide-remaining-sync-surfaces-for-status-changes` · 2026-10-17

## Problem

Issue #27 asks sync to fill the current head SHA into four places — the PR body, `status.md`, a changes table, and `gates/<sha>.md` — and asks verify to fail when any of those entries is stale, naming the file and line. The PR-body write must stay a separate explicit step, and the whole flow must work offline.

Those four surfaces are not part of this product's change-pack contract. Leaving the issue open treats that absence as unfinished work and invites a second sync implementation that would duplicate records the product already has.

## What already shipped

Change `2026-10-12-issue-27-synchronize-change-references-to-the-current-commit` (PR #31) shipped the in-repo behavior its design chose. That design rejected automatic GitHub PR-body updates and rejected adding `status.md`, a changes table, and `gates/<sha>.md` to every pack.

Reviewed against that design, the code on main does what the design says. No gap requires more product work.

- `sdd sync <change>` resolves local `git rev-parse --verify HEAD` (`packages/core/src/git-head.ts`). It does not call the network, write to GitHub, or create a commit.
- Sync updates `verify_results.*.head_sha` in the change's `meta.yaml` and the bounded `<!-- sdd:verify ... head_sha="..." result_count="..." -->` markers in `local-test-results.md` (`packages/core/src/sync.ts`). Command names, exit codes, and result counts stay as recorded. An unmarked results file is left byte-identical and reported as preserved. With nothing to update, sync reports that no recorded references needed updating.
- `sdd verify` checks those native records before it can report PASS (`packages/core/src/verify.ts`). A stale `meta.yaml` SHA fails with the change, the file, the `verify_results.<stage>.head_sha` field, the recorded SHA, and the current HEAD. A stale results marker fails with the file and line, the recorded SHA, and the current HEAD. A result-count mismatch fails with the file and line. The failure tells the caller to run `sdd sync <change>`.
- Optional `head_sha` on stored verify results is in `packages/core/src/schemas.ts`. The CLI command is `packages/cli/src/sync-cmd.ts`, registered from `packages/cli/src/commands.ts`. It prints that hosted PR bodies are not changed.
- The 2026-10-17 recheck in that change's `local-test-results.md` records a real-git smoke: a new commit made verify fail and name `meta.yaml` plus both SHAs, sync updated the record and the results marker, and a following verify passed.

Search of the repo finds no required `status.md`, changes table, or `gates/<sha>.md` artifact. Canonical records remain `meta.yaml` `verify_results` and the bounded marker in `local-test-results.md`.

## Decision

Close issue #27 as done for this product. Do not build a second sync.

1. Do not add GitHub API writes, network calls, or automatic PR-body edits. Updating a hosted PR body stays a separate, explicit step outside this repo.
2. Do not add required `status.md`, changes-table, or `gates/<sha>.md` files. Those files would duplicate `verify_results` and `local-test-results.md`.
3. Close #27 with the comment specified in `design.md`. The comment names `sdd sync <change>` and the rejected surfaces.
4. No product code change. The shipped sync matches the 2026-10-12 design.

Docs need no change. `docs/reference/cli.md` already says sync is local and does not edit a hosted PR body:

> `sdd sync <change>` only updates local change metadata and SDD-marked verification output. It does not create a commit or update a hosted PR body; verify checks recorded SHA/count references before reporting PASS.

That sentence is the paragraph under "About the AI opening" (the sync paragraph after the metrics note). The command table also describes `sdd sync <change>` as updating recorded verification SHAs to local `git rev-parse HEAD`.

## Non-goals

- No second implementation of sync, and no new verifier rules for files this product does not have.
- No automatic or in-tool edit of a hosted PR body.
- No new required change-pack files (`status.md`, a changes table, `gates/<sha>.md`, or a PR-body artifact).
- No product, test, or docs diff in this change.
- This decision does not design a future command that only prints PR-body markdown. That is a different issue; it is not a reason to keep #27 open.

## How we know it is done

- The shipped command and verifier match the 2026-10-12 design, including offline operation, the bounded results marker, stale-SHA failure text, and no remote writes. Evidence is the modules named above plus the 2026-10-17 real-git recheck.
- `docs/reference/cli.md` already contains the local-only / no hosted PR-body sentence, so the docs delta is empty.
- The product diff for this change is empty.
- The only remaining action is outside the repo: post the `design.md` comment and close GitHub issue #27. This spec does not post that comment.
