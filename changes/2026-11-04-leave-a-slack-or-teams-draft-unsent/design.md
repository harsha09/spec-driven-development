# Design

> **Leave a Slack or Teams draft unsent** · `2026-11-04-leave-a-slack-or-teams-draft-unsent`

This is the architect's reading. The person has not signed it.

## Approach

`readConnector` gains the verb `draft`. The connector name `x` is still refused first. A verb other than `read`, `seed`, or `draft` still does not run. `read` and `seed` stay on `github-issue`. `draft` accepts only `slack` and `teams`.

The record is one non-empty line. Success prints the connector name, that line, and `not sent`. The function does not spawn a process, open a socket, or write a file.

## Components / modules

`packages/core/src/role/connector.ts` holds the verb. `packages/cli/src/role-cmd.ts` keeps passing the three positionals. `docs/reference/cli.md` states that the draft is not posted. Tests live in `packages/core/src/__tests__/role-connector.test.ts` and the existing CLI refusal test.

## Data flow

The CLI passes verb, connector, and record. For `draft`, the core checks the name and the line, then returns the three lines. No other module is called.

## Alternatives considered

Writing the draft into the change pack would store it as a product file. This slice only returns it to the person. A Slack or Teams client would be a post path, and this slice does not add one.

## Risks

A later story must not treat `not sent` as permission to post. `post` and `send` stay refused.

## Out of scope

No new dependency. No token. No channel. No other connector.
