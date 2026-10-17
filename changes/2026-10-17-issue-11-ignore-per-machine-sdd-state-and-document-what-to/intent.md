# Intent

> **Issue #11: ignore per-machine SDD state and document what to commit** · `2026-10-17-issue-11-ignore-per-machine-sdd-state-and-document-what-to` · 2026-10-17

## Problem

After `sdd new`, `sdd next`, or `sdd verify`, git shows edits to `.sdd/active-context.md`, `.sdd/handoff.md`, and `changes/.active`. Those markdown files embed an absolute machine path. `formatStatus` in `packages/core/src/agent-handoff.ts` writes `Path: ${ctx.path}`. `refreshActiveAgentContext` in `packages/core/src/agents.ts` embeds that status and the full handoff into the active-context file. `changes/.active` is a per-developer pointer written by `setActiveChange` in `packages/core/src/change-context.ts`.

`sdd init` does not write a gitignore for these files. The docs do not say what to commit.

A second bug shares this change. `getActiveChangeId`, when `.active` is missing or empty or whitespace, selects the newest change meta whose status is `in_progress` or `blocked`. That wrongly activated the already-merged pack `2026-10-11-fix-open-bugs-7-8-9-10-19-20`.

## Decision

Do both. This is closed; it is not an open alternative.

1. **Ignore per-machine files on init.** On a fresh init, write `.sdd/.gitignore` ignoring `handoff.md` and `active-context.md`. Write or update a gitignore at the configured changes directory ignoring `.active`. The default file is `changes/.gitignore` and the line is `.active`. These two gitignore files are not `sdd:generated` files and must not go through `reconcileGeneratedTree`. On `init --force`, line-merge: if an uncommented line whose trimmed text is exactly `handoff.md`, `active-context.md`, or `.active` is missing from the matching file, append that line. Do not drop, reorder, or rewrite other lines, and do not replace the file. A non-force re-init keeps today's abort: `initProject` throws the already-initialized error before writing, and a missing required line is not repaired on that path. Namespaced `sdd init --root .sdd` must ignore `.sdd/changes/.active`, not only a repository-root `changes/.active`. A path is already tracked only when `git` reports it in the index, using the repo-relative path `.sdd/active-context.md`, `.sdd/handoff.md`, or `<changes_path>/.active`. Each such path is named in `InitResult.warnings` (the CLI already prints that array). Do not run `git rm` or any index-changing git command. If the directory is not a git work tree, `git` is missing, or `git` exits non-zero or fails to spawn: do not throw, do not emit the tracked-file warning, and still write the gitignore files.

2. **Print repo-relative change paths.** Generated status, active-context, and handoff must print the change directory repo-relative, for example `changes/<id>`, never an absolute machine path. `sdd status` stdout may stay human-friendly, but it must not be the only copy that is safe to share. The committed-risk files are the markdown ones, and those must be relative. `sdd status` stdout must also use the repo-relative path so a copied log does not leak the machine path.

3. **Empty pointer means no active change.** If `.active` is missing, empty, or whitespace, `getActiveChangeId` returns null. Do not adopt another pack. A unit test proves this with temp-project fixtures whose meta status is `in_progress` or `blocked`. The historical id `2026-10-11-fix-open-bugs-7-8-9-10-19-20` stays in the problem statement only and is not required inside a test. `sdd status` with no pointer exits 1 and reports `No active change. Pass --change <id> or run \`sdd new\`.` on stdout or stderr. An explicit `--change <id>` still works.

## Docs to update

Update these during implementation:

- `docs/reference/layout.md`
- `docs/reference/cli.md`

State the commit set and the ignore set in both: commit config, workflows, templates, protocol, memory, and change packs. Ignore `handoff.md`, `active-context.md`, and `<changes_path>/.active`.

## Out of scope

- Rewriting history of old change packs.
- Ignoring the whole `changes/` directory or the whole `.sdd/` directory.
- Changing workflow stage order.
- Implementing issues #27 or #21–#26.

## Local success check

Fresh init writes both gitignore files. `init --force` line-merges missing required entries and keeps extra user lines. A non-force re-init aborts with the already-initialized error and leaves gitignore bytes unchanged. `sdd init --root .sdd` ignores `.sdd/changes/.active`. Already-tracked pointer or handoff files produce a warning and are not removed. A missing git executable or a non-repository does not throw and does not warn. A missing or blank `.active` does not select a fixture in-progress pack, and `sdd status` reports no active change. Handoff, active-context, and status text use a repo-relative change path. The two reference docs state what to commit and what to ignore.
