# Local test plan

> **Leave a Slack or Teams draft unsent** · `2026-11-04-leave-a-slack-or-teams-draft-unsent`

This table is a proposal. It is not a recorded QA result. The person has not signed it.

| # | Case | Expected |
| --- | --- | --- |
| 1 | `draft slack` and `draft teams` with one line | Exit 0. Lines are the connector, the text, and `not sent`. |
| 2 | `post slack` and `send teams` | `That connector action does not run in this slice.` The line `not sent` is absent. |
| 3 | `draft x` | `A connector cannot read or post on X.` |
| 4 | Empty draft, and `draft jira` | `A draft needs text.` and `That connector is not in this slice.` The GitHub source is not called. |
| 5 | Built CLI | The same Slack draft and the same Teams post refusal. |
| 6 | Workspace | `pnpm test` exits 0. |
