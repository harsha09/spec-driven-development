---
title: sdd prompts and reply kinds
description: How every sdd prompt is built, which reply kinds each prompt offers, and how long the old reply shapes are still read.
---

# Prompts and reply kinds

Every prompt that goes to a model, and whose reply sdd reads, follows one standard. This page is for people who change those prompts or their replies.

## One prompt standard

`buildPrompt` in `packages/core/src/prompt.ts` makes every shipped prompt, with these sections in this order:

1. **Role**: who the model is, its job, its playbook.
2. **Scope**: what the role owns, reads, may never do, and when it asks the person.
3. **Task**: what to do now, numbered, with a "Done when" line.
4. **Inputs**: every file, answer and tool result. Each is a fenced block marked untrusted data.
5. **Guardrails**: shared rules, then the rules of that prompt.
6. **Style**: plain English, one reply object.
7. **Output contract**: the reply format, last, next to where the model writes. It is generated from the zod schema the parser reads with, with valid examples and one invalid example.

The wording of each prompt is in `role/prompts.ts` (and `team/brain.ts` for the loop). Snapshots in `packages/core/src/__tests__/__snapshots__/prompts/` pin the full text.

## Reply kinds

Every reply is one JSON object with a `kind`. Each prompt offers a closed list of kinds, and a reply whose kind is not on the list gets one repair try. The schemas are in `reply-schemas.ts` and `team/loop-contract.ts`. The reader is `readKinded` in `reply-kind.ts`.

| Kind | Offered by | Shape | Meaning |
|------|------------|-------|---------|
| `draft` | author, hand-off receiver, network owner, guide | `{kind, text, action?}`; the guide also sends `parts?` | The model's answer, and at most one `write_file` action for a person to approve |
| `question` | author in a guided run, network owner at a `boundary: ask` node, guide | `{kind, text}` | One question for the person. The run waits for the answer. Any parts or action sent with it are ignored |
| `critique` | critic | `{kind, text, gaps?}` | A verdict and the gaps found. Each gap cites a check id |
| `revision` | author, in a revision | `{kind, text, changed, open?, action?}` | The full revised draft, the cites fixed, and the cites left open |
| `post` | room | `{kind, text, cite?}` | A note or an answer |
| `objection` | room | `{kind, text, cite}` | The draft breaks a check or a rule. A cite is required |
| `agree` | room | `{kind, text, cite?}` | The draft is accepted. When the stage has verify commands, the cite is the evidence path for this commit |
| `block` | room | `{kind, text, cite?}` | The model cannot go on until the person decides |
| `plan` | loop | `{kind, items}` | The steps the bot will take |
| `tool` | loop | `{kind, name, args?}` | One tool call. The result comes back on the next turn |
| `check` | loop | `{kind, claim, evidence?}` | A claim about the work. A claim that something passes needs evidence |
| `ask` | loop | `{kind, question, options, suggest?}` | Stop and ask the person one question |
| `done` | loop | `{kind, summary, outputs, evidence?}` | Finish the work |
| `plan_tree` | lead | `{kind, text, plan}` | A plan of services, owners and decisions, at most two levels deep |

Rules that hold for every kind:

- The model never sends a room `decision`. Only a person records one. A reply that names it is repaired.
- A prompt offers only its own kinds. The kind `question` is offered only where the run can wait for an answer. At a `boundary: stop` node a `question` is read as the node's result.
- A key a schema does not list is dropped, not refused. A loop step is stricter: an unknown key in a step makes it not valid, as before.
- Inside the run, a question is stored as `text` with one `Question:` prefix, whichever form arrived. Nothing downstream of the reader changed.
- Two loop kinds, `understand` and `reflect`, are read as steps that do almost nothing. No prompt offers them, so they are not kinds a model should send.

## Old shapes are still read

Before `kind`, each reply had its own shape. Those shapes are still read, for one minor release, so a model, a script or an `SDD_ROLE_MODEL` adapter written for the old prompts keeps working.

| Old shape | Read as | `shape` in the log |
|-----------|---------|--------------------|
| `{text, action?}` with no `kind` | `draft` | `no_kind` |
| `{text: "Question: ..."}` with no `kind` | `question` | `no_kind` |
| `{text, parts?}` with no `kind` (guide) | `draft`, or `question` for a `Question:` text | `no_kind` |
| `{text, gaps}` with no `kind` | `critique` | `no_kind` |
| `{text, changed, open?}` with no `kind` | `revision` | `no_kind` |
| `{text, plan}` with no `kind` | `plan_tree` | `no_kind` |
| `{type: "post" \| "objection" \| "agree" \| "block", text, cite?}` | the same word as the `kind` | `type` |
| `{step: "plan" \| "tool" \| "check" \| "ask" \| "done", ...}` | the same word as the `kind` | `step` |
| `{step: "stop", ...}`, `{step: "act", ...}`, `{"text": ...}` in the loop | `done`, `tool`, `done` | `stop`, `act`, `text` |

A reply that has a `kind` is never treated as an old shape. A reply with a `kind` and the old key (`type` or `step`) is not valid for a loop step, and the old key is dropped for a room entry.

### The `legacy_shape` log line

Each old shape that is read is logged as one line, once per run for each shape:

```json
{"type":"legacy_shape","roleId":"builder","shape":"no_kind","kind":"draft"}
```

`kind` is the kind of the first reply that used the shape. A run is one role run, one loop run, one hand-off, one room round, one lead plan, or one `sdd go` call.

- A role run, a loop run, a hand-off receiver and a network owner write the line to their own run log (`.sdd/role-runs/conversation/<role>/<run>.jsonl`).
- A room round, a lead plan and `sdd go` have no run log. They write the line, with a `ts` time, to `.sdd/role-runs/legacy-shapes.jsonl`.

Count the lines to see whether anything still sends an old shape:

```bash
grep -h '"legacy_shape"' .sdd/role-runs/legacy-shapes.jsonl .sdd/role-runs/conversation/*/*.jsonl
```

### When they go

The old shapes are read through the 0.25 release line. They are removed in the next minor release (0.26.0) or later, and only if the log shows no hits in the dogfood runs. The removal is its own commit. A plain one-line text reply in a room is not an old shape: it is still typed by the entry classifier.

## Change a reply

1. Change the zod schema. The prompt text is generated from it.
2. Keep the valid examples and the invalid example passing their own schema (`prompt-standard.test.ts` checks this).
3. If a kind is added, add it to this page. `reply-kinds.test.ts` fails when a kind that a prompt offers is missing here.
4. Regenerate the snapshots with `pnpm exec vitest run -u` in `packages/core`, and read the diff.
