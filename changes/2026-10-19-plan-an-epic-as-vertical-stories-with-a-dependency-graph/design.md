# Design

> **Plan an epic as vertical stories with a dependency graph** · `2026-10-19-plan-an-epic-as-vertical-stories-with-a-dependency-graph`

The sentences in `feature.md` are the contract. This file names the modules.

## Data

`ChangeMeta` gains optional `epic` and `story`, and `depends` as a string list that defaults to empty. `branch` and `pr` stay. A story id is stored uppercase. An epic key is stored as typed.

`packages/core/src/stories.ts` owns parsing, duplicate lookup, loading open and archived changes, and the graph text. It does not spawn git. `packages/cli/src/story-cmd.ts` owns `sdd graph`, `sdd branch`, and `sdd pr`. User sentences go to stdout with no consola prefix, then a non-zero exit.

## Graph

Load every change whose `epic` and `story` are set. Wave number is one plus the longest dependency chain. Print waves in order, stories in story-id order inside a wave. A story with dependencies appends `after` and those ids sorted. Then one `Parallel:` line per wave that has two or more stories, or `Parallel: none`. Then one `Serial:` line per story that has dependencies, or `Serial: none`.

Unknown dependencies and cycles use the feature.md sentences and exit 1. Visit stories in story-id order so the cycle text is stable.

## Branch and pull request

`sdd branch <name>` checks the name, then the graph, then open dependencies, then `meta.branch`, then git. The base ref defaults to `main`. `git switch -c <name> <base>` runs only after those checks. Save `meta.branch` after the switch succeeds.

`sdd pr` checks the saved branch, the current branch, and an existing `meta.pr.url` before `git push --set-upstream origin <branch>` and `gh pr create`. The body is the change id, the change path, and `Closes #<n>` only when `--closes` is a positive integer. Save `meta.pr` only when the command prints a pull request URL.

## Docs and status

`formatStatus` prints `Epic`, `Story`, and `Depends` when a story is set. The handoff line is the feature.md sentence and is omitted when there is no story. `sdd status --list` appends the epic and story. `docs/reference/cli.md` gains three command rows and one short section. `sdd backlog` is unchanged.

## Tests

Core tests cover the wave text, a completed archived dependency, a cycle, an unknown id, and a duplicate story id. CLI tests use a temporary git repo for `sdd branch`, and a fake `git` and `gh` on `PATH` for `sdd pr`.
