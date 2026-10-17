# Acceptance

Local results for issue #11. No absolute machine path may appear in the files or stdout called out below.

| Scenario | Expected local result |
|---|---|
| Fresh init | `sdd init` creates `.sdd/.gitignore` ignoring `handoff.md` and `active-context.md`. It creates or updates a gitignore in the configured changes directory. The default is `changes/.gitignore` containing `.active`. It does not ignore all of `.sdd/` or all of `changes/`. |
| Second init without `--force` | `initProject` throws the already-initialized error before writing. Non-interactive `sdd init` exits 1. Gitignore bytes are unchanged, including a file that is missing a required line. |
| `init --force` | Line-merge only. A missing uncommented line whose trimmed text is exactly `handoff.md`, `active-context.md`, or `.active` is appended to the matching gitignore. Other lines are not dropped, reordered, or rewritten. The file is not replaced. These gitignores are not `sdd:generated` and do not go through `reconcileGeneratedTree`. |
| `init --root .sdd` | Namespaced init ignores `.sdd/changes/.active` via `.sdd/changes/.gitignore` containing `.active`. It must not only write a repository-root `changes/.gitignore`. `.sdd/.gitignore` still ignores `handoff.md` and `active-context.md`. |
| Already-tracked files | A path is already tracked only when `git` reports that repo-relative path in the index (`.sdd/active-context.md`, `.sdd/handoff.md`, or `<changes_path>/.active`). Each such path is named in `InitResult.warnings`. The CLI prints that warning. Init does not run `git rm` or any index-changing git command. |
| Git unavailable | If the directory is not a git work tree, `git` is missing, or `git` exits non-zero or fails to spawn: init does not throw, does not emit the tracked-file warning, and still writes the gitignore files. |
| Empty `.active` does not select another in-progress pack | When `.active` is missing, empty, or whitespace, `getActiveChangeId` returns null. Temp-project fixtures with status `in_progress` or `blocked` are not selected. The historical pack id stays out of the test. `sdd status` exits 1 and includes `No active change. Pass --change <id> or run \`sdd new\`.` on stdout or stderr. Explicit `--change <id>` still opens that change. |
| Handoff, active-context, and status contain no absolute path | Generated status (`formatStatus`), `.sdd/active-context.md`, and `.sdd/handoff.md` print the change directory repo-relative, for example `changes/<id>`, and contain no absolute machine path. `sdd status` stdout uses that same repo-relative path so a copied log does not leak the machine path. |
| Docs contain the commit/ignore sentence | `docs/reference/layout.md` and `docs/reference/cli.md` say to commit config, workflows, templates, protocol, memory, and change packs, and to ignore `handoff.md`, `active-context.md`, and `<changes_path>/.active`. |
