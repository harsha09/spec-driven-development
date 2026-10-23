# Local test plan

> **Issue #36: show missing bundled workflows and adopt matching files** · `2026-10-23-issue-36-show-missing-bundled-workflows`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

| # | Check | Expected |
|---|--------|----------|
| 1 | `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/init-force.test.ts src/__tests__/generated-defaults.test.ts` | Pass. Matching unmarked files are recorded. Differing unmarked files stay kept. A later source change refreshes the recorded file. |
| 2 | `pnpm --filter @structured-vibe-coding/cli test -- src/__tests__/cli.integration.test.ts` | Pass, including the #36 command repro. |
| 3 | `pnpm exec biome check` on the touched TypeScript | Pass. |
| 4 | `pnpm --filter @structured-vibe-coding/core typecheck` and `pnpm --filter @structured-vibe-coding/cli typecheck` | Pass. |
