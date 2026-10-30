# Design

> **Read one GitHub issue without inventing it** · `2026-10-30-read-one-github-issue-without-inventing-it`

The person has not signed this change.

## Approach

Read a GitHub issue in a new core module, `packages/core/src/role/connector.ts`. The CLI command in `packages/cli/src/role-cmd.ts` only calls that module. Tests pass a fake source. A real read may spawn `gh issue view <number> --json number,title,state` with no shell.

## Components / modules

`readConnector` owns the verb, the connector name, and the record. `runRoutine` reads the `routines` block from the role file and calls `readConnector` for one saved read. `renderRole` copies that block back when `edit`, `pin`, `hide`, or `duplicate` rewrite the file. `parseRoleDocument` does not treat `routines` as one of its string lists.

## Data flow

A valid `github-issue` read with a positive integer calls the source once. The command prints three lines: number, title, state. A missing issue, a bad number, the name `x`, another connector, another verb, or an invalid routine returns before the source is called, except a source that returns an empty field, which is reported as unreadable and is not invented.

## Alternatives considered

Putting the read inside `run_check` or `.sdd/mcp.yaml` was set aside. Those paths are for allowlisted checks and for search context. This read does not run git and does not open a change.

## Risks

`edit`, `pin`, `hide`, and `duplicate` used to drop unknown frontmatter. They now keep `routines`. A live `gh` login is outside the test. Issue #37 stays open.
