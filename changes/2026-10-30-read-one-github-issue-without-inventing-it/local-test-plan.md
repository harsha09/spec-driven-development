# Local test plan

> **Read one GitHub issue without inventing it** · `2026-10-30-read-one-github-issue-without-inventing-it`

This plan is a proposal. The person has not signed this change.

## Environment

`pnpm test` from the repo root. Node v20 is the machine version. The engine warning for Node 24 is expected. The GitHub read is covered with a fake source. This plan does not call `gh`.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Found issue | Core test `role-connector.test.ts` | Three lines: `37`, `Role agents`, `OPEN` |
| 2 | Missing issue | Same test, source returns missing | `GitHub issue 37 was not found.` and no invented title |
| 3 | Refusals | `x`, another connector, comment, close, merge, deploy, a bad number | The fixed line, and the source is not called |
| 4 | Routine | Saved read, a `write` key, pin, hide, edit, duplicate | The read repeats. A write is refused. The block stays. |
| 5 | CLI | `connector-cli.integration.test.ts` | `x` and `comment` and `jira` exit 1 with the fixed lines |

## Out of scope this change

Slack, Teams, Jira, Jenkins, GitHub Actions, seeding a change, and issue #54. This story does not close #37.
