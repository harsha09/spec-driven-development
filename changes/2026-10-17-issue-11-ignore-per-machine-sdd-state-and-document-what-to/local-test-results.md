# Local test results

Recorded 2026-10-17 after an independent QA run and a follow-up fix for absolute paths on other commands.

## QA (independent, before the follow-up)

VERDICT: PASS against the approved acceptance table.

| Command | Exit | Result |
|---|---|---|
| Core vitest: init-layout, init-force, change-context, agent-handoff, agents | 0 | 5 files, 33 tests passed |
| `pnpm --filter @structured-vibe-coding/cli test` | 0 | 2 files, 30 tests passed |
| `pnpm test` | 0 | core 179 tests, cli 30 tests |
| `pnpm lint` | 0 | 88 files |
| `pnpm typecheck` | 0 | clean |

Node is v20.19.3. Engine warnings for `>=24` are expected.

## Follow-up found by QA

`sdd new`, `sdd greenfield`, and `sdd backlog start` still logged `ctx.path`. `sdd doctor` logged an absolute "Open next" path. `Handoff:` logged the absolute handoff file. `sdd backlog list` logged an absolute features path. Those lines now use the repo-relative change path, `.sdd/handoff.md`, or a project-relative path.

## Re-check after the follow-up

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter @structured-vibe-coding/cli test` | 0 | 2 files, 30 tests passed |
| CLI `tsc --noEmit` | 0 | clean |
| Biome on the three edited CLI files | 0 | no fixes |

New assertions: `sdd new`, greenfield, and backlog start stdout contain `Path: changes/` and do not contain the temp project root. Backlog list prints `memory/features.md`. Handoff log is `Handoff: .sdd/handoff.md`.

## Second follow-up

Refine briefs and `.sdd/refine-brief.md` embedded absolute artifact paths. The brief, kickoff, and pointer now use repo-relative paths. Verify, complete, `sdd agent --print`, code-context, and refine command logs do the same.

| Command | Exit | Result |
|---|---|---|
| `vitest run src/__tests__/refine.test.ts` | 0 | 3 tests passed. Brief, kickoff, and pointer do not contain the temp root |
| `pnpm --filter @structured-vibe-coding/cli test` | 0 | 30 tests passed |
| Biome on the edited core and CLI files | 0 | no fixes |
