---
name: sdd-design-writer
description: Write a finished design.md for an sdd change, with the approach, components, data flow, contracts, alternatives, edge cases, race conditions, risks and mitigations, out of scope, and acceptance. Use when the stage is design, architecture, hld, or lld, or when a person asks for a design note.
---

# Design writer

## Purpose

Write the design note for one change so a later implementer can build it and a later reader can reject it. The note names one approach, the contracts that protect it, the cases and races that can break it, and the result a person can check. A short module list is not a design.

The bundled `design.md` template is the minimum the CLI copies: approach, components, data flow, alternatives, and risks. This skill keeps those and adds contracts, edge cases, race conditions, a mitigation for every risk, out of scope, and acceptance. `sdd init` is unchanged. Copy `assets/design.md` over a product's `.sdd/templates/design.md` only when that product wants new changes to start from this skeleton, and never over a template the product has already edited.

## When to use

### Use this skill

- The active stage is `design`, `architecture`, `hld`, or `lld`.
- A person asks for a design note, a module map with seams, or a review of races and risks.
- `brainstorm.md` exists and someone must choose one approach.

### Do not use this skill

- The workflow has no design stage, such as hotfix, and the person did not ask for a design.
- The reading (`feature.md`, `intent.md`, or `requirements.md`) is still a template. Stop and fill that first.
- The task is to implement, to sign a gate, or to edit `constitution.md`.

## Configuration

Read `.sdd/skill-config.yaml` in the product repository. The keys are listed in `skills/product-config.md` in this repository. If that explanation is not in the product repo, ask the person for each empty key. Do not guess.

| Key | When it is empty |
| --- | --- |
| `product_name` | Say "the product" until the person gives a name. |
| `authority` | Treat the approver as `human`, the person. |
| `constitution_path` | Read `memory/constitution.md` when that file exists. |
| `design_artifact` | Write `design.md` in the active change directory. |
| `persistence` | Describe what must be durable and what must stay consistent. Do not name an engine, a vendor, or a hosted service. |
| `module_roots` | Do not invent source paths. Name components by responsibility. |
| `banned_actions` | Follow this skill's never list only. |
| `tools` and `verify_commands` | Do not run a command. This skill writes the note. |

Also read the change files that already exist: the accepted reading, `brainstorm.md` when present, and any clarify note. Read the constitution when it has prose. Do not edit it.

## Procedure

1. Confirm the reading is substantive. If it could describe two products, ask one question and stop.
2. Read the constitution. A sentence there beats a convenient design. If the request conflicts with it, stop and ask. Do not "fix" the constitution.
3. Read the brainstorm when it exists. Otherwise list at least two alternatives yourself, then reject them in the note.
4. Choose one mechanism. Say what is stored, what changes together, and what a retry does.
5. Draft the artifact named by `design_artifact` with the sections under Output. Use those heading strings. A second heading with a different name does not satisfy the checker.
6. For every contract, write the success and at least one named rejection. Say what does not change on rejection.
7. Write at least four edge cases. Include empty or illegal input, a duplicate or retry, and one case where the surrounding state changed under the operation.
8. Write at least three races. Each race names two parties and one outcome. "Handle carefully" is not an outcome.
9. Write at least three risks. Each risk has an impact and a mitigation that is a specific check, order, or stored result. A mitigation that repeats the risk does not count.
10. List at least three exclusions under Out of scope. Acceptance then states observable results, not implementation steps.
11. Run the checker from a checkout of this pack. Replace `<skill-pack>` and `<change>` with the paths you actually have. Do not invent a machine path.

```bash
node <skill-pack>/sdd-design-writer/scripts/check-design.mjs <change>/design.md
```

12. If the checker is not on disk, walk the validation checklist yourself and say that the script was not run.
13. Stop. Tell `authority` the note is ready. Do not run `sdd next`, `sdd gate approve`, or `sdd team signoff` unless the person asked you to advance.

`sdd next` only checks that the file is substantive. It does not check these headings. The checker does. The skeleton in `assets/design.md` keeps its instructions in HTML comments and its visible body as dashes, so both the checker and `sdd next` reject it. A short paragraph with none of the tables can still pass `sdd next`. It does not pass the checker. `VALIDATION.md` records both results.

When `SDD_ROLE_MODEL` drafts through `sdd go`, the guide still asks only for the bundled template headings. Use this skill when you write the file yourself. Do not rewrite the role file to force the guide.

## Output

The finished note starts with `# Design` and then these level-2 headings, in this order:

1. Approach. One paragraph, at least 400 characters, including the word because.
2. Components / modules. A table with columns `Component` and `Responsibility`. At least three rows. Say what each part must not own when that boundary matters.
3. Data flow. At least three numbered steps. Each step says who acts and what is stored or rejected.
4. Contracts. A table with columns `Operation`, `Success`, and `Rejection`. At least three operations.
5. Alternatives considered. At least two `###` headings. Each one says why it lost, using because. End with a line that starts `Chosen:` and includes because.
6. Edge cases. A table with columns `Case` and `Handling`. At least four rows.
7. Race conditions. A table with columns `Race`, `Parties`, and `Outcome`. At least three rows. `Parties` names both sides with the word and. `Outcome` says who wins, what is rejected, or what stays unchanged.
8. Risks and mitigations. A table with columns `Risk`, `Impact`, and `Mitigation`. At least three rows.
9. Out of scope. At least three bullets.
10. Acceptance. A table with columns `Scenario` and `Expected`. At least four rows. `Expected` is something a person can observe.

The skeleton with those headings is `skills/sdd-design-writer/assets/design.md`. It is not a finished design. The checker must fail it.

Do not leave `TBD`, `TODO`, `FIXME`, a lone dash, or `{{...}}` in a finished note.

## Never

- Do not write product code, generate a release, push, or open a pull request.
- Do not accept the spec, sign a gate, or edit the constitution.
- Do not invent a module path, a table name, a queue, a command, an engine, or a vendor that is not in the change, the constitution, or the skill config.
- Do not copy a worked example into a real change.
- Do not drop an edge case, a race, or a mitigation to make the note shorter.
- Do not put secrets, tokens, account names, or machine paths in the note.
- Do not weaken a constitution sentence to fit the design.
- Also follow every entry in `banned_actions`.

## Ask a human

Ask one question and stop when:

- The reading is still a template, or it could mean two products.
- The constitution conflicts with the request.
- `persistence` is empty and you would otherwise name a store.
- Two alternatives are still tied after the trade-off.
- You cannot state a single outcome for a race.
- The person has not accepted the design and the next step would advance the stage.
- The skill config is missing and you would otherwise guess a product name, a path, or a command.

The question names the decision you need. Do not attach a guessed design underneath it.

## Validation checklist

- [ ] The first line is `# Design`, and every heading in Output is present once.
- [ ] Approach names the mechanism and says why, with because.
- [ ] Components, contracts, edge cases, races, risks, and acceptance use the columns named above and meet the minimum row counts.
- [ ] Every rejection says what stays unchanged.
- [ ] Every race has two parties and one outcome.
- [ ] Every risk has a mitigation that is not a restatement of the risk.
- [ ] Out of scope has at least three real exclusions.
- [ ] No `TBD`, `TODO`, `FIXME`, lone dash, or `{{...}}` remains.
- [ ] No engine, vendor, source path, or command appears unless the constitution or the skill config already named it.
- [ ] `node <skill-pack>/sdd-design-writer/scripts/check-design.mjs <change>/design.md` printed `ok`, or you recorded that the script was not run and this list was checked by hand.

## Worked examples

Both examples are hypothetical. They are fiction used to test this skill. Do not copy them into a product repository as that product's design.

- Inventory stock reservation: `skills/sdd-design-writer/examples/inventory-stock-reservation/design.md`, read next to its `feature.md`.
- Offline notes sync: `skills/sdd-design-writer/examples/offline-notes-sync/design.md`, read next to its `feature.md`.

The evidence from running the checker and from advancing a real `sdd` feature change with each file is in `skills/sdd-design-writer/VALIDATION.md`.
