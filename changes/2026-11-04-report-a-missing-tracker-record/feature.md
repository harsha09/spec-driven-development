# Feature

> **Report a missing tracker record** · `2026-11-04-report-a-missing-tracker-record` · 2026-11-04

Issue #37, story S-008. This is the product manager's reading. The person has not signed it. A role does not accept it.

## Problem / opportunity

A person can read a GitHub issue and can leave a Slack or Teams draft unsent. Jira, Aha, Asana, and Azure DevOps are still outside this slice. A missing record on those trackers must be reported. The command must not invent a title or a state.

## Users & value

A person who names one of those trackers. With no source connected, the record could not be read. When a source says the record is missing, the line says it was not found and includes no invented title.

## Scope

`sdd role connector read jira <id>`, and the same read for `aha`, `asana`, and `azure-devops`, take one record id. The id is one non-empty line. This slice does not call those products. The default result is `Jira record <id> could not be read.`, with the product name for the other three. A source that reports the record missing prints `<Name> record <id> was not found.` A source that returns an id, a title, and a state prints those three lines and nothing else.

`seed` on these connectors does not open a change. The connector name `x` is still refused first.

## Non-goals

A Jira, Aha, Asana, or Azure DevOps client. A token. Opening a change from these trackers. Jenkins and GitHub Actions. Posting a Slack or Teams draft. Accepting the spec. Closing #37 or #54. Publishing npm from this change.

## Success criteria

- `read jira PROJ-1` with no source prints `Jira record PROJ-1 could not be read.` and does not print a title.
- A source that says the record is missing prints `was not found` and does not print a title.
- A source that returns a title and a state prints only the id, that title, and that state.
- An empty id prints `A tracker record id is one line of text.`
- `seed jira PROJ-1` does not open a change.
- The GitHub read, the GitHub seed, and the unsent draft stay as they are.
- `pnpm test` passes.

## Product owner

The slice matches the next story: a missing tracker record is reported and is not invented. The person has not signed this reading.
