# Local Test Plan

This change uses the CLI built from `origin/main` at `e687749` and the `patch` SDD workflow. Run all SDD commands from the repository root with `node packages/cli/dist/index.js`, not the workspace wrapper that changes cwd to `packages/cli`.

## Required Checks

- `pnpm build`: build core and CLI before invoking the modified command entry point.
- `pnpm typecheck`: check all workspace TypeScript types.
- `pnpm lint`: check formatting and static rules on core and CLI sources.
- `pnpm test`: run all core and CLI regression tests, including acceptance cases for #7, #8, #9, #10, #19, and #20.
- `bash scripts/cli-smoke.sh`: verify the public CLI lifecycle.
- `node packages/cli/dist/index.js verify --no-agent`: run and record those five required commands through SDD at `local_verify`.

## Runtime And Scope

Use the installed Node 24 runtime, matching the package engine requirement. The report must list the runtime, commands, verdicts, regression coverage, and any unresolved gaps. Do not count an empty verify configuration or `--no-run` as a successful verification.

Existing branch/PR work, especially #15/PR #18, is excluded. No test depends on network access or private credentials.
