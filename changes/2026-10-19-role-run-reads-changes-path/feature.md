# Feature

> **Role run reads changes_path** · `2026-10-19-role-run-reads-changes-path` · 2026-10-19

Issue #46. Epic `issue-37`, story `S-002`. This story does not close #37. Slice 1 of #37 stays as specified except for this path.

## Problem / opportunity

`sdd role run --kind code` (and `scenario` and `release`) reads `<repo>/changes/<change-id>/accepted.md`. It never loads `config.changes_path`. A project initialized with the `.sdd` layout stores that file at `.sdd/changes/<id>/accepted.md`. The runner prints `This needs an accepted section before a draft.` and ignores the real file.

## Users & value

A person whose change packs live under the configured changes directory. The accuracy loop should see the accepted section they wrote there.

## Scope

`runRole` resolves `accepted.md` from `config.changes_path` when `.sdd/config.yaml` exists. The path is `<project>/<changes_path>/<change-id>/accepted.md`. When no config file exists, the path stays `<project>/changes/<change-id>/accepted.md`, so current tests that never call `initProject` keep working.

A missing file or a missing accepted section still exits 1 with `This needs an accepted section before a draft.` and does not call the model. The runner still does not write `accepted.md`.

## Non-goals

- Do not change the section parser, the accuracy loop, or Allow once.
- Do not move existing change packs.
- Do not edit `docs/reference/cli.md` in this story. Story `S-003` owns that section.
- Do not close #37.
- Do not implement #45 or #47 in this story.

## Success criteria

- [x] With `changes_path: .sdd/changes` and an accepted section only under `.sdd/changes/<id>/accepted.md`, `runRole` for `--kind code` calls the model. The same run does not require a repo-root `changes/<id>/accepted.md`.
- [x] A project with no config file still reads repo-root `changes/<id>/accepted.md`.
- [x] A missing section still exits 1 with `This needs an accepted section before a draft.` and makes no model call.
- [x] Existing role tests that use repo-root `changes/` still pass.

## Risks / open questions

No product choice is open. The fallback for a missing config file is only so existing unit tests keep their layout.
