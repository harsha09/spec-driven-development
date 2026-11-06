---
name: sdd-constitution-interview
description: Fill memory/constitution.md one section at a time using only the person's answers. Use when the constitution is still a skeleton or the person asks to revise a named section. Does not invent bans and does not edit the constitution during refine.
---

# Constitution interview

## Purpose

Turn the constitution skeleton into sentences the person actually said. The file is the constraint later skills read. An interview that adds a ban the person did not say makes later work look forbidden when it is not.

`sdd refine` already refuses to edit the constitution. This skill does not run during refine. It runs when the person is setting or revising that file.

## When to use

Use it when `constitution.md` is still the empty template, or when the person names one section to change. Do not use it to slip a rule into the file during a feature, and do not use it to copy another product's constitution.

## Configuration

Read `.sdd/skill-config.yaml`. Keys are listed in `skills/product-config.md`.

| Key | When it is empty |
| --- | --- |
| `constitution_path` | Use `memory/constitution.md`. |
| `authority` | Only the person answers. |
| `tools` and `verify_commands` | You may write a command into the constitution only after the person says that command. |
| `banned_actions` | You may record one only after the person says it. Do not seed the file from this list on your own. |

## Procedure

1. Read the file. A section that already has prose is left alone unless the person named that section.
2. Ask one question for one section, then wait. The sections in the shipped skeleton are Principles, Stack & tooling, Testing, Security, and Process.
3. Use these questions, one at a time. Do not add a second question in the same turn.
   - Principles: What must stay true even when a change is late?
   - Stack & tooling: Which runtime, package manager, and test command should agents treat as given? Say none if you do not want one recorded.
   - Testing: What evidence does a change need before you will look at it?
   - Security: What must an agent never do with data, secrets, or access? I will write only what you say.
   - Process: Who accepts a spec, and which sdd stages does a person sign?
4. Write the answer in the person's words under that heading. If they say none, write "None stated." Do not add an example ban.
5. Stop after that section so they can correct it. Do not fill the next heading in the same turn.
6. If the new sentence conflicts with a sentence already in the file, show both and ask. Do not delete the old sentence yourself.

## Output

The shipped skeleton stays the shape of the file:

```markdown
# Constitution

## Principles

The person's words.

## Stack & tooling

The person's words, or None stated.

## Testing

The person's words.

## Security

The person's words. Nothing they did not say.

## Process

The person's words.
```

Write only the section you asked about. Leave the other headings as they were.

## Never

- Do not edit the constitution as part of `sdd refine` or as a side effect of a change.
- Do not invent a ban, a tool, a runtime, or a vendor.
- Do not copy rules from another repository or from a worked example.
- Do not put secrets, tokens, or account names in the file.
- Do not weaken or delete an existing sentence unless the person told you to replace that sentence.
- Also follow `banned_actions` for your own actions. Do not dump that list into the constitution unless the person asked to record a specific line.

## Ask a human

Ask before the first write. Ask again when an answer conflicts with a sentence already in the file. Ask when they name a section that is not in the file, and do not invent the heading until they confirm it.
