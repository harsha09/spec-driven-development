# Feature

> **Pick up new gitignore lines without --force** · `2026-10-19-pick-up-new-gitignore-lines-without-force` · 2026-10-19

Issue #45. Epic `issue-37`, story `S-001`. This story does not close #37.

## Problem / opportunity

A project that already has `.sdd/config.yaml` cannot pick up a new required ignore line. Non-interactive `sdd init` stops in `maybeConfirmNonEmpty` before `initProject` runs. `initProject` itself also throws at the existing-config check when `force` is false, and `ensureIgnoreEntries` (including `role-runs/`) runs only after that check. `--force` appends the line, and it also merges config defaults and refreshes unchanged generated workflows and templates.

## Users & value

A person who upgrades `sdd` in a repo that is already initialized. They should get new ignore lines, including `role-runs/`, without a full re-init.

## Scope

Non-interactive `sdd init` on an existing project, without `--force`, appends missing required lines and exits 0. Required lines are the `.sdd/.gitignore` list (`handoff.md`, `active-context.md`, `index.db`, `index.db-journal`, `index.db-wal`, `index.db-shm`, `models/`, `role-runs/`) and `<changes_path>/.gitignore` line `.active`. A missing ignore file is created. Existing lines and comments stay. The command does not rewrite `.sdd/config.yaml`, memory, workflows, templates, protocol, or other generated files.

Stdout contains one sentence. When a line was added: `Added missing ignore lines.` When every required line is already present: `Ignore lines are already present.` The setup intro may also be printed. The command does not print the already-initialized error.

`initProject` with `force: false` and an existing config does the same ignore update and returns. It does not throw `Already initialized`.

`--force` stays the full refresh. An interactive re-init prompt is unchanged: declining writes nothing; confirming still refreshes unchanged generated files.

`docs/reference/cli.md`, `docs/reference/layout.md`, and `docs/reference/agents.md` say that a second init without `--force` adds missing ignore lines and does not refresh workflows. The old sentence that a second init writes nothing is removed.

## Non-goals

- Do not change #36. Do not refresh an edited workflow or template without `--force`.
- Do not merge config defaults on this path.
- Do not close #37.
- Do not implement #46 or #47 in this story.

## Success criteria

- [x] A project whose `.sdd/.gitignore` ends before `role-runs/` gains that line from `sdd init --here --no-agent` with no `--force`. Exit code is 0. Config and an edited workflow file are byte-for-byte unchanged.
- [x] A second run, when every required line is present, exits 0 with `Ignore lines are already present.` and does not duplicate lines.
- [x] `initProject({ force: false })` on an existing project appends the missing line and does not throw.
- [x] `sdd init --force` still keeps an edited workflow and a custom `changes_path`.
- [x] Declining the interactive re-init prompt writes nothing.

## Risks / open questions

The old #15 test expects exit 1 and the already-initialized explanation. This story replaces that stop for the non-interactive path. The `--force` preservation test stays.
