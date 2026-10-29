# Local test plan

> **Issue 74 AIDLC sign-off sequence before merge**

QA proposes this plan. It is not a recorded result. The person has not signed it.

| Check | Command | Expected |
|-------|---------|----------|
| Sign-off sequence | `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/team-workflow.test.ts src/__tests__/signoff.test.ts` | Every `team-software` stage is a hard human gate. Advance waits for a sign-off that matches HEAD. QA and product-owner sign-off files store the person's words and the SHA. `reviews/R-001.md` is not replaced. |
| Workspace | `pnpm test` | Exit 0. This repo's feature verify command. |
