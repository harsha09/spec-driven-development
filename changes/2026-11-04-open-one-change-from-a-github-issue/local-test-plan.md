# Local test plan

> **Open one change from a GitHub issue** · `2026-11-04-open-one-change-from-a-github-issue`

This table is a proposal. It is not a recorded QA result. The person has not signed it.

| # | Case | Expected |
| --- | --- | --- |
| 1 | Seed a fake issue 37 titled Role agents | Exit 0. Lines are the number, a change id, and `intent`. Epic is `issue-37`. The problem line is still `-`. The state `OPEN` is not in `feature.md`. |
| 2 | Seed the same title again | A second change id. The source is called once more. |
| 3 | Missing issue 99 | `GitHub issue 99 was not found.` The change directory list is unchanged. |
| 4 | Seed in a folder with no workflow | `A change could not be opened for GitHub issue 37.` The path is absent. |
| 5 | Existing read, X, comment, and other connectors | Unchanged refusals. The source is not called. |
| 6 | Workspace | `pnpm test` exits 0. |
