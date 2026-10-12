# Local test results

> **Fix open bugs #7 #8 #9 #10 #19 #20** · `2026-10-11-fix-open-bugs-7-8-9-10-19-20`

## Results

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | Node v24.18.0. `pnpm typecheck` passed for core and CLI. |
| 2 | PASS | `pnpm lint` (biome) passed after formatting. |
| 3 | PASS | `pnpm test`: 142 core tests and 18 CLI tests, including #7, #8, #9, #10, #19, and #20 regressions. |
| 4 | PASS | `bash scripts/cli-smoke.sh` completed the hotfix lifecycle. |
| 5 | PASS | `sdd verify --no-run` does not create a marker and exits 1 with NOT RUN. |

## Commands run

```
pnpm typecheck
pnpm lint
pnpm test
bash scripts/cli-smoke.sh
```

## Sign-off

- Tested by: local worktree fix/open-bugs-7-10-19-20
- Date: 2026-10-12
