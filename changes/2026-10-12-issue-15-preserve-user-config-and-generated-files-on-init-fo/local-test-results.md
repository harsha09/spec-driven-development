# Local verify results

> Change: Issue #15: preserve user config and generated files on init --force
> Stage: local_verify
> Overall: PASS

## Results

| # | Result | Notes |
|---|--------|-------|
| 1 | PASS | 23 focused config, manifest, init-force, agent ownership, and memory preservation tests passed. |
| 2 | PASS | CLI integration confirms custom paths/nested settings survive; edited workflows/templates are reported and remain byte-identical. |
| 3 | PASS | `pnpm test` full workspace suite passed; SDD `Workspace tests` verify command exited 0. |
| 4 | PASS | `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `bash scripts/cli-smoke.sh` exited 0. |
| 5 | PASS | Malformed manifest fails before config/workflow writes; legacy no-manifest files remain user-owned. |

## Commands run

```text
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/config-merge.test.ts
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/generated-defaults.test.ts
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/init-force.test.ts
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/init-agents.test.ts src/__tests__/memory-preserve.test.ts
pnpm --filter @structured-vibe-coding/cli exec vitest run src/__tests__/cli.integration.test.ts -t "init --force|safe --force"
pnpm test
pnpm lint
pnpm typecheck
pnpm build
bash scripts/cli-smoke.sh
sdd verify --change 2026-10-12-issue-15-preserve-user-config-and-generated-files-on-init-fo --no-agent
```

## Checklist

- [x] Happy path verified locally.
- [x] Key edge cases covered, including legacy manifests and malformed input.

## Notes

- The active Node 20.19.3 environment prints the existing `engines.node >=24` warning; all commands passed.

## Sign-off

- Tested by: Agent-run local checks
- Date: 2026-10-12
