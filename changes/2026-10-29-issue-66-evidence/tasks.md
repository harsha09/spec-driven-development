# Tasks

> **Issue 66 evidence** · `2026-10-29-issue-66-evidence`

This is a proposal. The person has not signed it. One developer.

- [x] Add `packages/core/src/team/tools.ts` for the allowlist, the worktree, the evidence file, read, search, context, write, and commit.
- [x] Teach `packages/core/src/team/loop.ts` to run those tools, append the output to the next prompt, and refuse a pass claim before it is stored.
- [x] Teach `packages/core/src/team/room.ts` to require the evidence cite for a pass claim, and for an agree when the stage lists verify commands.
- [x] Cover the behavior in `packages/core/src/__tests__/team-tools.test.ts`. Keep the author path, the #65 room cites, and sign-off tests green.
- [x] Add one paragraph to `docs/reference/cli.md`.
- [ ] `sdd verify` runs `pnpm test`. The person has not recorded the result yet.
