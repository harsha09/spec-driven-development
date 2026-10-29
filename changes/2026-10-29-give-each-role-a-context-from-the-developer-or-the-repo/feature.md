# Feature

> **Give each role a context from the developer or the repo** · `2026-10-29-give-each-role-a-context-from-the-developer-or-the-repo` · 2026-10-29

This is a proposal. The person has not signed it.

## Problem

A role runs from its job and description. The developer cannot give that role context, and the role does not build context from this repo and its name.

## Users

A developer who creates a role and wants that role to work from notes they wrote, or from the repo plus optional knowledge.

## Scope

`sdd role context <name> --text` saves the context the developer wrote. `--knowledge` saves optional knowledge. `--generate`, or a role with no saved context, writes context from the repo, the role name, and that knowledge. `sdd role run` includes the saved context. A context that does not fit the run budget is left out of that run. Deleting the role removes the context.

## Out of scope

Room prompts, the handoff Owner line, issue #54, issue #88, and issue #74.
