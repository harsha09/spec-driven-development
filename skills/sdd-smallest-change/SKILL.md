---
name: sdd-smallest-change
description: Implement only the accepted design and tasks, one observable behavior at a time, and record what was deliberately left alone. Use on the implement stage after a person has accepted the design. Does not accept the spec or generate a release.
---

# Smallest-change implementer

## Purpose

Change the smallest set of lines that makes one accepted scenario true, then the next. Leave a note that says what changed, what did not, and which allowed commands were run. A drive-by refactor is a different change.

This is the procedure for the builder duty and for the software-team developer. The role files `sdd setup` and `sdd team init` write stay as they are. Those files still say the person accepts the spec and the role does not generate a release.

## When to use

Use it on `implement` after the design is accepted. Do not use it while the design is still a skeleton, while a race has no outcome, or when the person has not accepted the approach.

## Configuration

Read `.sdd/skill-config.yaml`. Keys are listed in `skills/product-config.md`.

| Key | When it is empty |
| --- | --- |
| `authority` | The person accepts. You do not. |
| `design_artifact` | Read `design.md`. |
| `module_roots` | Ask before creating or editing a source file. Do not guess a directory. |
| `tools` | Do not run formatters, generators, or package installers that are not listed. |
| `verify_commands` | Do not invent a test command. Record that no verify command was configured. |
| `persistence` | Do not add a store the design did not already describe. |
| `banned_actions` | Extra never-rules. |

## Procedure

1. Read the constitution, the design, and `tasks.md` when it exists. The design wins over a task that contradicts it. Ask when they disagree.
2. List the files you expect to touch. If `module_roots` is non-empty, every file must sit under one of those directories. A file outside them is a question, not an exception you take.
3. Pick the first acceptance scenario that is not yet true. Make the smallest edit that makes that scenario true. Do not format or rename unrelated code in the same edit.
4. Do not add a dependency, a service, or a migration the design or the constitution did not name.
5. Run `verify_commands` in the order the product wrote them. Record the exit status and the lines that show pass or fail. A command that is not listed is not run.
6. Write the implementation note. Include the scenarios you made true and the ones you did not touch.
7. Stop before `sdd complete`, push, or a pull request unless the person asked for that next.

## Output

Write the file named by `implementation_note`, or `implementation-note.md` when the key is empty. The CLI does not require this file. `sdd next` on implement still has no required artifact. The note is how the next reader sees the size of the change.

```markdown
# Implementation note

## Changed

- Path and the scenario it serves.

## Left alone

- Nearby behavior you did not change, and why.

## Commands

| Command | Exit | What the output showed |
| --- | --- | --- |
| The verify command, copied from config | 0 or other | One line from the output, or "not configured" |
```

## Never

- Do not accept the spec, sign a gate, or generate a release.
- Do not push, merge, or open a pull request unless the person asked.
- Do not expand scope because a nearby cleanup looks small.
- Do not add a dependency the design or the constitution did not name.
- Do not run a command outside `tools` and `verify_commands`.
- Do not edit the constitution.
- Also follow `banned_actions`.

## Ask a human

- The design is silent on the behavior you would otherwise invent.
- A task contradicts the design.
- `module_roots` is empty and more than one directory could own the change.
- A verify command is missing and the person expects evidence.
- The smallest edit that satisfies the scenario also forces a public contract change the design did not list.
