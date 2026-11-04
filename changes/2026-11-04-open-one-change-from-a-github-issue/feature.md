# Feature

> **Open one change from a GitHub issue** · `2026-11-04-open-one-change-from-a-github-issue` · 2026-11-04

Issue #37, story S-006. This is the product manager's reading. The person has not signed it. A role does not accept it.

## Problem / opportunity

`sdd role connector read github-issue <number>` prints the number, title, and state. It does not open the change a person would start from that issue. The other connectors and the other actions stay refused.

## Users & value

A person who already read one GitHub issue. One command opens a feature change named from that title and leaves it at intent.

## Scope

`sdd role connector seed github-issue <number>` reads that issue with the same source as the read command. It opens one `feature` change. The title is the issue title. The epic key is `issue-<number>`. The stage stays `intent`. Success prints the number, the change id, and `intent`.

A missing issue, an unreadable issue, a bad number, the connector name `x`, and any connector other than `github-issue` fail with the existing lines and open nothing. Any verb other than `read` and `seed` still prints `That connector action does not run in this slice.`

## Non-goals

Accepting the spec. Posting a comment. Closing the issue. Slack, Teams, Jira, and the other connectors. A role run calling `create_change`. A routine that seeds. Closing #37 or #54. Publishing npm from this change.

## Success criteria

- A fake issue titled `Role agents` opens a change whose `feature.md` still has an empty problem line, whose stage is `intent`, and whose epic is `issue-37`.
- A second seed of the same title opens a second id.
- A missing issue opens nothing.
- A project that cannot open a change prints `A change could not be opened for GitHub issue <number>.` and that line does not contain the project path.
- The existing read, X, and other-action tests stay as they are.
- `pnpm test` passes.

## Product owner

The slice matches the next story: one change from one GitHub issue. The person has not signed this reading.
