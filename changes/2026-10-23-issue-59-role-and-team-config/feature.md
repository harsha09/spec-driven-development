# Feature

> **Issue 59 role and team config** · `2026-10-23-issue-59-role-and-team-config` · 2026-10-23

## Problem / opportunity

A role file only stores a label, a job, and a few flags. Nothing says what the role owns, what it reads, what it produces, or who approves it. There is no team file, so later work cannot tell bots, human approvers, work-in-progress limits, or the branch pattern apart. The four host stubs are two or three lines each.

## Users & value

Someone who wants their own team, not a fixed one, runs one command and gets a working team from a template. They add, remove, or rename roles by editing plain files. Later steps read this config.

## Scope

- Role files at `.sdd/roles/<name>.md` can store job, owns, inputs, outputs, collaborates, reviews, approvers, never, ask_human_when, skills, rules, and goals.
- `.sdd/team.yaml` lists bots, human approvers by name, a work-in-progress limit per bot and optionally per role, the rooms commit switch, and the bot branch pattern.
- `sdd team init --template <name>`, `sdd team show`, and `sdd role create <name> --template <t>`. `sdd role show` already prints a role file.
- Shipped templates: software (product-manager, architect, product-owner, dev-lead, developer, plus a human), solo, and research.
- The host stubs `sdd`, `sdd-planner`, `sdd-implementer`, and `sdd-reviewer` state owns, never, checks, and ask when.

## Non-goals

- Rooms, the router, model selection, evidence by SHA, and approval enforcement. Those are later issues. This change stores the rooms commit switch and does not open a room.
- An `sdd agent create` alias.
- Overwriting an existing team file or an existing role file.

## Success criteria

- `sdd team init --template software` writes `.sdd/team.yaml` and the five role files. A second run writes nothing.
- A human whose name matches `git config user.name` is marked `(you)` by `sdd team show`.
- `sdd role create builder --template product-manager` writes that role. `developer` alone names both software and solo.
- A plain `sdd role create` file does not grow empty list fields. Editing the job keeps owns.
- Each host stub contains Owns, Never, Checks, and Ask when.

## Risks / open questions

- A template role name that already exists blocks the whole init, including roles that are new. That is the chosen fail-before-write rule.
- The approver value `human` means the people listed in `team.yaml`, not a role file of that name.
