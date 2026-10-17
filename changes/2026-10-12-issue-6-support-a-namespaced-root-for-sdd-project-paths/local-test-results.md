# Local test results

> **Issue #6: support a namespaced root for SDD project paths** · `2026-10-12-issue-6-support-a-namespaced-root-for-sdd-project-paths`
> Overall: PASS for available local checks

## Results

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | Seven core layout tests cover path values/creation, lifecycle, brownfield memory preservation/warning, and unsafe roots. |
| 2 | PASS | CLI integration covers `--root .sdd`, new change creation under `.sdd/changes`, and default memory collision warning. |
| 3 | PASS | Full core suite: 151 tests passed; CLI test suite completed successfully. |
| 4 | PASS | Lint, typecheck, builds, docs build, and CLI smoke exited 0. |
| 5 | NOT RUN BY SDD | `sdd verify` reports NOT RUN because patch workflow has no configured verify commands; executable checks above were run directly. |

## Commands run

```text
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/init-layout.test.ts
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/init-layout.test.ts src/__tests__/init-force.test.ts src/__tests__/init-agents.test.ts
pnpm --filter @structured-vibe-coding/cli exec vitest run src/__tests__/cli.integration.test.ts -t "init --root namespaces"
pnpm --filter @structured-vibe-coding/cli exec vitest run src/__tests__/cli.integration.test.ts -t "init --root|init --force preserves custom"
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm docs:build
bash scripts/cli-smoke.sh
sdd verify --change 2026-10-12-issue-6-support-a-namespaced-root-for-sdd-project-paths --no-agent
```

## Checklist

- [x] Acceptance cases checked locally.
- [x] No obvious regressions on touched paths.

## Notes

- Existing root-level defaults remain unchanged unless `--root` is passed.
- Node 20.19.3 prints the expected existing `engines.node >=24` warnings.

## Sign-off

- Tested by: Agent-run local checks
- Date: 2026-10-12
