# Local test plan

> **Issue 60 configurable team workflow** · `2026-10-23-issue-60-configurable-team-workflow`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

| # | Check | Expected |
|---|--------|----------|
| 1 | `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/team-workflow.test.ts src/__tests__/engine.test.ts` | Pass. Owners, the hard gate, one item per task file, and no archive on the new pack. |
| 2 | `pnpm --filter @structured-vibe-coding/core test` | Pass. |
| 3 | `tsc --noEmit` for core and cli, and `biome check packages/core/src packages/cli/src` | Pass. |

These checks are proposed evidence. They are not the person's recorded QA result.
