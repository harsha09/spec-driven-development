# Feature

> **Issue 21 workflow and artifact tokens** · `2026-10-23-issue-21-workflow-and-artifact-tokens` · 2026-10-23

## Reading

`sdd workflows` shows each workflow and the token count of every artifact, using the same cl100k count the search pack already uses. A workflow line counts the workflow file. Each artifact line counts the template that stage writes. When a change is active, a second section counts the artifact files on disk. Dollar cost stays out of this view.

## Source

Issue #21, and the request to see those counts without a session import or a price file. This is the product manager's reading. The person can correct it.

## Product owner

The request is one view: tokens for each workflow and its artifacts. Dollar amounts stay off this command. Proposed checks:

- One `sdd workflows` run prints a cl100k count for every copied workflow and for each of its artifact templates.
- A missing template prints `missing` and is left out of the artifact total.
- The active change, when one exists, lists each artifact file and its token count. A file that is not written yet prints `not written`.
- The view prints no dollar amount.

## Non-goals

- No change to `sdd report` or `sdd cost`.
- No price file and no session-log import.
- External search providers stay in issue #25. This slice does not close epic #21.
