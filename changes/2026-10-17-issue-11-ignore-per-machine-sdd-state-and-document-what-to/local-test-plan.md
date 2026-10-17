# Local test plan

Add or extend the vitest files below. Do not treat a run as passed until it has been executed. This plan does not record results.

## Core unit tests

Extend `packages/core/src/__tests__/init-layout.test.ts` and `packages/core/src/__tests__/init-force.test.ts`:

- Fresh init writes `.sdd/.gitignore` with uncommented `handoff.md` and `active-context.md`, and writes default `changes/.gitignore` with uncommented `.active`.
- `init --force` on a user-edited gitignore that has an extra line and is missing one required line appends only the missing line and leaves the extra line in place. The gitignore bytes are not replaced and the file is not marked `sdd:generated`.
- A second `initProject` call without `force` throws the already-initialized error and leaves gitignore bytes unchanged, including when a required line was deleted.
- `layoutRoot: ".sdd"` writes `.sdd/changes/.gitignore` with `.active` and does not create a repository-root `changes/.gitignore`.
- When a test git index tracks `.sdd/active-context.md`, `.sdd/handoff.md`, or `<changes_path>/.active`, `InitResult.warnings` names that repo-relative path. The test must not let init run `git rm` or change the index.
- When the temp directory is not a git work tree, or the injected git runner fails to spawn or returns non-zero: init resolves, warnings do not mention tracked files, and both gitignore files are still written.

Add `packages/core/src/__tests__/change-context.test.ts`:

- With `.active` missing, empty, or whitespace, `getActiveChangeId` returns null even if fixture packs on disk have meta status `in_progress` or `blocked`.
- Do not read this repo's `changes/` tree and do not mention `2026-10-11-fix-open-bugs-7-8-9-10-19-20`.
- `resolveChangeId` with an explicit id still returns that id.

Add `packages/core/src/__tests__/agent-handoff.test.ts`, or extend `packages/core/src/__tests__/agents.test.ts` if the writer is easier to reach there:

- `formatStatus` prints `Path:` as a repo-relative directory such as `changes/<id>` and does not print an absolute path.
- `refreshActiveAgentContext` writes `.sdd/active-context.md` and `.sdd/handoff.md` without an absolute machine path.

## CLI integration (one case)

Extend `packages/cli/src/__tests__/cli.integration.test.ts`. The file spawns `packages/cli/dist/index.js`.

- With no `.active`, or a blank one, and another in-progress pack present, `sdd status` exits 1. Stdout or stderr contains `No active change. Pass --change <id> or run \`sdd new\``. Neither stream contains an absolute machine path.
- `sdd status --change <id>` exits 0 and prints the repo-relative change path, not an absolute path.

## Commands

```
pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/init-layout.test.ts src/__tests__/init-force.test.ts src/__tests__/change-context.test.ts src/__tests__/agent-handoff.test.ts src/__tests__/agents.test.ts
pnpm --filter @structured-vibe-coding/cli test
pnpm test
pnpm lint
pnpm typecheck
```

Skip `src/__tests__/agent-handoff.test.ts` in the first command if that assertion lives in `agents.test.ts` instead. Do not record a pass or fail in this file.
