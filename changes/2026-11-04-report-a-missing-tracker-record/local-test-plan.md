# Local test plan

> **Report a missing tracker record** · `2026-11-04-report-a-missing-tracker-record`

This table is a proposal. It is not a recorded QA result. The person has not signed it.

| # | Case | Expected |
| --- | --- | --- |
| 1 | `read azure-devops 42` with no source | `Azure DevOps record 42 could not be read.` No title. |
| 2 | A source says Aha `IDEA-9` is missing | `Aha record IDEA-9 was not found.` The word Idea is absent. |
| 3 | A source returns Asana `task-1` titled Role agents | Exit 0. Lines are the id, that title, and `OPEN`. |
| 4 | Empty Jira id, and `seed jira PROJ-1` | `A tracker record id is one line of text.` Seed stays out of this slice and opens nothing. |
| 5 | Built CLI `read jira PROJ-1` | `Jira record PROJ-1 could not be read.` |
| 6 | Workspace | `pnpm test` exits 0. |
