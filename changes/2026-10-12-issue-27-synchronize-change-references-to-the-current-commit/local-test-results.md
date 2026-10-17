# Local verify results

> Change: Issue #27: synchronize change references to the current commit
> Stage: local_verify
> Overall: PASS for native local behavior; issue acceptance remains partial

## Results

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | Core suite: 136 tests passed, including stale SHA/count, sync, multi-stage markers, and report preservation. |
| 2 | PASS | CLI fake-Git integration: SHA A becomes stale at B, `sdd sync` updates it, `sdd status` displays B, and verify passes. |
| 3 | PASS | `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `bash scripts/cli-smoke.sh` exited 0. |
| 4 | PASS | `sdd verify` ran `pnpm test` and recorded PASS. Its marker is `head_sha="none"` because the local Git executable is unavailable. |
| 5 | PENDING | Real-Git verification and commit-time comparison are blocked by the unaccepted Xcode/Apple SDK license. No license was accepted and no commit was created. |
| 6 | NOT IMPLEMENTED HERE | The issue's PR body, `status.md`, changes table, and `gates/<sha>.md` surfaces do not exist in this repo; this pack implements only native verify metadata/report references. |

## Commands run

```text
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/git-head.test.ts
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/verify-status.test.ts src/__tests__/sync.test.ts
pnpm --filter @structured-vibe-coding/cli exec vitest run src/__tests__/cli.integration.test.ts -t "sdd sync updates"
pnpm lint
pnpm typecheck
pnpm test
pnpm build
bash scripts/cli-smoke.sh
sdd verify --change 2026-10-12-issue-27-synchronize-change-references-to-the-current-commit --no-agent
```

## Checklist

- [x] Happy path verified locally with an isolated fake Git command.
- [x] Stale SHA/count, missing metadata, unavailable Git, and report-preservation cases covered by tests.

## Notes

- Real Git was unavailable on 2026-10-12. The 2026-10-17 recheck covers it. Issue #27 remains open for the PR body, `status.md`, changes table, and `gates/<sha>.md` surfaces that this product does not have.
- Node 20.19.3 emitted the repository's existing `engines.node >=24` warning; all executed test/build/lint commands exited successfully.

## Sign-off

- Tested by: Agent-run local checks
- Date: 2026-10-12

## Recheck (2026-10-17)

Real Git is available. In a temporary repository, `sdd verify` stored `git rev-parse HEAD`, a later commit made `sdd verify` exit 1 and name `meta.yaml` plus the recorded and current SHAs, and `sdd sync <change>` updated that record and the results marker. A following `sdd verify` passed. Sync printed that hosted PR bodies are not changed.

The PR body, `status.md`, changes table, and `gates/<sha>.md` surfaces stay out of this product, as design.md decided. Issue #27 stays open for those surfaces.
