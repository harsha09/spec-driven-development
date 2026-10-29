# Local test plan

> **Accept a change id on sdd role room** · `2026-10-29-accept-a-change-id-on-sdd-role-room`

This plan is a proposal. The person has not signed this change.

## Commands

- `pnpm --filter @structured-vibe-coding/cli exec vitest run src/__tests__/room-cli.integration.test.ts` after the CLI build
- `pnpm test` from the repo root, which is the required workspace check

## Look for

- `sdd role room <change-id>` prints the posted line and exits 0
- `sdd role room --stage <stage>` prints that line and exits 0
- `sdd role room post --stage <stage>` with no line exits non-zero, names TEXT, and does not say `Unknown command`
