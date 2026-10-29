# Local test plan

> **Guided setup one step at a time** · `2026-10-29-guided-setup-one-step-at-a-time`

This plan is a proposal. The person has not signed this change.

## Commands

- `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/setup-tour.test.ts src/__tests__/role-guide.test.ts`
- `pnpm --filter @structured-vibe-coding/cli exec vitest run src/__tests__/setup-tour.integration.test.ts` after the CLI build
- `pnpm test` from the repo root, which is the required workspace check

## Look for

- A second duties step leaves an existing role file in place
- `--yes` writes the three roles and does not write `team.yaml` or `models.yaml`
- `--step model --yes` with no model exits non-zero and writes no file
- `--step no-such` exits non-zero and does not initialize the folder
