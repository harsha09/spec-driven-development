# Tasks

> **Read one GitHub issue without inventing it** · `2026-10-30-read-one-github-issue-without-inventing-it`

The person has not signed this change.

## Breakdown

- [x] Add `readConnector` and `runRoutine` in `packages/core/src/role/connector.ts`, and keep the `routines` block when a role file is rewritten.
- [x] Wrap those functions with `sdd role connector` and `sdd role routine run`.
- [x] Replace the docs sentence that says connectors and routines are absent.
- [x] Cover a found issue, a missing issue, the `x` refusal, a write key, and pin, hide, edit, and duplicate.

## Traceability

The read and the routine follow the feature scope. A role still cannot call `createChange`. Slack, Jira, Jenkins, and issue #54 stay out.
