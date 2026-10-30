# Feature

> **Read one GitHub issue without inventing it** · `2026-10-30-read-one-github-issue-without-inventing-it` · 2026-10-30

Issue #37, development-order item 3, first story. Epic `issue-37`, story `S-005`. This story does not close #37. The reading is a proposal. The person has not signed it.

## Problem / opportunity

A role can draft, critique, hand off, and plan named services. It cannot read a tracker record. The epic says a missing Jira, Aha, Asana, or Azure DevOps record is reported and not invented, a connector does not read or post on X, and a routine cannot invent a pipeline result or write a QA result. None of that exists. `docs/reference/cli.md` still says connectors and routines are not in this slice.

## Users & value

A person who already uses `sdd role` and GitHub issues. They ask for one issue number and see its title and state, or a clear missing line. They can save that read as a routine on a role. They do not get a comment, a close, a merge, or a made-up issue.

## Scope

One read connector, named `github-issue`, and one routine that only runs that read.

`sdd role connector read github-issue <number>` prints the issue number, title, and state when the source returns them. The number is a positive integer. Any other number prints `A GitHub issue number is a positive integer.` and exits 1. A source that has no such issue prints `GitHub issue <number> was not found.` and exits 1. It does not print a title, a state, or a body that the source did not return.

The production source is `gh issue view <number> --json number,title,state`. Tests pass a fake source. A `gh` failure that is not a missing issue prints `GitHub issue <number> could not be read.` and exits 1. The command does not write a file, does not open a change, and does not call `createChange`, `sdd next`, or `sdd complete`.

`sdd role connector read x <anything>` prints `A connector cannot read or post on X.` and exits 1. If the connector name is `x`, every verb prints that same line and does not call `gh`. It does not print `That connector action does not run in this slice.` No other connector name is implemented. `jira`, `slack`, `teams`, `jenkins`, `actions`, and any other name print `That connector is not in this slice.` and exit 1.

`sdd role connector comment`, `close`, `merge`, `deploy`, and any other verb, when the connector is not `x`, print `That connector action does not run in this slice.` and exit 1. They do not call `gh` and they do not stop with Allow once.

A routine lives in the role file frontmatter:

```yaml
routines:
  - name: read-issue-37
    read: github-issue
    record: "37"
```

`sdd role routine run <role> <name>` runs that one read and prints the same lines as the connector command. A missing role prints the existing not-found line. A missing routine name prints `That routine is not on this role.` A `routines` value that is not a list of `name`, `read`, and `record` strings prints `Routines on this role are invalid.` A routine whose `read` is `x` prints `A connector cannot read or post on X.` and does not read. A routine name of `x` is not that refusal. A `write` key prints `A routine cannot write a QA result.` and does not read. Any other extra key prints `Routines on this role are invalid.` and does not read. Only `sdd role routine run` reports those lines. A routine does not post, comment, close, merge, deploy, or write a QA file.

The source runs only for a positive-integer `github-issue` read, including that same read from a valid routine. A bad number, `x`, any other connector name, any other verb, a missing role, a missing or invalid routine, and an extra routine key do not call it.

Role files with no `routines` key stay valid. `sdd role show` and `sdd role run` ignore the key. `sdd role edit`, `pin`, `hide`, and `duplicate` keep the `routines` block, and they do not run it. Hide does not pause it. Duplicate copies it onto the copy. Shipped role templates gain no routines.

A found issue prints exactly three lines and nothing else: the number, the title, and the state, in that order. If the source omits any of the three, print `GitHub issue <number> could not be read.` and do not invent the missing line. Do not print `gh` output, a token, or an issue body.

`docs/reference/cli.md` replaces the sentence that says connectors and routines are not in this slice with these two commands and the limits above.

## Non-goals

Slack, Teams, Jira, Aha, Asana, Azure DevOps, Linear, Jenkins, GitHub Actions, JFrog, SonarQube, Sentry, PagerDuty, Datadog, Confluence, Notion, and Figma. A schedule. A page. Seeding or storing stage progress in GitHub. Reading an issue body into the transcript. Commit, push, tag, pull request, merge, and deploy stay as they are today. Issue #54 stays open. This story does not close #37.

## Success criteria

- A fake source with issue 37 titled `Role agents` and state `OPEN` prints exactly `37`, `Role agents`, and `OPEN`, in that order, and exits 0.
- A fake source with no issue 37 prints `GitHub issue 37 was not found.` and exits 1, with no invented title.
- `sdd role connector read x 1` prints `A connector cannot read or post on X.` and exits 1.
- `sdd role connector comment github-issue 37` prints `That connector action does not run in this slice.` and exits 1, and the fake source is not called.
- A routine `read-issue-37` prints the same found or missing lines. A routine that adds `write: qa` prints `A routine cannot write a QA result.` and does not read.
- `pnpm test` passes. The docs sentence no longer says connectors and routines are absent.

## Risks / open questions

The epic also asks a tracker to seed a change and a Slack draft to wait until the person sends it. This story does neither. A later story on the open epic can add the next connector. A role still cannot call `createChange`. `gh` must already be logged in for a real read. This machine's check uses a fake source, so a live `gh` call is not a success criterion. Pin, hide, edit, and duplicate rewrite the role file today, so they must keep the routines block or the saved read disappears.
