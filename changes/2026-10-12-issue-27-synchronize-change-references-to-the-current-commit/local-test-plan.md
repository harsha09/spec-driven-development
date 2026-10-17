# Local test plan

> **Issue #27: synchronize change references to the current commit** · `2026-10-12-issue-27-synchronize-change-references-to-the-current-commit`

## Environment

- How to run locally: Node 20.19.3, pnpm 9.15.0; core tests inject SHA values and CLI integration tests use a temporary fake `git` executable.
- Branch / flags / seed data: isolated SDD temp projects with two verify stages, deterministic 40-character SHA values, and both SDD-marked and human-authored reports.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Sync happy path | Record verify results at SHA A, change fake HEAD to SHA B, run `sdd sync <change>` | Metadata and every SDD marker update to B; command results/counts stay unchanged |
| 2 | Stale SHA | Change HEAD without sync and run `sdd verify` | Verification fails with the stale reference path and expected/current SHA |
| 3 | Stale count/metadata | Change marker count or remove its matching metadata record | Verification fails with the report path and line |
| 4 | Human report safety | Sync a report without SDD markers; run verify repeatedly on a hand-authored report | Sync leaves unmarked bytes intact; subsequent verify appends without overwriting human notes |
| 5 | External-write boundary | Run sync with a fake local Git executable | No network/GitHub calls or commit creation occur; CLI prints the SHA for a separate PR-body update |
| 6 | Real Git acceptance | Run against this repository's real HEAD and compare all requested artifact surfaces | Pending: Git is blocked by the unaccepted Apple SDK license; PR-body/status/gate artifacts are not present in this repo |

## Out of scope this change

- Automatic GitHub PR-body updates, network access, and commit creation.
- Artifact formats not present in this repo (`status.md`, changes table, and `gates/<sha>.md`); the implementation handles native verify metadata and generated results.
