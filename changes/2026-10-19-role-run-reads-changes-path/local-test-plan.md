# Local test plan

> **Role run reads changes_path** · `2026-10-19-role-run-reads-changes-path`

Node v20.19.3. The engine warning for `>=24` is expected. Branch `story/issue-37/S-002` from main `cb20443`.

| # | Check | Expected |
|---|--------|----------|
| 1 | `runRole` with `changes_path: .sdd/changes` and an accepted section only under that directory | The model is called. Repo-root `changes/` is not required. |
| 2 | The same project, missing section | Exit 1, `This needs an accepted section before a draft.`, no model call. |
| 3 | Existing role tests with no config file | They still read repo-root `changes/`. |
| 4 | `pnpm test` | Pass. |
