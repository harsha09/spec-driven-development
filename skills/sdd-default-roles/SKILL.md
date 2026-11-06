---
name: sdd-default-roles
description: Tell the shipped planner, architect, and builder which skill procedure to follow without rewriting the role files sdd setup writes. Use when an agent is about to fill a stage for those duties or for the software-team roles.
---

# Default roles

## Purpose

Keep the short role files the CLI writes, and point each duty at a procedure that is long enough to do the work. The role file is the routing contract: job, owns, never, questions, and stages. The skill is the procedure. Pasting a skill into `.sdd/roles/*.md` would change files `sdd setup` owns and would mix product rules into the role body.

`sdd setup` still writes planner, architect, and builder when the roles directory is empty. `sdd team init --template software` still writes the software roles. This skill does not edit those files and does not change `sdd go`.

## When to use

Use it when you are about to draft a stage note for a shipped duty, or when a person asks how the thin role file relates to the skill pack. Do not use it to replace a role file, to add a role, or to change `team.yaml`.

## Configuration

Product nouns, extra bans, tools, and path commands stay in `.sdd/skill-config.yaml`. The field list is `skills/product-config.md`. A role file does not gain a product name, a vendor, or a command.

| Duty or role | Procedure | What stays in the role file |
| --- | --- | --- |
| planner | Ask the questions already in that file, one at a time. Write the stage artifact under its existing headings. Do not design and do not write product code. | `ask_human_when`, `never` including accept a spec and write product code |
| architect | When the artifact is `design.md`, `hld.md`, or `lld.md`, follow `sdd-design-writer`. | `never` including accept a spec and write product code |
| builder, developer | Follow `sdd-smallest-change`. | `never` including accept a spec and generate a release |
| qa | Follow `sdd-qa-writer`. | `never` including accept a spec, record a QA result, and generate a release |
| product-owner | Ask whether the reading matches. Do not record the decision. | `never` including accept a spec and record a decision |
| product-manager | Write the short reading. Do not accept it. | `never` including accept a spec and write product code |
| dev-lead | Name the next owner. Do not write that owner's artifact. | `never` including accept a spec and write a specialist's artifact |

Acceptance work, whoever is asked to prepare it, follows `sdd-acceptance-gate`. A visible change can follow `sdd-ux-writer` and then `sdd-ui-binder`. Constitution work follows `sdd-constitution-interview` and is not an ordinary feature stage.

## Procedure

1. Read the role file for the duty you were given. Obey its `never` list and its `ask_human_when` questions even if this skill is shorter on that point.
2. Read `.sdd/skill-config.yaml`. Empty keys are questions, not defaults you invent. `authority` may be treated as `human` when it is omitted.
3. Follow the procedure in the table. Do not merge two roles' outputs into one file.
4. Leave the role file, `team.yaml`, and `routing.yaml` unchanged.
5. Stop before any sign-off command. The person decides.

`sdd go` with `SDD_ROLE_MODEL` still uses the guide prompt and the bundled headings. This pack does not change that prompt. When you are the agent writing the file, follow the design writer instead of stopping at the five template headings.

## Output

No new role file. The output is the artifact the stage already requires, written by the procedure in the table.

## Never

- Do not rewrite `.sdd/roles` to paste a skill into the role body.
- Do not replace `approvers: human` with a person's name.
- Do not skip `sdd` stage commands the person is using (`sdd next`, `sdd skip`, `sdd complete`).
- Do not give the planner or the architect product code to write.
- Do not give the builder a release to generate.
- Do not record a QA result or a product decision the role file says the person records.
- Also follow `banned_actions` from the product config.

## Ask a human

- Two role files list the same stage. `sdd role route` already prints `Ask the human.` in that case. Do not pick a winner.
- The role file and this table disagree. The role file's `never` list wins, and you ask before doing anything the file forbids.
- The product wants a new role. Point them at `sdd role create`. Do not create it by editing the skill pack.
