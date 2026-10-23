# Local test plan

> **Issue 59 role and team config** · `2026-10-23-issue-59-role-and-team-config`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

| # | Check | Expected |
|---|--------|----------|
| 1 | `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/team.test.ts src/__tests__/role.test.ts src/__tests__/agents.test.ts` | Pass. Software init, no overwrite, template create, plain role, stub lines. |
| 2 | `pnpm --filter @structured-vibe-coding/core test` | Pass. |
| 3 | `pnpm --filter @structured-vibe-coding/cli test -- src/__tests__/cli.integration.test.ts` | Pass, including team init and role create from a template. |
| 4 | `pnpm exec biome check` on the touched TypeScript, and `tsc --noEmit` for core and cli | Pass. |
