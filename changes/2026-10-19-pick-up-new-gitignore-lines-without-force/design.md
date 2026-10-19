# Design

> **Pick up new gitignore lines without --force** · `2026-10-19-pick-up-new-gitignore-lines-without-force`

The sentences in `feature.md` are the contract.

## Ignore repair

`packages/core/src/init.ts` exports `repairRequiredIgnores(projectRoot)`. It loads the existing config and does not write it. It appends missing lines to `.sdd/.gitignore` and to `<changes_path>/.gitignore` through the current `ensureIgnoreEntries` helper. It returns true when a line was added.

When `initProject` sees an existing config and `force` is false, it calls that function and returns `{ created, config, kept: [], warnings: [] }`. It does not merge defaults, save config, or reconcile workflows.

## CLI

`runSpeckitStyleInit` in `packages/cli/src/init-flow.ts`, when the project is initialized, `--force` is absent, and the session is not interactive (`--no-agent` counts as not interactive), calls `repairRequiredIgnores` and returns. It does not call `initProject` with `force: true`. Stdout contains `Added missing ignore lines.` or `Ignore lines are already present.`

The interactive confirm path is unchanged.

## Docs and tests

Update the second-init sentences in `docs/reference/cli.md`, `docs/reference/layout.md`, and `docs/reference/agents.md`.

Replace the core test that expects a throw and an unchanged ignore file. Update the CLI test that expects exit 1 on a second `sdd init --here --no-agent`. Keep the `--force` preservation test.
