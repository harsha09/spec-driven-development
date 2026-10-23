# Local test plan

> **Issue 61 router** · `2026-10-23-issue-61-router`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

| # | Check | Expected |
|---|--------|----------|
| 1 | `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/router.test.ts src/__tests__/role-handoff.test.ts src/__tests__/team.test.ts src/__tests__/agents.test.ts` | Pass. A rule wins, two owners ask the human, a busy bot and a full role refuse another item, both inboxes get the handoff note, and one named lead still plans. |
| 2 | `pnpm --filter @structured-vibe-coding/core test` | Pass. |
| 3 | `tsc --noEmit` for core and cli, and `biome check packages/core/src packages/cli/src` | Pass. |
| 4 | `sdd verify` | Workspace tests exit 0. |

These checks are proposed evidence. They are not the person's recorded QA result.
