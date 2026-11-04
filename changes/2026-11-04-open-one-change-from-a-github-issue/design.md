# Design

> **Open one change from a GitHub issue** · `2026-11-04-open-one-change-from-a-github-issue`

This is the architect's reading. The person has not signed it.

## Approach

`readConnector` gains the verb `seed`. The refusal order stays: the connector name `x` first, then a verb other than `read` or `seed`, then a connector other than `github-issue`, then the number. The same `IssueSource` reads the issue. Seed does not call GitHub a second way.

On success, seed calls `createChange` with workflow `feature`, the issue title, and epic `issue-<number>`. It does not set a story id, does not advance the stage, and does not write over the feature template. The printed lines are the number, the change id, and the stage.

`sdd role run` still refuses `create_change`. A routine still only reads.

## Out of scope

No new dependency. No comment, close, or post. No other connector.
