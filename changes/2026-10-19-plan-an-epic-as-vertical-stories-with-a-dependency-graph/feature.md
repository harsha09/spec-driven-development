# Feature

> **Plan an epic as vertical stories with a dependency graph** · `2026-10-19-plan-an-epic-as-vertical-stories-with-a-dependency-graph` · 2026-10-19

Issue #44. `sdd new` opens one change pack and stops there. `meta.branch` and `meta.pr` are never written by a command. `sdd backlog` stays the greenfield `F-001` list. This change adds epic stories, the dependency graph, one branch per story, and one pull request per story.

## Problem

A large feature is a set of vertical slices. Some slices can be built at the same time. Others must wait. Today those relationships are not recorded, so a person cannot ask `sdd` which stories are parallel, which are serial, or which branch and pull request belong to a story.

## Users

A person planning one product repo. The first use after this ships is the remaining work on issue #37. This change does not implement those slices.

## Scope

Each story is a normal change pack. `sdd new` gains three flags. `sdd graph`, `sdd branch`, and `sdd pr` are new commands. No new package. No network call except the explicit `sdd pr` push.

`sdd new "Role handoff" --epic issue-37 --story S-001 -w feature -y --no-agent`

`--story` requires `--epic`. `--depends` requires both. `--depends` is repeatable. Story ids match `S-` plus digits and are stored uppercase. Epic keys match `^[A-Za-z0-9][A-Za-z0-9-]{0,39}$`. A failed check writes no change pack.

Exact failures, exit 1, one stdout line:

- Missing epic: `A story needs an epic.`
- Bad story id: `A story id is not valid.`
- Bad epic key: `An epic key is not valid.`
- Duplicate story id in that epic, including archived changes: `Story S-001 already exists.`
- A depends value that is not a story id: `A story id is not valid.`

A depends target that is not created yet is allowed. `sdd graph` and `sdd branch` report it later.

Change `meta.yaml` gains optional `epic`, `story`, and `depends` (a list). Existing packs without those keys still load. `branch` and `pr` stay as they are.

`sdd graph --epic issue-37` reads open and archived changes with that epic. `--epic` is required. Missing flag: `An epic key is required.`

Wave number is one plus the longest dependency chain. A story with no dependencies is wave 1. The same wave can run at the same time. A later wave is serial after the stories it names.

Stdout, no prefix, stories ordered by story id within a wave:

```
Wave 1
S-001 Role handoff
S-003 Docs
Wave 2
S-002 Connectors after S-001
Parallel: S-001, S-003
Serial: S-002 after S-001
```

A story title is the change title. Several dependencies are comma-separated in story-id order: `after S-001, S-003`. When every story is wave 1, the serial line is `Serial: none`.

Unknown dependency: `S-002 depends on S-009, which is not in this epic.` A cycle: `Story cycle: S-001 -> S-002 -> S-001`. Both exit 1 and print only that line.

`sdd status --list` appends ` issue-37 S-001` when those fields are set. `sdd status` for one change adds `Epic: issue-37` and `Story: S-001` and `Depends: S-001` or `Depends: none`. The handoff adds one line under the change id: `Epic issue-37 story S-001. Depends: none.` It does not paste sibling specs.

`sdd branch story/issue-37/S-001` uses the active change, or `--change <id>`. It creates that branch from `main` unless `--from <ref>` is set, checks it out, and saves `meta.branch`. It does not open a pull request.

It exits 1 and creates no branch when:

- The story still has a dependency that is not `completed`: `S-002 waits on S-001.` Several waits are comma-separated in story-id order.
- A dependency id is missing from the epic: the same sentence as `sdd graph`.
- The epic has a cycle: the same cycle sentence as `sdd graph`.
- The git branch already exists, or `meta.branch` is already set: `Branch already exists.`
- Tracked files differ from HEAD: `Working tree has uncommitted changes.` Untracked files do not count.
- The folder is not a git work tree: `This folder is not a git repository.`
- The base ref is missing: `Base ref main was not found.`
- The name is empty, `.`, `..`, or contains a space or `..`: `A branch name is not valid.`

A story with no dependencies, and a story whose dependencies are all `completed`, may branch. Completed means the archived or open change status is `completed`.

`sdd pr` uses the active change, or `--change <id>`. It requires `meta.branch`, and the current branch must be that name. It pushes with upstream set to `origin`, runs `gh pr create`, and saves `meta.pr.number` and `meta.pr.url`. The title is the change title. The body is the change id and the change path. It does not add `Closes` unless `--closes <n>` is passed once. `--closes` must be a positive integer.

Failures, exit 1, no `meta.pr` write:

- No branch on the change: `This change has no branch.`
- Current branch differs: `Current branch is main, not story/issue-37/S-001.`
- `meta.pr.url` is already set: `This change already has a pull request.`
- `gh` cannot be run: `GitHub CLI is not available.`
- Push or `gh pr create` exits non-zero: stdout is that command's stderr, trimmed, or `The pull request was not created.` when stderr is empty. `meta.pr` stays unset.

On success, stdout is the pull request URL and nothing else.

## Non-goals

- Do not change `sdd backlog` or `F-001`.
- Do not create a branch or a pull request from `sdd new` with no further command.
- Do not stack a story branch onto another story branch.
- Do not merge, and do not close an epic issue unless `--closes` was passed.
- Do not add a package, a hosted tracker, or a multi-repo graph.
- Do not implement issue #37's remaining slices in this change.
- Do not edit `packages/core/src/report.ts`.

## Success criteria

- [x] A second `S-001` in the same epic writes nothing and exits 1 with `Story S-001 already exists.`
- [x] `sdd graph --epic issue-37` prints the wave text above for three fixture changes, including one archived completed story that still satisfies a dependency.
- [x] A cycle and an unknown dependency exit 1 with the sentences above.
- [x] `sdd branch` from `main` records `meta.branch` and leaves HEAD on the new branch. The same command while a dependency is open exits 1 with `S-002 waits on S-001.` and does not create the branch.
- [x] A dirty tracked file blocks `sdd branch`. An untracked file does not.
- [x] `sdd pr` with a fake `git` and `gh` saves the URL and does not write `Closes`. `--closes 44` puts `Closes #44` in the body.
- [x] `sdd backlog list` still prints `F-001` from `memory/features.md`.
- [x] `docs/reference/cli.md` gains one short section for `sdd graph`, `sdd branch`, and `sdd pr`, and one table row for each.

## Risks

`sdd branch` checks out a new branch. Tracked dirty files block it so a checkout cannot carry those edits onto the story branch. Untracked files stay in the work tree, which is the current git behavior.
