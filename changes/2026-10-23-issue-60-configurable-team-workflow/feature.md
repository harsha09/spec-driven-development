# Feature

> **Issue 60 configurable team workflow** · `2026-10-23-issue-60-configurable-team-workflow` · 2026-10-23

## Reading

A workflow file can name any stages, the file each stage writes, the role that produces it, the roles who work with that producer, and the roles who approve the gate. The shipped example is the software team: requirements, architecture, stories, plan, tasks, implement, pull-request review, and acceptance. Requirements and acceptance keep a human sign-off. When implement starts, each task file becomes one item.

## Source

Issue #60, as filed. The product manager proposes this reading. It is not an acceptance. The person accepts or corrects it.

## Product owner

The issue already names the stages, the task file `tasks/T-001.md`, and human sign-off on requirements and acceptance. That request is one product. The question for the person is whether this reading leaves a stage or a sign-off out.

Proposed checks, not a recorded decision:

- A stage can set `owner` and `collaborates`. A gate can set `approvers`. Packs that omit those fields still load.
- `team-software` has those eight stages. Requirements and acceptance are hard gates for the person. The other gates do not block by themselves.
- The example writes `stories/S-001.md`, `tasks/T-001.md`, and `reviews/R-001.md`, plus `plan.md`.
- Entering implement writes one open item in `items.yaml` per `tasks/T-*.md` file. The same id keeps a `done` status on a later sync.
- This change does not add a QA role. That gap is issue #72.

## Non-goals

- No router, inbox, or model choice. Those are issues #61 and #62.
- No approval matrix and no review tied to a commit SHA. That is issue #63.
- A role still cannot accept a spec, record a QA result, or generate a release.
