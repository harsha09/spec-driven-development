---
name: sdd-qa-writer
description: Turn acceptance scenarios into steps a person can run, and list the evidence to attach. Use at test planning or QA. Does not record a pass, sign, or accept the spec.
---

# QA writer

## Purpose

Propose scenarios and the evidence a person can attach. The shipped QA role already says the person records the result. This skill keeps that rule. It does not write a pass, and it does not sign.

On `team-software`, `qa-testing.md` is the note and the template headings are Tried and Not tried. Keep those headings. Leave Tried for the person.

## When to use

Use it when the stage is `test_plan` or `qa_testing`, or when a person asks for scenarios. Do not use it to implement a fix you found, and do not use it to record the result of a run.

## Configuration

Read `.sdd/skill-config.yaml`. Keys are listed in `skills/product-config.md`.

| Key | When it is empty |
| --- | --- |
| `qa_artifact` | Write `qa-testing.md` when that stage exists, otherwise `qa.md` in the change. |
| `design_artifact` | Read the Acceptance section of `design.md`. |
| `verify_commands` | List them as the commands the person can run. Do not run them yourself unless they are also in `tools` and the person asked. |
| `authority` | The person records the result. |
| `banned_actions` | Extra never-rules. |

## Procedure

1. Read the design Acceptance table and the constitution. A scenario that fights the constitution is a question, not a test you quietly drop.
2. Turn each acceptance row into steps a person can follow on this product. Use the environment the person already described. If there is no environment, ask. Do not invent seed data.
3. Under each scenario, name the evidence to keep: the command from `verify_commands`, or the screen the person should quote. Do not fill in the result.
4. Write Tried as a single sentence: the person has not recorded a result. Write Not tried as the exclusions from the design's Out of scope, plus any acceptance row you could not turn into steps.
5. Stop. The person records the result in their own words. On `team-software` they sign with `sdd team signoff`.

## Output

Keep the shipped headings so a required `qa-testing.md` is still that note.

```markdown
# QA testing

## Proposed scenarios

| # | Scenario from the design | Steps the person can run | Evidence to attach |
| --- | --- | --- | --- |
| 1 | Unchanged scenario text | Steps | The command or the screen, not a result |

## Tried

The person has not recorded a result.

## Not tried

- Exclusions and any scenario that has no steps yet.
```

Hypothetical fragment: "two concurrent reserves of one unit" stays a proposed scenario until the person pastes the two results. Do not write Pass next to it.

## Never

- Do not record a pass or a fail. That sentence belongs to the person.
- Do not accept the spec, sign, or generate a release.
- Do not change product code while writing the note.
- Do not invent a command that is not in `verify_commands`.
- Do not delete a design scenario because it is awkward.
- Also follow `banned_actions`.

## Ask a human

- The design has no Acceptance section.
- The scenario needs an account, a warehouse, or a device the person has not described.
- A design row cannot be run in this change. Ask whether it moves to Not tried. Do not decide alone.
