# Local test plan

> **Pick up new gitignore lines without --force** · `2026-10-19-pick-up-new-gitignore-lines-without-force`

Node v20.19.3. Branch `story/issue-37/S-001` from main `cb20443`. The `EBADENGINE` warning for `engines.node >= 24` is expected.

| # | Check | Expected |
|---|--------|----------|
| 1 | `initProject` without `force` after `.sdd/.gitignore` is replaced with `extra` | File starts with `extra`, contains `role-runs/`, and a second call does not change it. Config and `feature.yaml` stay byte-identical. |
| 2 | Custom `changes_path: .sdd/changes` and a changes ignore of `extra` | That file becomes `extra` plus `.active`. Config stays the edited text. The default `changes/.gitignore` stays `.active`. |
| 3 | Second `sdd init --here --no-agent` | Exit 0. Stdout contains `Added missing ignore lines.` Config and an edited workflow stay byte-identical. A third run prints `Ignore lines are already present.` and does not change the ignore file. |
| 4 | `sdd init --here --no-agent --force` with a custom `changes_path` and edited workflow and template | Those edits stay. The command still lists the kept files. |
| 5 | Interactive decline | The decline branch in `maybeConfirmNonEmpty` is unchanged and exits before a write. No TTY test. |
| 6 | `pnpm test` | Pass. |
