# Feature

> **Leave a Slack or Teams draft unsent** · `2026-11-04-leave-a-slack-or-teams-draft-unsent` · 2026-11-04

Issue #37, story S-007. This is the product manager's reading. The person has not signed it. A role does not accept it.

## Problem / opportunity

A person can read one GitHub issue and open one change from it. The next connector in the epic is a Slack or Teams draft. The role must not post that draft. The person sends it.

## Users & value

A person who wants one line prepared for Slack or Teams. The command prints the draft and says it was not sent. Nothing is posted.

## Scope

`sdd role connector draft slack <text>` and `sdd role connector draft teams <text>` print three lines: the connector name, the text, and `not sent`. The text is one non-empty line. The command does not call Slack, Teams, or any other network.

The connector name `x` is still refused first. `post`, `send`, and any other verb still print `That connector action does not run in this slice.` A draft for any connector other than `slack` or `teams` prints `That connector is not in this slice.` An empty draft prints `A draft needs text.`

## Non-goals

Posting the draft. A Slack or Teams sign-in. Jira, Aha, Asana, Azure DevOps, Jenkins, and GitHub Actions. A routine that drafts. A role run that posts. Accepting the spec. Closing #37 or #54. Publishing npm from this change.

## Success criteria

- `draft slack` and `draft teams` with one line of text exit 0 and print that line and `not sent`.
- `post slack` and `send teams` exit 1 and do not print `not sent`.
- `draft x` prints `A connector cannot read or post on X.`
- An empty draft prints `A draft needs text.`
- The existing GitHub read and seed tests stay as they are.
- `pnpm test` passes.

## Product owner

The slice matches the next story: one unsent draft for Slack and the same unsent draft for Teams. The person has not signed this reading.
