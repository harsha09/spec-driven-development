# Local test plan

> **Plan an epic as vertical stories with a dependency graph** · `2026-10-19-plan-an-epic-as-vertical-stories-with-a-dependency-graph`

## Environment

- Node v20.19.3. `pnpm lint`, `pnpm typecheck`, and `pnpm test` from the repo root.
- Branch `feat/epic-story-graph` from `main` at `aecf412`. No network. Pull requests use a fake `git` and `gh`.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Duplicate story | `sdd new` twice with `issue-37` and `S-001` | Exit 1, `Story S-001 already exists.`, no second pack |
| 2 | Waves | Three stories, `S-001` archived and completed, `S-002` depends on it, `S-003` does not | The wave text in `feature.md` |
| 3 | Cycle and unknown | Graph fixtures | The cycle sentence and the unknown-dependency sentence |
| 4 | Branch gate | `sdd branch` for `S-002` while `S-001` is open | Exit 1, `S-002 waits on S-001.`, HEAD stays put |
| 5 | Branch | Untracked file, then `sdd branch` for `S-001` | New branch from `main`, untracked file remains |
| 6 | Dirty tree | Tracked edit, then `sdd branch` | Exit 1, `Working tree has uncommitted changes.` |
| 7 | Pull request | Fake `git` and `gh` | URL saved, body has no `Closes`. `--closes 44` adds `Closes #44` |
| 8 | Backlog | Existing greenfield backlog test | `sdd backlog list` still prints `F-001` |

## Out of scope this change

- Issue #37's remaining product slices.
- Merging a pull request.
