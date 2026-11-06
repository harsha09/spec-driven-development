---
name: sdd-acceptance-gate
description: Compare a change's evidence to the design's acceptance rows and write a gate note the person can accept or reject. Use after implementation, before a person signs. Does not sign, waive, or rewrite expected results.
---

# Acceptance gate

## Purpose

Judge each acceptance scenario against evidence. Write what is met, what is not met, and what was not run. The person named by `authority` decides. This skill prepares the page. It does not sign it.

The patch workflow already has an `acceptance` stage and `acceptance.md`. The feature workflow keeps acceptance inside `design.md` until a person adds a separate note. Use the design's Acceptance section as the list of scenarios. When `acceptance.md` also exists and the two disagree, ask before treating the thinner file as a waiver.

## When to use

Use it when implementation is done and a person wants to know whether the change meets the design. Do not use it to invent scenarios the design never stated, and do not use it on a hotfix that has no acceptance note unless the person asks for one.

## Configuration

Read `.sdd/skill-config.yaml`. Keys are listed in `skills/product-config.md`.

| Key | When it is empty |
| --- | --- |
| `authority` | The person (`human`) decides. |
| `design_artifact` | Read `design.md` in the active change. |
| `acceptance_artifact` | Read `acceptance.md` when the workflow has that file. |
| `verify_commands` | You have no command whose output counts as evidence. Ask the person for the output, or mark the row not run. |
| `banned_actions` | Extra never-rules. They do not remove the list below. |

## Procedure

1. Read the constitution. If a scenario would violate it, stop and ask. Do not weaken the constitution.
2. Read the Acceptance table in the design. If it is missing or still a skeleton, stop and use the design writer. Do not invent expected results.
3. Read `acceptance.md` when it exists. Disagreement with the design is a question, not a chance to delete a row.
4. For each scenario, use only evidence you can point at: output from a command listed in `verify_commands`, or an observation the person already wrote down. Your own confidence is not evidence.
5. Mark the row `met`, `not met`, or `not run`. A `not run` is not a pass. A waiver is a sentence the person writes. Do not write it for them.
6. Write the gate note under Output. Leave the design's Expected column unchanged.
7. Stop. Tell `authority` which rows are met, not met, and not run.

On `team-software`, the person still signs with `sdd team signoff`. This skill does not run that command.

## Output

Write this into the acceptance artifact when the workflow has one. Otherwise write `acceptance-gate.md` in the change directory and say that the CLI did not require that file.

```markdown
# Acceptance gate

## Rows

| # | Scenario | Expected | Evidence | Result |
| --- | --- | --- | --- | --- |
| 1 | From the design, unchanged | From the design, unchanged | Command or "person wrote: ..." or "not run" | met, not met, or not run |

## Not run

- Scenario numbers that have no evidence, and what is missing.

## Disagreements

- Design versus acceptance.md, or none.
```

Hypothetical fragment, not a product result: a reserve of the last unit is `not run` until someone captures the two concurrent calls. Do not fill that fragment into a real change.

## Never

- Do not sign, waive, approve a gate, or run `sdd team signoff`.
- Do not change an Expected cell so a failing run looks successful.
- Do not mark `met` without evidence you can quote.
- Do not run a command that is not in `verify_commands` or `tools`.
- Do not drop a scenario because it is hard to run.
- Also follow `banned_actions`.

## Ask a human

- A scenario has no evidence and the person must run it.
- The design and `acceptance.md` disagree.
- A row conflicts with the constitution.
- The person wants to waive a row. Ask them to write the waiver. Do not draft a pass underneath the question.
