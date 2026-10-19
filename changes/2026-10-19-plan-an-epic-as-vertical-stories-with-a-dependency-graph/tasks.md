# Tasks

> **Plan an epic as vertical stories with a dependency graph** · `2026-10-19-plan-an-epic-as-vertical-stories-with-a-dependency-graph`

- [x] Add `epic`, `story`, and `depends` to `ChangeMeta` and pass them through `createChange`.
- [x] Add `packages/core/src/stories.ts` with draft checks, epic loading, and graph text. Export it from the package index.
- [x] Print the epic lines from `formatStatus` and the handoff. Append them on `sdd status --list`.
- [x] Accept `--epic`, `--story`, and repeatable `--depends` on `sdd new`. Write nothing when the draft is invalid or the story id is taken.
- [x] Add `sdd graph`, `sdd branch`, and `sdd pr` in `packages/cli/src/story-cmd.ts`.
- [x] Cover the feature.md success criteria with core and CLI tests.
- [x] Add the three command rows and one short section to `docs/reference/cli.md`.
