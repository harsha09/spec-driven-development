# Design

> **Report a missing tracker record** · `2026-11-04-report-a-missing-tracker-record`

This is the architect's reading. The person has not signed it.

## Approach

`readConnector` accepts `read` for `jira`, `aha`, `asana`, and `azure-devops` after the `x` refusal and the verb check. `seed` on those names still does not open a change. `draft` stays on `slack` and `teams`. GitHub `read` and `seed` stay on the existing source.

The record id is one non-empty line. The default tracker source does not call a network and returns unreadable. A caller may pass a tracker source. Missing prints `<Name> record <id> was not found.` Unreadable prints `<Name> record <id> could not be read.` A returned record prints the id, the title, and the state only when the id matches and both fields are one line.

## Components / modules

`packages/core/src/role/connector.ts` holds the tracker names and the source. The CLI keeps passing the three positionals and does not pass a source, so a person gets the unreadable line. `docs/reference/cli.md` states that a missing record is not invented. Tests live in `packages/core/src/__tests__/role-connector.test.ts` and the CLI connector test.

## Data flow

The CLI passes verb, connector, and record. For a tracker read, core checks the id, asks the source, and returns one of the three results. No other module is called. `createChange` is not called.

## Alternatives considered

Calling each product's API would need a token and a client. This slice does not add one. Treating every id as missing would invent the absence. Unreadable is the result when no source is connected.

## Risks

A later source must use the same lines. It must not add a title when the source says the record is missing.

## Out of scope

No new dependency. No token. No change pack from these connectors.
