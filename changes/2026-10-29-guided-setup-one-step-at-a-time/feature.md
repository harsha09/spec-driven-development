# Feature

> **Guided setup one step at a time** · `2026-10-29-guided-setup-one-step-at-a-time`

The product manager proposes this reading. The person has not signed it.

## Problem

`sdd setup` asks for a workflow, writes planner, architect, and builder when the roles folder is empty, and can start one change. A developer who already has a folder, a host, or a role file cannot pick the one piece that is still missing.

## Scope

`sdd setup` on a terminal walks folder, workflow, host, roles, model, a check, and an optional first change. Enter keeps a first-time walk moving: feature, no host, the three duties when no role file exists, and a line that a draft needs `SDD_ROLE_MODEL`. The same command can run one piece with `--step`. A later visit leaves files that are already there. `sdd setup --yes` and a non-terminal run keep today's path.

## Non-goals

No second command. No resume file. No write of the model command into the repo. Software team stays a choice on the roles piece, and it writes nothing when its files already exist. Filling one missing duty beside other role files stays out of this slice. No sandbox. The room parser stays as it is. A role does not sign.

## Success

A person can finish setup by pressing Enter, can run `sdd setup --step model` later, and can see `--yes` still create only the three duties.

## Reading

This file is a proposal. It is not an acceptance.
