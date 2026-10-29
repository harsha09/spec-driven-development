# Local test plan

> **Write each guide draft under its own headings** · `2026-10-29-write-each-guide-draft-under-its-own-headings`

This plan is a proposal. The person has not signed this change.

## Environment

`pnpm test` from the repo root. Node v20 is the machine version. The engine warning for Node 24 is expected.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Guide drafts | `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/role-guide.test.ts` | Feature, design, and tasks differ. Results do not say the tests passed. |
| 2 | Templates stay stubs | `pnpm test` | `stage-complete.test.ts` still rejects every shipped template. |

## Out of scope this change

No critic. No npm publish. Issue #54 stays open.
