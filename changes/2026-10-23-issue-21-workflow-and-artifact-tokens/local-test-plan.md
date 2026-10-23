# Local test plan

> **Issue 21 workflow and artifact tokens** · `2026-10-23-issue-21-workflow-and-artifact-tokens`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

| # | Check | Expected |
|---|--------|----------|
| 1 | `vitest run src/__tests__/token-inventory.test.ts` | Pass. `hello world` is 2 tokens. A missing template prints `missing`. No dollar amount. |
| 2 | `pnpm --filter @structured-vibe-coding/core test` | Pass. |
| 3 | `tsc --noEmit` for core and cli, and biome check | Pass. |
| 4 | `sdd workflows` | Prints `Tokens (cl100k):` and a line for the active change. |

These checks are proposed evidence. They are not the person's recorded QA result.
